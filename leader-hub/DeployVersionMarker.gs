/**
 * LH_DEPLOY_VERSION_SHA — this project's self-reported "what commit is
 * this" marker (DeployVersionReport.gs's reportDeployVersion() reads it
 * and sends it to the KOS repo; see that file and
 * tools/deploy-drift/README.md for the full mechanism).
 *
 * DELIBERATELY its own file, touched by nothing else — same reasoning as
 * kos-personal/18_DeployVersionMarker.gs: a commit can't embed its own
 * SHA (the SHA is a hash of the commit's content), so the marker is
 * stamped in a SEPARATE commit, after the fact, by
 * `node tools/deploy-drift/stamp.js leader-hub:app`.
 * tools/deploy-drift/expected-marker.js excludes this one file from
 * "what commit last touched leader-hub:app" for exactly that reason.
 *
 * NEVER hand-edit this file, and NEVER combine a stamp with a functional
 * code change in the same commit. Always:
 *   1. Commit your real leader-hub code change(s) normally.
 *   2. Run `node tools/deploy-drift/stamp.js leader-hub:app`.
 *   3. Commit ONLY the resulting change to this file, by itself.
 *   4. clasp push, then clasp deploy -i <id> -V <n> to actually promote it
 *      (see tools/clasp-sync/DEPLOYMENT_RUNBOOK.md §3.5-3.6) — pushing
 *      HEAD alone does not update the live web app's /exec deployment.
 */
const LH_DEPLOY_VERSION_SHA = 'fb4d0fe1ddafecea6497e6d4935a1ab1605212d2'; // stamped by tools/deploy-drift/stamp.js — never hand-edit
