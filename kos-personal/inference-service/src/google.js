'use strict';
// ================================================================
// google.js — Drive and Sheets access using per-user OAuth tokens
// ================================================================

const { google }       = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const db               = require('./db');

// ── OAuth client factory ─────────────────────────────────────────

function makeOAuthClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

/**
 * Returns an authenticated OAuth2 client for the given user.
 * Refreshes the access token if it has expired or is within
 * 5 minutes of expiry. Persists the new token to the database.
 *
 * @param  {Object} user  User row from the database.
 * @returns {OAuth2Client}
 */
async function getAuthClientForUser(user) {
  const oauth2 = makeOAuthClient();
  oauth2.setCredentials({
    access_token:  user.access_token,
    refresh_token: user.refresh_token,
    expiry_date:   user.token_expiry ? new Date(user.token_expiry).getTime() : null,
  });

  // Refresh if expired or within 5 minutes of expiry
  const expiryMs   = user.token_expiry ? new Date(user.token_expiry).getTime() : 0;
  const bufferMs   = 5 * 60 * 1000;
  if (!expiryMs || Date.now() >= expiryMs - bufferMs) {
    const { credentials } = await oauth2.refreshAccessToken();
    oauth2.setCredentials(credentials);
    await db.updateUserTokens(user.id, {
      accessToken: credentials.access_token,
      tokenExpiry: credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : null,
    });
  }

  return oauth2;
}

/**
 * Generates the Google OAuth authorization URL.
 * The user is redirected here when they click "Connect to KOS Inference."
 *
 * @param  {string} state  CSRF state token — generated and cookie-stored by
 *                         the /auth/connect route, validated on /auth/callback
 *                         before any code exchange. Required: without it,
 *                         nothing binds the callback to the browser/session
 *                         that started this flow (see server.js for the
 *                         attack this closes).
 * @returns {string} Authorization URL
 */
function getAuthUrl(state) {
  const oauth2 = makeOAuthClient();
  return oauth2.generateAuthUrl({
    access_type:   'offline',  // required for refresh_token
    prompt:        'consent',  // forces refresh_token to be returned every time
    state:         state,
    scope: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  });
}

/**
 * Exchanges an OAuth authorization code for tokens and user info.
 *
 * @param  {string} code  Authorization code from Google callback.
 * @returns {{ tokens, userInfo }}
 */
async function exchangeCodeForTokens(code) {
  const oauth2    = makeOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
  const { data: userInfo } = await oauth2Api.userinfo.get();

  return { tokens, userInfo };
}


// ── Drive document access ────────────────────────────────────────

/**
 * Reads the full plain text of a Google Doc from the user's Drive.
 *
 * @param  {Object} user    User row with OAuth credentials.
 * @param  {string} fileId  Google Drive file ID.
 * @returns {string} Plain text content of the document body.
 */
async function readDocumentText(user, fileId) {
  const auth    = await getAuthClientForUser(user);
  const docsApi = google.docs({ version: 'v1', auth });

  const { data: doc } = await docsApi.documents.get({ documentId: fileId });

  // Flatten the structured document body to plain text
  const text = (doc.body?.content || [])
    .flatMap(elem => {
      if (elem.paragraph) {
        return elem.paragraph.elements
          .map(e => e.textRun?.content || '')
          .join('');
      }
      if (elem.table) {
        return elem.table.tableRows
          .flatMap(row => row.tableCells
            .flatMap(cell => cell.content
              .flatMap(c => (c.paragraph?.elements || [])
                .map(e => e.textRun?.content || '')
              )
            )
          ).join('\t');
      }
      return '';
    })
    .join('');

  return text;
}

/**
 * Replaces the entire body of a Google Doc with new text.
 * Used to write the inference JSON back to the chunk document.
 *
 * @param  {Object} user     User row with OAuth credentials.
 * @param  {string} fileId   Google Drive file ID.
 * @param  {string} content  New content to write (the inference JSON string).
 */
async function writeDocumentContent(user, fileId, content) {
  const auth    = await getAuthClientForUser(user);
  const docsApi = google.docs({ version: 'v1', auth });

  // Get current document to find end index
  const { data: doc } = await docsApi.documents.get({ documentId: fileId });
  const endIndex = doc.body?.content?.slice(-1)[0]?.endIndex || 2;

  const requests = [];

  // Delete existing content (preserve the required trailing newline at index 1)
  if (endIndex > 2) {
    requests.push({
      deleteContentRange: {
        range: { startIndex: 1, endIndex: endIndex - 1 },
      },
    });
  }

  // Insert new content
  requests.push({
    insertText: {
      location: { index: 1 },
      text: content,
    },
  });

  await docsApi.documents.batchUpdate({
    documentId: fileId,
    requestBody: { requests },
  });
}


