// =============================================================================
// 00b_ScriptOwnerGuard.js — refuses web-app callers other than the script's
// own account, for every public function that isn't meant for them.
// In the projects that serve a web app beyond the owner, and the Central
// Ledger, which shares their files: not in 00_SharedConfig.js, because two
// projects that load 00 have no userinfo.email scope for Session.
// =============================================================================

// Refuses a call from anyone but the account the script runs as. The Teacher
// and Student Dashboards run as the teacher with domain access, so a student
// can load either page and, from it, call ANY public function of its project
// through google.script.run: the function then runs as the teacher (KOS
// Audit Docket IV, High, 2026-10-31). Every public function in such a
// project checks its caller: the dashboards' own with _isAuthorizedTeacher_
// or the session's identity, and everything else (editor runs, setup,
// triggers, functions shared in from other files) with this. From the
// editor or a trigger the caller is the script's own account (or blank, for
// some triggers); through a web app it is whoever opened the page.
// tools/gas-lint's web-app-public-function check enforces it.
function requireScriptOwner_() {
  let active = "", effective = "";
  try { active = String(Session.getActiveUser().getEmail() || "").toLowerCase(); } catch (e) { active = ""; }
  try { effective = String(Session.getEffectiveUser().getEmail() || "").toLowerCase(); } catch (e) { effective = ""; }
  if (active && effective && active !== effective) throw new Error("Not authorized.");
}
