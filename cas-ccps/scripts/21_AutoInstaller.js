// =============================================================================
// FILE: 21_AutoInstaller.js
// BOUND TO: Admin Manual Google Doc (same project as Scripts 16 + 20)
// PURPOSE: Automated script installation via the Apps Script API.
//          After the setup wizard (Script 16) creates all Drive assets,
//          this installer:
//            1. Reads script file contents from the Script Registry Sheet
//            2. Creates Apps Script projects bound to each asset
//            3. Uploads all script files to each project
//            4. Sets Script Properties on each project
//            5. Deploys web app projects and captures URLs
//            6. Writes all results back to Admin Manual Script Properties
//            7. Updates the admin summary page with install status
//
// PREREQUISITES:
//   a. Run the setup wizard (Script 16) first — it creates the Drive assets
//      whose IDs this installer needs
//   b. Enable the Apps Script API in Google Cloud Console:
//      console.cloud.google.com → APIs & Services → Library →
//      search "Apps Script API" → Enable
//   c. Create the Script Registry Sheet (see REGISTRY_SHEET_SETUP below)
//
// OAUTH SCOPES REQUIRED (add to appsscript.json manifest):
//   https://www.googleapis.com/auth/script.projects
//   https://www.googleapis.com/auth/script.deployments
//   https://www.googleapis.com/auth/drive
//   https://www.googleapis.com/auth/spreadsheets
// =============================================================================

// =============================================================================
// REGISTRY_SHEET_SETUP
//
// Create one Google Sheet as the Script Registry. Share it with the admin
// account (or own it with the admin account). Set its ID below.
//
// Sheet tab name: "Scripts"
// Column A: FileName       (e.g. "00_SharedConfig")
// Column B: ProjectTarget  (e.g. "CENTRAL_LEDGER", "RUBRIC_SHEET", "MATRIX_SHEET",
//                            "STUDENT_TEMPLATE", "TEACHER_DASHBOARD", "STUDENT_DASHBOARD")
// Column C: ScriptContent  (full script file contents — paste or import)
//
// Supported ProjectTarget values:
//   CENTRAL_LEDGER      — Central Ledger Spreadsheet (Scripts 00,02,03,04,06,10,18)
//   RUBRIC_SHEET        — Master Rubric Response Sheet (Scripts 00,05,19)
//   MATRIX_SHEET        — Master Teacher Matrix Sheet (Scripts 00,08,19)
//   STUDENT_TEMPLATE    — Master Student Template Doc (Scripts 00,01,09,17)
//   TEACHER_DASHBOARD   — Standalone web app (Scripts 00,07,22,23,26,29,31)
//   STUDENT_DASHBOARD   — Standalone web app (Scripts 00,13)
// =============================================================================

const REGISTRY_TAB_NAME = "Scripts";

// ---------------------------------------------------------------------------
// getRegistrySheetId_ — reads the registry sheet ID from Script Properties.
// On first run (when not yet set), prompts the admin via dialog.
// This keeps the admin entirely out of the code editor.
// ---------------------------------------------------------------------------
function getRegistrySheetId_() {
  const props = PropertiesService.getScriptProperties();
  let   id    = props.getProperty("SCRIPT_REGISTRY_SHEET_ID");

  if (!id) {
    const ui  = DocumentApp.getUi();
    const res = ui.prompt(
      "Script Registry Sheet ID",
      "Enter the ID of your Script Registry Sheet.\n\n" +
      "Find it in the sheet's URL — the long string between /d/ and /edit.\n\n" +
      "Example: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
      ui.ButtonSet.OK_CANCEL
    );

    if (res.getSelectedButton() !== ui.Button.OK) return null;

    id = res.getResponseText().trim();
    if (!id) return null;

    // Validate it's reachable before storing
    try {
      SpreadsheetApp.openById(id).getName();
    } catch (e) {
      ui.alert(
        "Could Not Open That Sheet",
        "The ID you entered could not be accessed:\n" + id + "\n\n" +
        "Make sure:\n" +
        "  • The ID is correct (no extra spaces)\n" +
        "  • The sheet is owned by or shared with this Google account\n\n" +
        "Try again.",
        ui.ButtonSet.OK
      );
      return null;
    }

    props.setProperty("SCRIPT_REGISTRY_SHEET_ID", id);
    Logger.log("[INSTALLER] Registry sheet ID saved: " + id);
  }

  return id;
}