// ── STAGING_PIPELINE access ──────────────────────────────────────

/**
 * Updates the Status column of a STAGING_PIPELINE row to FLOW_COMPLETE.
 * Finds the row by Payload_UID to avoid index drift.
 *
 * Column map (1-indexed for Sheets API):
 *   A(1) Timestamp  B(2) Payload_UID  C(3) Payload_Type
 *   D(4) Doc_URL    E(5) File_ID      F(6) Status  G(7) Retry_Count
 *
 * @param  {Object} user           User row with OAuth credentials.
 * @param  {string} spreadsheetId  BRAIN_TRUST_INDEX spreadsheet ID.
 * @param  {string} payloadUid     Payload_UID of the row to update.
 */
async function setFlowComplete(user, spreadsheetId, payloadUid) {
  const auth       = await getAuthClientForUser(user);
  const sheetsApi  = google.sheets({ version: 'v4', auth });

  // Read the STAGING_PIPELINE sheet to find the row
  const { data } = await sheetsApi.spreadsheets.values.get({
    spreadsheetId,
    range: 'STAGING_PIPELINE!A:G',
  });

  const rows = data.values || [];
  const rowIndex = rows.findIndex((r, i) => i > 0 && r[1] === payloadUid);

  if (rowIndex === -1) {
    throw new Error(`Payload_UID ${payloadUid} not found in STAGING_PIPELINE`);
  }

  // rowIndex is 0-based in the array; Sheets is 1-based, +1 for header
  const sheetRow = rowIndex + 1;

  await sheetsApi.spreadsheets.values.update({
    spreadsheetId,
    range: `STAGING_PIPELINE!F${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['FLOW_COMPLETE']] },
  });
}

/**
 * Reads operator context from BRAIN_TRUST_INDEX to build
 * the personalised inference prompt.
 *
 * Reads: MATRIX_LEDGER (last 5 rows), user Script Properties
 * via a web app call are not accessible, so we read what's
 * available in the spreadsheet itself.
 *
 * @param  {Object} user           User row with OAuth credentials.
 * @param  {string} spreadsheetId  BRAIN_TRUST_INDEX spreadsheet ID.
 * @returns {Object} Context object for prompt assembly.
 */
async function readOperatorContext(user, spreadsheetId) {
  const auth      = await getAuthClientForUser(user);
  const sheetsApi = google.sheets({ version: 'v4', auth });

  const context = {
    recentVectors:   [],
    sessionCount:    0,
    sessionSummaries: [],
  };

  try {
    // Last 5 MATRIX_LEDGER rows for vector history
    const { data: ledgerData } = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range: 'MATRIX_LEDGER!A:I',
    });
    const ledgerRows = (ledgerData.values || []).slice(1); // skip header
    context.recentVectors = ledgerRows.slice(-5).map(r => ({
      uid:          r[0] || '',
      timestamp:    r[1] || '',
      ARCHITECTURE: parseFloat(r[2]) || 0,
      UI:           parseFloat(r[3]) || 0,
      SECURITY:     parseFloat(r[4]) || 0,
      PEDAGOGY:     parseFloat(r[5]) || 0,
      GAS_DEVELOPMENT: parseFloat(r[6]) || 0,
      RELATIONAL:   parseFloat(r[7]) || 0,
    }));

    // Session count from SESSION_LOG
    const { data: sessionData } = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range: 'SESSION_LOG!A:F',
    });
    const sessionRows = (sessionData.values || []).slice(1);
    context.sessionCount = sessionRows.length;
    context.sessionSummaries = sessionRows.slice(-3).map(r => r[5] || '');

  } catch (e) {
    // Non-fatal — context enrichment is best-effort
    console.warn('[Google] Could not read operator context:', e.message);
  }

  return context;
}


module.exports = {
  makeOAuthClient,
  getAuthClientForUser,
  getAuthUrl,
  exchangeCodeForTokens,
  readDocumentText,
  writeDocumentContent,
  setFlowComplete,
  readOperatorContext,
};
