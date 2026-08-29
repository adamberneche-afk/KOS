/**
 * LeaderHub — singleton config domains (server-migration Phase 3)
 *
 * A "singleton config domain" is a small settings object leader-hub keeps
 * in one localStorage key — Profile, Modules, Schedule Config, Key
 * Contacts, and so on — as opposed to a growing multi-record list (trips,
 * roster, scores, ...), which gets its own real Spreadsheet tab in a later
 * phase with proper conflict handling. These are simple enough to live as
 * one JSON-stringified Script Property each, keyed by their own
 * localStorage key name so the mapping is obvious on both sides.
 *
 * LH_CONFIG_KEYS is the single whitelist driving every check below — the
 * same "one table, not several that could drift" shape as
 * EmailBridge.gs's _lhDispatchAction_(). Adding a new server-synced config
 * domain later means adding one string here, nothing else.
 *
 * Client side: leader-hub/src/05-data-helpers-dashboard.html's LS.set()
 * calls _lhSyncConfigKeyToServer_() for any key in this same list (client
 * keeps its own copy of the list — see that file — since it can't require()
 * this one), which calls lhSaveConfig_() below via google.script.run. This
 * is write-through, not a replacement for localStorage: a failed sync logs
 * a console warning and localStorage still has the value — nothing here
 * blocks a save or risks losing an edit if the round trip fails.
 * lhRefreshConfigFromServer_() (same client file) pulls lhGetAllConfig_()
 * once at boot to catch up on anything saved from a different browser/
 * device since this one last opened the app.
 */

const LH_CONFIG_KEYS = [
  'lh_profile',
  'lh_modules',
  'lh_schedule_config',
  'lh_custom_orgs',
  'lh_custom_courses',
  'lh_keyContacts',
  'lh_student_id_map',
  'lh_cas_ccps_api_url',
  'lh_cas_ccps_oauth_client_id',
  'lh_sub_settings',
  'lh_sub_period_assignments',
  'lh_sbe_status',
  'lh_deca_season',
  'lh_deca_approvals',
  'lh_ftp_overrides',
  'lh_conf_leave',
  'lh_mk8_check',
  'lh_ssbu_check',
  'lh_obs_prep',
  'lh_sync_tracker',
  'lh_sub_student_notes',
  // Added during Phase 5 (server-migration): both are map-shaped (keyed by
  // tripId / orgId respectively), not a flat growing list of independent
  // records, so they fit this singleton-JSON-blob mechanism better than
  // Data.gs's array-of-records one — see leader-hub/Data.gs's own header
  // comment for that distinction.
  'lh_slip_rosters',
  'lh_org_results',
  // Added during Phase 6 (server-migration): Course Catalog / SCR support
  // data, all map-shaped (keyed by course code, or unitId_course, or a
  // student key) — SCR's actual scores live in leader-hub/SCR.gs's own
  // long-format Spreadsheet tab instead (thousands of cells, edited one
  // at a time — see that file's header comment for why it needs a
  // different shape entirely from everything else here).
  'lh_custom_pacing_units',
  'lh_cas_pacing_notes',
  'lh_scr_student_emails',
  // Added during Phase 7 (server-migration): map-shaped (keyed by
  // purchase-order id) — the WBL/Store/E-Sports domains with real `id`
  // fields (roster, inventory, sales log, purchase orders, esports
  // roster/matches) live in leader-hub/Data.gs's row-shaped mechanism
  // instead; see this project's migration plan for lh_wbl_hours_log,
  // deliberately NOT migrated here (its log entries have no `id` field
  // and are capped at 200 — a synthetic id from a timestamp was judged
  // more fragile than leaving this one small log local-only for now).
  'lh_receiving_status',
  // Added during Phase 8 (server-migration): the Horizon system uses its
  // own {short:[], mid:[], long:[]} buckets — not a flat list of
  // independent records with a shared shape the way Data.gs expects, so
  // this fits the singleton-JSON-blob mechanism instead.
  'lh_horizon',
  // Added during Phase 9 (server-migration): Lesson Plan content edits,
  // both keyed by a lesson/unit identifier rather than a flat record list.
  'lh_lp_edits',
  'lh_lp_edit_meta',
];

// Namespaced so these can never collide with OWNER_EMAIL, AI_QUEUE_SHEET_ID,
// ORG_SYNC_SHEET_ID, or any other Script Property this project already uses
// or will use — a plain "lh_profile" property name would be one accidental
// rename away from silently colliding with something else script-wide.
function _lhConfigPropName_(key) {
  return 'LH_CONFIG__' + key;
}

function lhSaveConfig_(key, value) {
  if (LH_CONFIG_KEYS.indexOf(key) === -1) {
    return { ok: false, error: 'Unknown config key: ' + key };
  }
  PropertiesService.getScriptProperties().setProperty(_lhConfigPropName_(key), JSON.stringify(value));
  return { ok: true };
}

function lhGetConfig_(key) {
  if (LH_CONFIG_KEYS.indexOf(key) === -1) return null;
  const raw = PropertiesService.getScriptProperties().getProperty(_lhConfigPropName_(key));
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// One round trip for the boot-time refresh instead of 20 — see
// lhRefreshConfigFromServer_() client-side.
function lhGetAllConfig_() {
  const out = {};
  LH_CONFIG_KEYS.forEach(function (k) {
    out[k] = lhGetConfig_(k);
  });
  return out;
}