// Apps Script API base URL
const AS_API = "https://script.googleapis.com/v1";

// ---------------------------------------------------------------------------
// runAutoInstaller — main entry point, called from the menu
// ---------------------------------------------------------------------------
function runAutoInstaller() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();

  // Verify wizard has been run first
  const ledgerId = props.getProperty("CENTRAL_LEDGER_SS_ID") ||
                   props.getProperty("ADMIN_SS_ID");

  if (!ledgerId) {
    ui.alert(
      "⚠️ Run the Setup Wizard First",
      "The Setup Wizard must be completed before running the installer.\n\n" +
      "Click ⚙️ Assignment System → 🚀 Run Admin + Teacher Setup first.",
      ui.ButtonSet.OK
    );
    return;
  }

  // Verify Cloud Console prerequisite
  const cloudOk = ui.alert(
    "Before We Begin",
    "The installer needs the Apps Script API to be enabled in Google Cloud Console.\n\n" +
    "Have you already done this?\n\n" +
    "If not: go to console.cloud.google.com → APIs & Services → Library →\n" +
    "search 'Apps Script API' → Enable. Takes about 2 minutes.\n\n" +
    "Click OK once the API is enabled.",
    ui.ButtonSet.OK_CANCEL
  );

  if (cloudOk !== ui.Button.OK) return;

  const confirm = ui.alert(
    "🔧 Ready to Install",
    "The installer will now:\n\n" +
    "  1. Read all script files from the Script Registry Sheet\n" +
    "  2. Create Apps Script projects for each system component\n" +
    "  3. Upload all script files to each project\n" +
    "  4. Set configuration on each project\n" +
    "  5. Deploy the web app dashboards\n\n" +
    "This takes about 2-3 minutes. Click OK to begin.",
    ui.ButtonSet.OK_CANCEL
  );

  if (confirm !== ui.Button.OK) return;

  try {
    const result = runInstallation_(props);
    updateSummaryPageWithInstallStatus_(result);

    // Mark installer complete — removes installer menu item on next open
    PropertiesService.getScriptProperties().setProperty("INSTALLER_COMPLETE", "true");

    ui.alert(
      "✅ Installation Complete",
      "All scripts have been installed and configured.\n\n" +
      "Installed projects:\n" +
      result.projects.map(p => "  ✓ " + p.name).join("\n") + "\n\n" +
      "Web app URLs have been saved to your Script Properties.\n\n" +
      "One remaining step: Configure the two Workspace Studio Flows.\n" +
      "See your Admin Setup Details page for the full configuration reference.\n\n" +
      "Reload this document to update the menu.",
      ui.ButtonSet.OK
    );

  } catch (err) {
    ui.alert(
      "❌ Installation Failed",
      "An error occurred during installation:\n\n" + err.message + "\n\n" +
      "The installer uses checkpoints — re-running will resume from where it stopped.\n" +
      "Check the Apps Script execution log for details.",
      ui.ButtonSet.OK
    );
    Logger.log("[INSTALLER] Error: " + err.message + "\n" + err.stack);
  }
}

