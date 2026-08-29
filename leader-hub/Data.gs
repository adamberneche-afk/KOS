/**
 * LeaderHub — row-shaped data domains (server-migration Phases 5+)
 *
 * A "row-shaped domain" is a growing multi-record list (trips, roster,
 * scores, goals, ...) as opposed to a small singleton settings object
 * (see Config.gs for those). One private "LeaderHub Data" Spreadsheet
 * (LH_DATA_SHEET_ID script property, lazily created the same way
 * EmailBridge.gs's AI Queue/Org Sync spreadsheets already are) holds one
 * tab per domain, named in LH_DATA_TABS below — the single whitelist that
 * drives every check here, same "one table, not several that could
 * drift" shape as Config.gs's LH_CONFIG_KEYS and EmailBridge.gs's
 * _lhDispatchAction_().
 *
 * ACCESS MODEL — deliberately different from Organization Sync. This
 * Spreadsheet is never shared with anyone: it's created and owned by
 * whichever Google account deploys this Web App ("Execute as: Me"), and
 * the Web App itself is gated to that same one owner (Code.gs's
 * OWNER_EMAIL check via Session.getActiveUser()). There is no "hand
 * someone else this URL and they can read your roster" path for any
 * domain here, unlike Organization Sync's deliberate co-advisor-sharing
 * feature (EmailBridge.gs's pushOrgSync_/pullOrgSync_, a genuinely
 * different Spreadsheet with a genuinely different purpose). That
 * distinction is why these domains sync automatically once deployed, with
 * no separate per-domain opt-in the way Settings → Organizations →
 * "Share with a co-advisor" requires — see the migration plan's Phase 4
 * commit message for the full reasoning.
 *
 * Same wholesale-tab-rewrite-on-save, real-rows-not-a-JSON-blob, and
 * optimistic-concurrency compare-and-swap conflict model EmailBridge.gs's
 * Org Sync already proved out (_writeOrgDataTab_/_readOrgDataTab_/
 * pushOrgSync_) — this is that same shape, generalized to one shared
 * spreadsheet with a domain name in place of an orgId. Conflict handling
 * matters even for a single-owner deployment: "single owner" doesn't mean
 * "single browser tab" — the same person editing from two devices, or two
 * tabs left open, is exactly the case compare-and-swap catches. Unlike
 * Org Sync's user-initiated push/pull (with an interactive conflict
 * dialog), these pushes happen automatically in the background — so a
 * rejected push here fails closed (nothing is overwritten, ever) and
 * leaves the edit safe in the browser's own localStorage rather than
 * popping a dialog for a sync the user didn't consciously trigger; see
 * the client-side lhSyncDataDomain_() for how that's surfaced.
 */

const LH_DATA_TABS = [
  'trips', 'trip_archive', 'deca_results',
  // Phase 7
  'wbl_roster', 'store_inventory', 'store_sales_log', 'store_purchase_orders',
  'esports_players', 'esports_matches',
  // Phase 8 — deliberately NOT here: lh_daily_log, lh_sub_plan_log,
  // lh_brag_log, lh_wbl_hours_log (Phase 7), lh_inventory_transactions
  // (Phase 7) — none of their entries have an `id` field, and a synthetic
  // one derived from a timestamp was judged more fragile (a same-
  // millisecond double action could silently dedupe two real entries into
  // one) than leaving these already-capped, lower-stakes logs local-only.
  'goals', 'events', 'tasks', 'deadlines', 'journal_entries',
  'observation_history', 'brag_manual_wins',
];

const LH_DATA_SHEET_PROP = 'LH_DATA_SHEET_ID';
const LH_DATA_META_TAB = '_lh_data_meta'; // one row per domain: Domain, UpdatedAt, UpdatedBy

function _getLhDataSpreadsheet_() {
  const prop = PropertiesService.getScriptProperties();
  let id = prop.getProperty(LH_DATA_SHEET_PROP);
  let ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } // deleted/moved — rebuild below
  }
  if (!ss) {
    ss = SpreadsheetApp.create('LeaderHub Data');
    prop.setProperty(LH_DATA_SHEET_PROP, ss.getId());
  }
  return ss;
}

