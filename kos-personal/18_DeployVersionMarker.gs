/**
 * KOS_DEPLOY_VERSION_SHA — this project's self-reported "what commit is
 * this" marker (17_DeployVersionReport.gs's reportDeployVersion() reads
 * it and sends it to the KOS repo; see that file and
 * tools/deploy-drift/README.md for the full mechanism).
 *
 * DELIBERATELY its own file, touched by nothing else. A commit can never
 * embed its own SHA — the SHA is a hash of the commit's content, so
 * "the SHA of the commit that sets this constant" isn't knowable until
 * after that commit exists. Splitting the marker into its own file
 * resolves that: tools/deploy-drift/expected-marker.js excludes this one
 * file from "what commit last touched kos-personal," so the value below —
 * stamped in a SEPARATE commit, after a real code change, by
 * `node tools/deploy-drift/stamp.js kos-personal` — correctly matches
 * what git expects once both commits have landed.
 *
 * Since 2026-10-28 tools/clasp-sync/run.js stamps the copy it pushes with
 * the commit its GitHub zip was cut from, so the value committed here is
 * not what goes live from run.js (tools/deploy-drift/README.md, "run.js
 * stamps the push"). The steps below are only for a push made another way.
 *
 * NEVER hand-edit this file, and NEVER combine a stamp with a functional
 * code change in the same commit — either breaks the match above. Always:
 *   1. Commit your real kos-personal code change(s) normally.
 *   2. Run `node tools/deploy-drift/stamp.js kos-personal`.
 *   3. Commit ONLY the resulting change to this file, by itself.
 *   4. clasp push, clasp version, then clasp update-deployment <id>
 *      --versionNumber <n> for each live deployment to actually promote it
 *      (see tools/clasp-sync/DEPLOYMENT_RUNBOOK.md §3.6, or run.js) —
 *      pushing HEAD alone does not update the live web app's /exec
 *      deployment.
 */
const KOS_DEPLOY_VERSION_SHA = '1ebe3d332372f97a5be6d8b562277ea146574097'; // stamped by tools/deploy-drift/stamp.js — never hand-edit