// ---------------------------------------------------------------------------
// runInstallation_ — orchestrates the full install sequence
// ---------------------------------------------------------------------------
function runInstallation_(props) {
  Logger.log("[INSTALLER] Starting installation...");

  // Step 1: Read script registry
  const registry = readScriptRegistry_();
  Logger.log("[INSTALLER] Registry loaded: " + Object.keys(registry).length + " targets");

  // Step 2: Collect asset IDs from Script Properties
  const assetIds = collectAssetIds_(props);

  // Step 3: Install each project
  const projectResults = [];

  projectResults.push(installProject_("CENTRAL_LEDGER", {
    name:       "Assignment System — Central Ledger Scripts",
    parentId:   assetIds.ledgerSsId,
    type:       "BOUND",
    files:      registry["CENTRAL_LEDGER"] || [],
    properties: buildLedgerProps_(assetIds),
    triggers:   buildLedgerTriggers_()
  }));

  projectResults.push(installProject_("RUBRIC_SHEET", {
    name:       "MASTER — Rubric Response Sheet Scripts",
    parentId:   assetIds.masterRubricSsId,
    type:       "BOUND",
    files:      registry["RUBRIC_SHEET"] || [],
    properties: buildRubricSheetProps_(assetIds),
    triggers:   []  // onOpen self-registers trigger on first teacher open
  }));

  projectResults.push(installProject_("MATRIX_SHEET", {
    name:       "MASTER — Teacher Matrix Sheet Scripts",
    parentId:   assetIds.masterMatrixSsId,
    type:       "BOUND",
    files:      registry["MATRIX_SHEET"] || [],
    properties: buildMatrixSheetProps_(assetIds),
    triggers:   []  // onOpen self-registers triggers on first teacher open
  }));

  projectResults.push(installProject_("STUDENT_TEMPLATE", {
    name:       "MASTER — Student Template Scripts",
    parentId:   assetIds.studentTemplateDocId,
    type:       "BOUND",
    files:      registry["STUDENT_TEMPLATE"] || [],
    properties: buildStudentTemplateProps_(assetIds),
    triggers:   []
  }));

  // Step 4: Deploy web apps
  const teacherDashResult = deployWebApp_("TEACHER_DASHBOARD", {
    name:       "Assignment System — Teacher Dashboard",
    files:      registry["TEACHER_DASHBOARD"] || [],
    properties: buildTeacherDashboardProps_(assetIds),
    executeAs:  "USER_DEPLOYING",   // Me
    access:     "DOMAIN"            // Anyone in organization
  });

  const studentDashResult = deployWebApp_("STUDENT_DASHBOARD", {
    name:       "Assignment System — Student Dashboard",
    files:      registry["STUDENT_DASHBOARD"] || [],
    properties: buildStudentDashboardProps_(assetIds),
    executeAs:  "MYSELF",           // Server code runs as the deploying admin,
    // not the visiting student — USER_ACCESSING previously meant
    // getStudentDashboardData() opened the Central Ledger under the
    // *student's own* identity, which only works if every student already
    // has direct read access to that spreadsheet. DOMAIN scopes web app
    // access to signed-in accounts on this Workspace domain; the row filter
    // in 13_StudentDashboard.js (matched against Session.getActiveUser())
    // still limits what's rendered, now as real defense-in-depth rather
    // than the only thing standing between a student and the full Ledger.
    // Matches the checked-in
    // clasp/manifests/student-dashboard.appsscript.json.
    access:     "DOMAIN"
  });

  projectResults.push(teacherDashResult);
  projectResults.push(studentDashResult);

  // Step 5: Write web app URLs back to admin manual properties
  props.setProperty("TEACHER_DASHBOARD_URL", teacherDashResult.deploymentUrl || "");
  props.setProperty("STUDENT_DASHBOARD_URL",  studentDashResult.deploymentUrl || "");

  Logger.log("[INSTALLER] Installation complete.");

  return {
    projects:           projectResults,
    teacherDashboardUrl: teacherDashResult.deploymentUrl,
    studentDashboardUrl: studentDashResult.deploymentUrl
  };
}

