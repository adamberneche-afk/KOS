
## No onboarding line once closed out, 2026-11-22

The primer read "Onboarding Day 21 of 21" for over a month because
`closeOutOnboarding()` was never run (L15, from the operator's 11-16 note
to the RTP). The operator chose to drop the line once onboarding is
closed, not replace it: `_onboardingStatusLine_` (5) is now empty after
the close-out, and the primer and the session context block leave it out.
