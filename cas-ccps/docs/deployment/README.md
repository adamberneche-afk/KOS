# cas-ccps deployment docs

One doc per topic, split out of `cas-ccps/DEPLOYMENT_HANDOFF.md` on 2026-11-17. The [handoff](../../DEPLOYMENT_HANDOFF.md) is the map: the status, the steps in order for the live account (Phases 1-6), and what to check after. Read only the doc you need.

- [`flow-lessons.md`](flow-lessons.md): Lessons learned closing out Flows 2-5 — read before building a flow anywhere else in this repo. Sections: What changed to get here.
- [`feature-switches.md`](feature-switches.md): Feature switches, the overnight check and the nightly lesson rollout: warm-ups in a text box (`WARMUP_TEXT_BOX`), the overnight check and flow pacing, the assignment doc header, feedback as comments (`FEEDBACK_AS_COMMENT`), the nightly lesson rollout (`ROLLOUT_AUTO_APPLY`).
- [`second-account.md`](second-account.md): Deploying a second account from scratch. Sections: The one document that actually walks through this (the runbook's parts and the four from-scratch gotchas); Order of operations; The real gap: Studio Flows 2-5; Before going live, read.
- [`script-properties.md`](script-properties.md): Script Properties reference: where `getConfig_()` looks, what is required, written automatically, set by hand, optional, and must never be set.
- [`other-systems.md`](other-systems.md): The other two systems (leader-hub and kos-personal), as pointers to their own guides.

The banner's history of earlier pushes (2026-10-12 to 2026-10-23) is archived in [`archive/2026-27-Q2/cas-ccps/DEPLOYMENT_HANDOFF.md`](../../../archive/2026-27-Q2/cas-ccps/DEPLOYMENT_HANDOFF.md).