// ---------------------------------------------------------------------------
// readScriptRegistry_ — reads the Script Registry Sheet and returns
// a map of { ProjectTarget: [ { name, content } ] }
// ---------------------------------------------------------------------------
function readScriptRegistry_() {
  const registryId = getRegistrySheetId_();
  if (!registryId) throw new Error("Script Registry Sheet ID not provided. Installation cancelled.");
  const ss    = SpreadsheetApp.openById(registryId);
  const sheet = ss.getSheetByName(REGISTRY_TAB_NAME);

  if (!sheet) {
    throw new Error(
      "Tab '" + REGISTRY_TAB_NAME + "' not found in Script Registry Sheet.\n" +
      "Create a tab named 'Scripts' with columns: FileName | ProjectTarget | ScriptContent"
    );
  }

  const data     = sheet.getDataRange().getValues();
  const registry = {};

  for (let i = 1; i < data.length; i++) {
    const fileName    = String(data[i][0]).trim();
    const target      = String(data[i][1]).trim().toUpperCase();
    const content     = String(data[i][2]);

    if (!fileName || !target || !content.trim()) continue;

    if (!registry[target]) registry[target] = [];
    registry[target].push({ name: fileName, content: content });
  }

  // Validate all required targets are present
  const required = ["CENTRAL_LEDGER","RUBRIC_SHEET","MATRIX_SHEET",
                     "STUDENT_TEMPLATE","TEACHER_DASHBOARD","STUDENT_DASHBOARD"];
  const missing  = required.filter(t => !registry[t] || registry[t].length === 0);

  if (missing.length > 0) {
    throw new Error(
      "Script Registry Sheet is missing entries for:\n" +
      missing.map(t => "  • " + t).join("\n") + "\n\n" +
      "Add rows for these targets in the registry sheet."
    );
  }

  return registry;
}

// ---------------------------------------------------------------------------
// collectAssetIds_ — reads all required asset IDs from Script Properties
// ---------------------------------------------------------------------------
function collectAssetIds_(props) {
  const ids = {
    ledgerSsId:          props.getProperty("CENTRAL_LEDGER_SS_ID")         || props.getProperty("ADMIN_SS_ID"),
    masterRubricSsId:    props.getProperty("MASTER_RUBRIC_RESPONSE_SS_ID"),
    masterMatrixSsId:    props.getProperty("MASTER_TEACHER_MATRIX_SS_ID"),
    studentTemplateDocId: props.getProperty("MASTER_STUDENT_TEMPLATE_ID"),
    adminNotifyEmail:    props.getProperty("ADMIN_NOTIFY_EMAIL"),
    currentTerm:         props.getProperty("CURRENT_TERM") || ""
  };

  const missing = Object.entries(ids)
    .filter(([k, v]) => !v && k !== "currentTerm")
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(
      "Missing Script Properties required for installation:\n" +
      missing.map(k => "  • " + k).join("\n") + "\n\n" +
      "Run the setup wizard first, and ensure MASTER_STUDENT_TEMPLATE_ID is set."
    );
  }

  return ids;
}

// ---------------------------------------------------------------------------
// installProject_ — creates or updates an Apps Script project,
// uploads files, and sets Script Properties via the Apps Script API
// ---------------------------------------------------------------------------
function installProject_(targetKey, config) {
  Logger.log("[INSTALLER] Installing: " + config.name);

  const token = ScriptApp.getOAuthToken();

  // Check for existing project checkpoint
  const checkpointKey = "INSTALLER_SCRIPT_ID_" + targetKey;
  let   scriptId      = PropertiesService.getScriptProperties()
                          .getProperty(checkpointKey);

  if (!scriptId) {
    // Create new Apps Script project bound to the container asset
    const createPayload = {
      title:    config.name,
      parentId: config.parentId
    };

    const createResp = UrlFetchApp.fetch(AS_API + "/projects", {
      method:      "POST",
      contentType: "application/json",
      headers:     { Authorization: "Bearer " + token },
      payload:     JSON.stringify(createPayload),
      muteHttpExceptions: true
    });

    const createData = JSON.parse(createResp.getContentText());
    if (createResp.getResponseCode() !== 200) {
      throw new Error(
        "Failed to create project '" + config.name + "':\n" +
        (createData.error ? createData.error.message : createResp.getContentText())
      );
    }

    scriptId = createData.scriptId;
    // Checkpoint the script ID so re-runs don't create duplicates
    PropertiesService.getScriptProperties().setProperty(checkpointKey, scriptId);
    Logger.log("[INSTALLER] Created project: " + scriptId);
  } else {
    Logger.log("[INSTALLER] Resuming project: " + scriptId);
  }

  // Upload script files
  const filesPayload = {
    files: config.files.map(f => ({
      name:   f.name,
      type:   "SERVER_JS",
      source: f.content
    }))
  };

  // Always include the appsscript.json manifest
  filesPayload.files.unshift({
    name:   "appsscript",
    type:   "JSON",
    source: buildManifest_(config.triggers || [])
  });

  const uploadResp = UrlFetchApp.fetch(AS_API + "/projects/" + scriptId + "/content", {
    method:      "PUT",
    contentType: "application/json",
    headers:     { Authorization: "Bearer " + token },
    payload:     JSON.stringify(filesPayload),
    muteHttpExceptions: true
  });

  if (uploadResp.getResponseCode() !== 200) {
    const uploadErr = JSON.parse(uploadResp.getContentText());
    throw new Error(
      "Failed to upload files to '" + config.name + "':\n" +
      (uploadErr.error ? uploadErr.error.message : uploadResp.getContentText())
    );
  }

  Logger.log("[INSTALLER] Files uploaded: " + config.files.length + " files");

  // Set Script Properties via the Apps Script API
  if (config.properties && Object.keys(config.properties).length > 0) {
    // Pass includeTriggerSetup=true for the central ledger project so that
    // setupAutoHealthTrigger() is called on first execution
    const includeTrigger = (targetKey === "CENTRAL_LEDGER");
    setProjectProperties_(scriptId, config.properties, token, includeTrigger);
  }

  return {
    name:     config.name,
    scriptId: scriptId,
    target:   targetKey,
    status:   "installed"
  };
}