function _getLhDataMetaSheet_() {
  const ss = _getLhDataSpreadsheet_();
  let sheet = ss.getSheetByName(LH_DATA_META_TAB);
  if (!sheet) {
    // First tab ever created in a brand-new Spreadsheet is the default
    // "Sheet1" — repurpose it rather than leaving a stray empty tab
    // around, same convention as EmailBridge.gs's _getOrgMetaSheet_.
    const existing = ss.getSheets();
    sheet = (existing.length === 1 && existing[0].getLastRow() === 0) ? existing[0] : ss.insertSheet(LH_DATA_META_TAB);
    sheet.setName(LH_DATA_META_TAB);
    sheet.appendRow(['Domain', 'UpdatedAt', 'UpdatedBy']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _findLhDataMetaRow_(sheet, domain) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === domain) return { rowIndex1: i + 1, row: data[i] };
  }
  return null;
}

// Client sends its own header row on every push; the server never
// hardcodes a domain's field shape, so a client-side schema change never
// needs a matching server-side change — identical rationale to
// EmailBridge.gs's _writeOrgDataTab_/_readOrgDataTab_, generalized here to
// any tab name instead of an org-scoped one.
function _writeLhDataTab_(ss, tabName, headers, rows) {
  let sheet = ss.getSheetByName(tabName);
  if (!sheet) sheet = ss.insertSheet(tabName);
  sheet.clear();
  if (headers && headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  if (rows && rows.length) {
    // Pad/trim every row to the header width so setValues doesn't throw on
    // a ragged 2D array — the client is trusted to send matching widths,
    // but a defensive normalize costs nothing and avoids an opaque GAS error.
    const width = headers && headers.length ? headers.length : (rows[0] || []).length;
    const normalized = rows.map((r) => {
      const row = r.slice(0, width);
      while (row.length < width) row.push('');
      return row;
    });
    sheet.getRange(2, 1, normalized.length, width).setValues(normalized);
  }
}

function _readLhDataTab_(ss, tabName) {
  const sheet = ss.getSheetByName(tabName);
  if (!sheet || sheet.getLastRow() < 1) return { headers: [], rows: [] };
  const data = sheet.getDataRange().getValues();
  return { headers: data[0] || [], rows: data.slice(1) };
}

/**
 * Push a domain's full current rows. `expectedUpdatedAt` (the pusher's
 * last-known remote UpdatedAt for this domain) is checked with the same
 * compare-and-swap EmailBridge.gs's pushOrgSync_ already uses: a mismatch
 * — or a missing expectedUpdatedAt against a domain that already has a
 * remote row — is rejected with {conflict:true} and nothing is written.
 */
function lhPushData_(body) {
  const domain = body.domain || '';
  if (LH_DATA_TABS.indexOf(domain) === -1) return { ok: false, error: 'Unknown data domain: ' + domain };

  const ss = _getLhDataSpreadsheet_();
  const metaSheet = _getLhDataMetaSheet_();
  const existing = _findLhDataMetaRow_(metaSheet, domain);

  if (existing) {
    const remoteUpdatedAt = existing.row[1];
    if (!body.expectedUpdatedAt) {
      return {
        ok: false,
        conflict: true,
        remoteUpdatedAt: remoteUpdatedAt instanceof Date ? remoteUpdatedAt.toISOString() : remoteUpdatedAt,
      };
    }
    const remoteMs = new Date(remoteUpdatedAt).getTime();
    const expectedMs = new Date(body.expectedUpdatedAt).getTime();
    if (remoteMs !== expectedMs) {
      return {
        ok: false,
        conflict: true,
        remoteUpdatedAt: remoteUpdatedAt instanceof Date ? remoteUpdatedAt.toISOString() : remoteUpdatedAt,
      };
    }
  }

  _writeLhDataTab_(ss, domain, body.headers || [], body.rows || []);

  const now = new Date();
  const newRow = [domain, now, body.updatedBy || ''];
  if (existing) {
    metaSheet.getRange(existing.rowIndex1, 1, 1, 3).setValues([newRow]);
  } else {
    metaSheet.appendRow(newRow);
  }
  return { ok: true, updatedAt: now.toISOString() };
}

function lhPullData_(body) {
  const domain = body.domain || '';
  if (LH_DATA_TABS.indexOf(domain) === -1) return { ok: false, error: 'Unknown data domain: ' + domain };

  const ss = _getLhDataSpreadsheet_();
  const metaSheet = _getLhDataMetaSheet_();
  const existing = _findLhDataMetaRow_(metaSheet, domain);
  if (!existing) return { ok: true, found: false };

  const data = _readLhDataTab_(ss, domain);
  const updatedAtRaw = existing.row[1];
  return {
    ok: true,
    found: true,
    headers: data.headers,
    rows: data.rows,
    updatedAt: updatedAtRaw instanceof Date ? updatedAtRaw.toISOString() : updatedAtRaw,
    updatedBy: existing.row[2] || '',
  };
}