// ---------------------------------------------------------------------------
// deployWebApp_ — creates a standalone project and deploys it as a web app
// ---------------------------------------------------------------------------
function deployWebApp_(targetKey, config) {
  Logger.log("[INSTALLER] Deploying web app: " + config.name);

  const token         = ScriptApp.getOAuthToken();
  const checkpointKey = "INSTALLER_SCRIPT_ID_" + targetKey;
  let   scriptId      = PropertiesService.getScriptProperties()
                          .getProperty(checkpointKey);

  if (!scriptId) {
    // Create standalone project (no parentId = standalone)
    const createResp = UrlFetchApp.fetch(AS_API + "/projects", {
      method:      "POST",
      contentType: "application/json",
      headers:     { Authorization: "Bearer " + token },
      payload:     JSON.stringify({ title: config.name }),
      muteHttpExceptions: true
    });

    const createData = JSON.parse(createResp.getContentText());
    if (createResp.getResponseCode() !== 200) {
      throw new Error("Failed to create web app project: " +
        (createData.error ? createData.error.message : createResp.getContentText()));
    }

    scriptId = createData.scriptId;
    PropertiesService.getScriptProperties().setProperty(checkpointKey, scriptId);
  }

  // Upload files with manifest
  const filesPayload = {
    files: [
      {
        name:   "appsscript",
        type:   "JSON",
        source: buildWebAppManifest_(targetKey, config.executeAs, config.access)
      },
      ...config.files.map(f => ({
        name:   f.name,
        type:   "SERVER_JS",
        source: f.content
      }))
    ]
  };

  const uploadResp = UrlFetchApp.fetch(AS_API + "/projects/" + scriptId + "/content", {
    method:      "PUT",
    contentType: "application/json",
    headers:     { Authorization: "Bearer " + token },
    payload:     JSON.stringify(filesPayload),
    muteHttpExceptions: true
  });

  if (uploadResp.getResponseCode() !== 200) {
    throw new Error("Failed to upload web app files: " + uploadResp.getContentText());
  }

  // Set Script Properties
  if (config.properties) {
    setProjectProperties_(scriptId, config.properties, token);
  }

  // Create deployment (HEAD deployment — @latest)
  const deployResp = UrlFetchApp.fetch(AS_API + "/projects/" + scriptId + "/deployments", {
    method:      "POST",
    contentType: "application/json",
    headers:     { Authorization: "Bearer " + token },
    payload:     JSON.stringify({
      versionNumber: 0,  // HEAD
      manifestFileName: "appsscript",
      description: "Automated deployment — Assignment System"
    }),
    muteHttpExceptions: true
  });

  const deployData = JSON.parse(deployResp.getContentText());
  if (deployResp.getResponseCode() !== 200) {
    throw new Error("Failed to deploy web app: " +
      (deployData.error ? deployData.error.message : deployResp.getContentText()));
  }

  const deploymentId  = deployData.deploymentId;
  const deploymentUrl = deployData.entryPoints
    ? (deployData.entryPoints.find(e => e.entryPointType === "WEB_APP") || {})
        .webApp?.url || ""
    : "";

  Logger.log("[INSTALLER] Web app deployed: " + deploymentUrl);

  return {
    name:          config.name,
    scriptId:      scriptId,
    deploymentId:  deploymentId,
    deploymentUrl: deploymentUrl,
    target:        targetKey,
    status:        "deployed"
  };
}

// ---------------------------------------------------------------------------
// setProjectProperties_ — sets Script Properties on a given project
// via the Apps Script API's processes endpoint
// Note: The API doesn't have a direct "set properties" endpoint.
// We set them by running a function in the project that sets them.
// For this to work the project must already have a function we can invoke,
// OR we use the workaround of embedding properties in the manifest's
// runtimeLogger section — but that's not standard.
//
// PRACTICAL APPROACH: embed the properties as constants in a generated
// "ProjectConfig" script file that the other scripts can import.
// This avoids the API limitation while achieving the same result.
// ---------------------------------------------------------------------------
function setProjectProperties_(scriptId, properties, token, includeTriggerSetup) {
  // Generate a config file that sets the properties when any function runs
  const configSource = generateConfigFileSource_(properties, includeTriggerSetup || false);

  // We need to update the project content to add/replace the _installer_config file
  // First, get current files
  const getResp = UrlFetchApp.fetch(AS_API + "/projects/" + scriptId + "/content", {
    method:  "GET",
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true
  });

  if (getResp.getResponseCode() !== 200) {
    Logger.log("[INSTALLER] Could not read project files for property setting — skipping");
    return;
  }

  const currentContent = JSON.parse(getResp.getContentText());
  const existingFiles  = (currentContent.files || []).filter(
    f => f.name !== "_installer_config"
  );

  // Add the config file
  existingFiles.push({
    name:   "_installer_config",
    type:   "SERVER_JS",
    source: configSource
  });

  const updateResp = UrlFetchApp.fetch(AS_API + "/projects/" + scriptId + "/content", {
    method:      "PUT",
    contentType: "application/json",
    headers:     { Authorization: "Bearer " + token },
    payload:     JSON.stringify({ files: existingFiles }),
    muteHttpExceptions: true
  });

  if (updateResp.getResponseCode() === 200) {
    Logger.log("[INSTALLER] Config file written to project.");
  } else {
    Logger.log("[INSTALLER] Config file write warning: " + updateResp.getContentText());
  }
}

// ---------------------------------------------------------------------------
// generateConfigFileSource_ — generates a GAS file that sets Script Properties
// when initInstallerConfig_() is called. This function is called by onOpen()
// in each project via a one-time self-initialization pattern.
// ---------------------------------------------------------------------------
function generateConfigFileSource_(properties, includeTriggerSetup) {
  const lines = [
    "// Auto-generated by installer — do not edit manually",
    "// This file sets Script Properties and optionally registers triggers",
    "function initInstallerConfig_() {",
    "  var props = PropertiesService.getScriptProperties();",
    "  var config = " + JSON.stringify(properties, null, 2) + ";",
    "  props.setProperties(config);",
    "  Logger.log('[CONFIG] Installer properties applied.');"
  ];

  if (includeTriggerSetup) {
    lines.push(
      "  // Register daily health alert trigger if not already present",
      "  try {",
      "    if (typeof setupAutoHealthTrigger === 'function') {",
      "      setupAutoHealthTrigger();",
      "    }",
      "  } catch(e) { Logger.log('[CONFIG] Trigger setup skipped: ' + e.message); }"
    );
  }

  lines.push("}");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// buildManifest_ — generates the appsscript.json manifest for bound scripts
// ---------------------------------------------------------------------------
function buildManifest_(triggers) {
  const manifest = {
    timeZone: Session.getScriptTimeZone(),
    dependencies: {
      enabledAdvancedServices: [
        {
          userSymbol:  "Drive",
          serviceId:   "drive",
          version:     "v3"
        }
      ]
    },
    oauthScopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/forms",
      "https://www.googleapis.com/auth/script.send_mail",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/script.external_request"
    ],
    exceptionLogging: "STACKDRIVER",
    runtimeVersion:   "V8"
  };

  return JSON.stringify(manifest, null, 2);
}

// ---------------------------------------------------------------------------
// WEB_APP_SCOPES — per-project-target OAuth scope lists.
// FIXED: buildWebAppManifest_() used to hardcode one 2-scope list for every
// web app it deployed. That happened to match STUDENT_DASHBOARD, but
// TEACHER_DASHBOARD's real files (07, 22, 23, 26, 29, 31 — see
// tools/gas-lint/project-map.json) call DriveApp/DocumentApp/ScriptApp and
// need 5 scopes — already correctly listed in the checked-in
// cas-ccps/clasp/manifests/teacher-dashboard.appsscript.json, which an
// AutoInstaller-driven deploy was silently under-scoping relative to.
// Keep these two lists in sync with their checked-in manifest counterparts;
// there's no way for this in-Apps-Script code to read the repo's manifest
// files at runtime, so this table has to be maintained by hand until a
// gas-lint check exists to catch drift between the two (see the
// checkUndefinedFunctionCalls-style tooling work in the same commit series).
// ---------------------------------------------------------------------------
const WEB_APP_SCOPES = {
  TEACHER_DASHBOARD: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/userinfo.email"
  ],
  STUDENT_DASHBOARD: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/userinfo.email"
  ]
};

// ---------------------------------------------------------------------------
// buildWebAppManifest_ — generates appsscript.json for web app deployments
// ---------------------------------------------------------------------------
function buildWebAppManifest_(targetKey, executeAs, access) {
  return JSON.stringify({
    timeZone: Session.getScriptTimeZone(),
    webapp: {
      executeAs: executeAs,
      access:    access
    },
    oauthScopes: WEB_APP_SCOPES[targetKey] || [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/userinfo.email"
    ],
    exceptionLogging: "STACKDRIVER",
    runtimeVersion:   "V8"
  }, null, 2);
}

// ---------------------------------------------------------------------------
// Trigger builder — returns trigger metadata for the manifest
// Installable time-driven triggers are set via setupAutoHealthTrigger()
// which runs through the _installer_config onOpen init pattern
// ---------------------------------------------------------------------------
function buildLedgerTriggers_() {
  // Installable triggers cannot be set via the manifest directly.
  // Instead, the _installer_config file calls setupAutoHealthTrigger()
  // when any function first runs in the ledger project context.
  // This is handled in generateConfigFileSource_ for the ledger project.
  return [];
}

// ---------------------------------------------------------------------------
// Property builders — return the Script Properties each project needs
// ---------------------------------------------------------------------------
function buildLedgerProps_(ids) {
  return {
    ADMIN_SS_ID:          ids.ledgerSsId,
    CENTRAL_LEDGER_SS_ID: ids.ledgerSsId,
    ADMIN_ROOT_FOLDER_ID: PropertiesService.getScriptProperties()
                            .getProperty("ADMIN_ROOT_FOLDER_ID") || "",
    ADMIN_NOTIFY_EMAIL:   ids.adminNotifyEmail || "",
    CURRENT_TERM:         ids.currentTerm || "",
    ID_ADMIN_SPREADSHEET: ids.ledgerSsId  // For Script 06 Turnstile
  };
}

function buildRubricSheetProps_(ids) {
  return {
    ADMIN_SS_ID:           ids.ledgerSsId,
    CENTRAL_LEDGER_SS_ID:  ids.ledgerSsId,
    ADMIN_NOTIFY_EMAIL:    ids.adminNotifyEmail || ""
    // Teacher-specific properties written to _CONFIG tab by Script 16 wizard
  };
}

function buildMatrixSheetProps_(ids) {
  return {
    ADMIN_SS_ID:           ids.ledgerSsId,
    CENTRAL_LEDGER_SS_ID:  ids.ledgerSsId,
    ADMIN_NOTIFY_EMAIL:    ids.adminNotifyEmail || ""
    // Teacher-specific properties written to _CONFIG tab by Script 16 wizard
  };
}

function buildStudentTemplateProps_(ids) {
  return {
    CENTRAL_LEDGER_SS_ID:  ids.ledgerSsId,
    ADMIN_SS_ID:           ids.ledgerSsId
    // These are the two properties Script 01 reads
    // Student doc copies use the embedded [SYS_LEDGER_SS_ID:...] block as fallback
  };
}

// The Teacher Dashboard is deployed once per teacher (see
// ADMIN_DEPLOYMENT_WALKTHROUGH.html Step 10) — every server function on
// it gates on TEACHER_EMAIL matching the signed-in caller
// (_isAuthorizedTeacher_ in 07_TeacherDashboard.js), so an unset property
// here means the installer's dashboard denies everyone, not "works for
// anyone." This automated installer path only ever deploys ONE dashboard,
// scoped to whoever ran it (ids.adminNotifyEmail) — additional teachers
// must be deployed manually per Step 10, same as the Admin Manual itself.
function buildTeacherDashboardProps_(ids) {
  return {
    CENTRAL_LEDGER_SS_ID: ids.ledgerSsId,
    ADMIN_SS_ID:          ids.ledgerSsId,
    TEACHER_EMAIL:        ids.adminNotifyEmail || ""
    // TEACHER_NAME intentionally left unset here — it's cosmetic (only
    // used to attribute logged lessons), not a security boundary, and
    // this installer doesn't collect a display name. Set it manually in
    // Script Properties if desired.
  };
}

function buildStudentDashboardProps_(ids) {
  return {
    CENTRAL_LEDGER_SS_ID: ids.ledgerSsId,
    ADMIN_SS_ID:          ids.ledgerSsId
  };
}

// ---------------------------------------------------------------------------
// updateSummaryPageWithInstallStatus_ — appends install results to the
// admin summary page in the Admin Manual document
// ---------------------------------------------------------------------------
function updateSummaryPageWithInstallStatus_(result) {
  try {
    const doc  = DocumentApp.getActiveDocument();
    const body = doc.getBody();

    body.appendPageBreak();

    body.appendParagraph("🔧 Auto-Installer Results")
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);

    body.appendParagraph(
      "Installed: " +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMMM d, yyyy 'at' h:mm a")
    ).setItalic(true);

    body.appendParagraph("");

    result.projects.forEach(p => {
      const line = body.appendParagraph("");
      line.appendText("✅  " + p.name).setBold(true);
      if (p.deploymentUrl) {
        body.appendParagraph(p.deploymentUrl);
      }
      body.appendParagraph("");
    });

    body.appendParagraph("").appendHorizontalRule();

    body.appendParagraph("Remaining Step — Configure Workspace Studio Flows")
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);

    body.appendParagraph(
      "All scripts have been installed automatically. The only remaining step is to\n" +
      "configure the two Workspace Studio Flows (Flow 1: Rubric Extraction,\n" +
      "Flow 2: Student Evaluation).\n\n" +
      "See the 15_StudioFlowPrompts.js file for exact prompts and step-by-step\n" +
      "configuration instructions for each flow."
    );

    doc.saveAndClose();
  } catch (e) {
    Logger.log("[INSTALLER] Could not update summary page: " + e.message);
  }
}

// ---------------------------------------------------------------------------
// clearInstallerCheckpoints — utility to reset installer state if needed
// Call from the menu if you want to force a fresh installation
// ---------------------------------------------------------------------------
function clearInstallerCheckpoints() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const keys  = Object.keys(props.getProperties())
    .filter(k => k.startsWith("INSTALLER_SCRIPT_ID_"));

  if (keys.length === 0) {
    ui.alert("No installer checkpoints found.", "", ui.ButtonSet.OK);
    return;
  }

  const confirm = ui.alert(
    "Clear Installer Checkpoints",
    "This will allow the installer to create fresh script projects.\n\n" +
    "Existing installed projects will NOT be deleted — only the memory of them.\n\n" +
    "Clear " + keys.length + " checkpoint(s)?",
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  keys.forEach(k => props.deleteProperty(k));
  ui.alert("✅ Checkpoints cleared. Re-run the installer to create fresh projects.");
}
