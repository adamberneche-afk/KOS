# KOS — Product Launch Execution Guide
### A Step-by-Step Roadmap from Zero to Scale

This guide covers every execution step from pre-launch preparation through Stage 4 infrastructure maturity. Each phase has concrete tasks, success criteria, and the specific trigger that moves you to the next phase.

---

## The Four Stages at a Glance

| Stage | Users | Infrastructure | Primary focus |
|---|---|---|---|
| Pre-Launch | 0 | Build | Pipeline completion, beta testing |
| Stage 1 | 1–2,000 | Cloud Run + Anthropic API | Distribution, retention, unit economics |
| Stage 2 | 2,000–5,000 | API + fine-tuning data collection | Scaling distribution, building the model dataset |
| Stage 3 | 5,000–10,000 | Hybrid API + fine-tuned model | Margin improvement, team building |
| Stage 4 | 10,000+ | Self-hosted fine-tuned model | Infrastructure ownership, moat deepening |

---

# PRE-LAUNCH
## Weeks 1–8: Build What's Missing, Validate What Exists

The honest pre-launch state: the infrastructure is built, the UX is designed, the documentation is written, and the billing layer exists. What doesn't exist is a working end-to-end pipeline. The Studio integration — the step that processes STUDIO_ACTIVE rows and sets FLOW_COMPLETE — is the critical path item before anything else matters.

---

### Week 1–2: Complete the Studio Integration

This is the only thing that matters this week. Nothing else moves until a session can go from Ingest tab submission to fully processed ledger rows without any manual intervention.

**Step 1: Define your inference implementation**

The inference service (`kos-inference-service/src/inference.js`) is built. It calls Claude Sonnet via the Anthropic API. You need to decide: will you run the inference service yourself from day one, or will you use a different mechanism during beta?

Options:
- **Option A (recommended):** Deploy the inference service to Cloud Run immediately. Use it from day one. This is production infrastructure being tested in beta.
- **Option B:** Run `devSetFlowComplete()` manually during beta to advance rows, and deploy the inference service before public launch. This is acceptable for a closed beta of 5–10 testers but creates a manual bottleneck.

Proceed with Option A. The deployment guide in `INFERENCE_SERVICE_DEPLOYMENT.md` covers this step-by-step.

**Step 2: Deploy the inference service**

Follow `INFERENCE_SERVICE_DEPLOYMENT.md` phases 1–7. Completion criteria:
- `curl https://YOUR-URL.run.app/health` returns `{"status":"ok"}`
- Database has all four tables
- Stripe webhook is receiving test events
- A test user can authorize at `/auth/connect` and receives an API key

**Step 3: Run the full pipeline test**

This is the definitive test. If this works, the product works.

1. Deploy a fresh KOS instance (new GAS project, full bootstrap via web app)
2. Set `KOS_INFERENCE_SERVICE_URL` and `KOS_INFERENCE_API_KEY` in Script Properties
3. Run `setupAllTriggers()`
4. Paste a real 5,000-character session log in the Ingest tab
5. Wait — do not touch anything
6. After 15 minutes maximum, check:
   - STAGING_PIPELINE: row should show PROCESSED
   - SESSION_LOG: one new row with a real summary
   - MATRIX_LEDGER: one new row with vector scores
   - CURRENT_STATE doc: updated with next steps
   - Cloud Run logs: job completed entry with token counts
   - Stripe test dashboard: one billing event recorded

If all six check out: the pipeline works. Move to Week 3.
If any fail: fix the failure before proceeding. Do not move forward with a broken pipeline.

**Step 4: Run the full pipeline test ten more times**

With different session types, different lengths, council simulations, external data submissions. You are looking for:
- NEEDS_CURATOR rate below 5%
- Processing time consistently under 15 minutes
- No silent failures (jobs that disappear without completing or failing)
- Billing events matching processing events 1:1

Document the failure modes you find and fix them before beta.

---

### Week 3–4: Beta Infrastructure Setup

**Step 5: Set up monitoring**

You need to know when things break before your users do.

- **Cloud Run alerts:** Go to GCP → Monitoring → Create alert policy. Alert on: error rate > 2%, latency > 60 seconds, instance count = 0 for > 10 minutes.
- **Uptime check:** Create a free UptimeRobot account. Monitor `https://YOUR-URL.run.app/health` every 5 minutes. Alert to your email and phone.
- **Database monitoring:** In Supabase dashboard, set up email alerts for: connection count > 80% of limit, storage > 400MB (free tier warning).
- **Error log monitoring:** In GAS, the `sendDailyErrorReport()` trigger fires at 08:00. Confirm `KOS_ADMIN_EMAIL` is set correctly in at least one test instance.
- **Stripe dashboard:** Bookmark the Stripe dashboard. Set up email alerts for failed charges and webhook failures.

**Step 6: Set up a simple status page**

Users need to know if the service is down. Options:
- Instatus.com (free tier): create a public status page at `status.yourdomain.com`
- Statuspage.io: more features, small cost
- A simple HTML page on your domain manually updated

This looks professional from day one and reduces support load during incidents.

**Step 7: Set up customer support infrastructure**

For beta: a dedicated email address (`support@yourdomain.com`) forwarded to your personal email is sufficient. Set up a canned response template for the five most common issues identified during pipeline testing.

For launch: add a simple Notion or Google Doc FAQ that you link to in the confirmation email users receive after authorizing the inference service.

**Step 8: Set up analytics**

You need to track: signups, activations (first session processed), retention (sessions in week 2+), and churn. Options:
- PostHog (free tier, self-hosted option): drop-in analytics with session replay
- Plausible: privacy-focused, $9/month
- Simple spreadsheet manually updated weekly: free, sufficient for beta

The minimum you need to track from day one: date user authorized, date first session processed, sessions processed per week, subscription tier. Everything else is nice-to-have.

---

### Week 5–6: Beta Recruitment

**Step 9: Identify 10–15 beta testers**

The ideal beta tester is:
- A heavy AI session user (3+ sessions/week)
- Comfortable with Google Drive and Apps Script concepts (doesn't need to understand the code, but shouldn't panic at the GAS editor)
- In a profession where session content is rich and decision-dense (educator, consultant, developer, researcher)
- Willing to give honest feedback, not just polite feedback

Where to find them:
- Your own professional network first
- TPT creator Facebook groups (post: "Looking for educators who use AI heavily in their work")
- Reddit: r/ChatGPT, r/ClaudeAI, r/productivity — post honestly about what you're building
- Twitter/X: reply to threads about AI productivity tools

**Step 10: Create the beta onboarding sequence**

The beta tester experience:
1. They receive a personal email explaining what KOS is and what you need from them
2. They follow the Deployment Guide to set up their KOS instance
3. They authorize the inference service at your URL
4. They receive their API key and add it to their KOS instance
5. They submit their first session
6. You receive a Slack/email notification that their first job processed
7. You personally reach out within 24 hours: "Your first session processed — here's what the system extracted from it. Does this match what you'd have pulled out manually?"

Personal outreach on the first session is not scalable at 1,000 users. It is essential at 10 users. It's how you learn whether the inference quality is actually good.

**Step 11: Set up a beta feedback channel**

Create a private Discord server or Slack workspace for beta testers. Channels:
- `#general` — discussion
- `#bugs` — something broke
- `#feedback` — what's good, what's not
- `#show-and-tell` — share interesting things the system extracted

This community becomes your early adopter base and your first referral network.

---

### Week 7–8: Beta Run and Iteration

**Step 12: Run the beta for two weeks**

Collect:
- NEEDS_CURATOR rate per tester
- Time from submission to FLOW_COMPLETE (should be < 15 minutes)
- Qualitative feedback: does the extracted content feel accurate? Is the daily primer useful? Are the vector weights reflecting their actual work?
- Specific complaints and specific moments of delight

**Step 13: Fix everything critical before launch**

Classify all feedback:
- **Blockers (must fix):** NEEDS_CURATOR rate > 10%, processing time > 30 minutes, data loss, billing errors
- **Should fix:** Confusing UI moments, misleading error messages, missing guidance
- **Nice to have:** Feature requests, polish items

Fix every blocker. Fix as many should-fix items as time allows. Log nice-to-have items for the post-launch backlog.

**Step 14: Define your launch readiness criteria**

Do not launch until all of these are true:
- [ ] 10 beta testers have processed at least 5 sessions each without blocker issues
- [ ] NEEDS_CURATOR rate across beta < 5%
- [ ] At least 3 beta testers say unprompted that the daily primer is useful
- [ ] Billing has processed at least one real charge (not test mode) without issues
- [ ] Monitoring is in place and you've received at least one test alert
- [ ] The Deployment Guide has been followed by at least 2 people who are not you and they succeeded

---

# STAGE 1
## Months 3–12: Public Launch and First 2,000 Users

**Infrastructure:** Cloud Run + Anthropic Sonnet API
**Primary metric:** Paid user count
**Stage complete when:** 2,000 registered users, 800+ paid users, monthly API spend > $800

---

### Month 3: Soft Launch

**Step 15: Publish the landing page**

The landing page needs to do one thing: make the right person feel seen and make them believe this is worth 30 minutes of setup time.

Structure:
1. **Headline:** Specific and concrete. Not "AI productivity for knowledge workers." Try: "Your AI sessions disappear. KOS routes everything they generate to the right place — automatically."
2. **The problem paragraph:** 3 sentences describing what a heavy AI session user loses every session. Be specific. Use the admin ghost concept.
3. **The mechanism:** One sentence describing what KOS does mechanically. "It processes your session transcripts, extracts structured intelligence, and routes it to your Google Drive — without you doing anything after you paste and submit."
4. **The proof:** 2–3 screenshots of a real session being processed. Show the Ingest tab, the Queue tab, and what SESSION_LOG looks like with real data.
5. **The cost:** Transparent pricing. Show all three tiers and the free tier. No hiding the price.
6. **The CTA:** "Deploy KOS" → links to the Deployment Guide.

Do not use stock photos. Do not use generic AI imagery. Use screenshots of the actual product.

**Step 16: Choose your domain**

Options to consider: `kosapp.io`, `knowos.app`, `kos.run`, `mykosstudio.com`. Whatever you choose, it should be easy to say out loud and not confused with other known tools.

**Step 17: Announce in your beta community**

Post in your beta Discord/Slack: "KOS is publicly available. Please share the landing page with anyone you think would benefit." Personal asks convert better than broadcast announcements.

**Step 18: Post in the TPT creator community**

Find the 3–5 most active TPT creator Facebook groups and YouTube communities. Post honestly:
- "I built a tool that processes your AI curriculum sessions and extracts action items, decision logs, and lesson structure automatically to your Google Drive. It's free to deploy, inference costs about $0.50/session. Currently in early access."
- Include a link to the landing page, not the Deployment Guide directly.
- Respond to every comment personally.

Do not oversell. The TPT community has seen tools that promise the world and deliver nothing. Be specific about what it does and what it doesn't.

---

### Month 3–6: Distribution Engine

**Step 19: Create the TPT creator distribution content**

The highest-leverage content for this audience is a YouTube video showing the system working in real time. The video structure:
1. (0:00–1:30) The problem: "I spend 45 minutes after every AI session manually filing things. Here's what that looks like."
2. (1:30–3:00) The solution: "I deployed KOS. Here's what a session looks like now."
3. (3:00–7:00) Live demo: submit a real session, watch it process, show what ends up in the spreadsheet and the docs.
4. (7:00–9:00) The setup: "Here's how you deploy it — it takes about 20 minutes."
5. (9:00–10:00) The cost: transparent, honest.

This video does not need to be polished. It needs to be real. A screen recording with your voice is sufficient.

**Step 20: Identify and reach out to 5 well-known TPT creators**

Find creators with 10,000+ YouTube subscribers or 50,000+ TPT followers who talk about AI in their workflow. Reach out personally:
- "I built something that I think could save you 1–2 hours per AI session. I'd like to give you free access for 30 days and a 1:1 walkthrough. No ask beyond honest feedback."

Three outcomes: they ignore you (fine), they try it and don't like it (valuable), they try it and love it (potential distribution multiplier).

One creator with 100,000 followers who genuinely endorses KOS is worth more than 6 months of regular posting.

**Step 21: Set up a referral mechanism**

Simple: users who refer 3 paying users get 3 months of Professional tier free. This doesn't require any special software — track it manually in a spreadsheet at this scale. Honor it personally. Word-of-mouth in tight communities (TPT creators, AI researchers, specific consultant circles) compounds faster than any paid channel.

**Step 22: Build the email list**

Add an email capture to the landing page: "Get notified when new features ship." Use ConvertKit (free tier) or Mailchimp. Send:
- A welcome email the day they sign up: "Here's what KOS does and how to deploy it."
- A weekly digest for the first month: new features, tips, user stories
- Monthly after that: product updates and usage tips

The email list is the owned audience that survives any algorithm change on any platform.

---

### Month 3–12: Retention Operations

**Step 23: Define your activation metric and track it daily**

Activation = a user has processed their first session through the full pipeline without manual intervention.

Your goal: every user who installs KOS activates within 7 days.

For every user who installs but doesn't activate within 7 days, send a personal email: "I see you deployed KOS but haven't processed a session yet. Is there something blocking you? Happy to help."

This does not scale to 10,000 users. It is essential for the first 200. The patterns you learn from these conversations inform every onboarding improvement.

**Step 24: Define your retention metric and check it weekly**

Retained user = processed at least one session in the last 7 days.

Week 1 retention target: 80%
Month 1 retention target: 60%
Month 3 retention target: 50%

These are reasonable targets for a tool with this level of setup investment. Below 40% month-3 retention means the value isn't materializing fast enough and the onboarding needs work.

**Step 25: Build the success milestone sequence**

Users who reach specific milestones stay. Users who drift don't. Identify the milestones and create a trigger for each:

| Milestone | Trigger | Response |
|---|---|---|
| First session processed | Job completed in worker.js | Email: "Your first session was processed. Here's what was extracted." |
| Shadow matrix first HYPOTHESIZED | `_updateShadowMatrix` first confidence > 0.1 | In-app notification: "Your system is starting to learn your patterns." |
| 10th session processed | Job #10 completed | Email: "10 sessions in. Here's how your vector weights have evolved." |
| Shadow matrix first VERIFIED | `_persistVerifiedShadowAnswers` fires | Email: "The system has verified its understanding of [question_key]." |
| First council review | `runSequesteredCouncil` completes | Email: "Your council review is complete. Here's what the 7 cogs agreed on." |

Each of these emails is short (3–5 sentences), specific to their data, and includes a link to the relevant section of BRAIN_TRUST_INDEX.

**Step 26: Create the upgrade path**

Free tier users who hit their credit limit should see a frictionless path to a paid plan. Currently the web app shows credit balance when the managed service is connected. Add:
- In-app low credit warning when balance < 20 credits
- Direct link to the Starter plan checkout from the warning
- A one-click upgrade button in the Diagnostics tab that opens the Stripe checkout

---

### Month 6–12: Operations at 500–2,000 Users

**Step 27: Create a proper support system**

At 500+ users, email support at personal scale becomes unsustainable. Move to:
- **Crisp** (free tier): live chat widget on the landing page and in the web app
- **A public FAQ/documentation site:** Notion public page or GitBook — link it from the web app
- **Community self-support:** The Discord server from beta should have grown. Pin solutions to common problems. Encourage users to help each other.

The goal is not to eliminate support tickets — it's to ensure every answered question also answers the next 10 people who have the same question.

**Step 28: Run monthly retrospectives on your metrics**

Monthly: review these numbers:
- New registrations this month
- Activation rate (registered → first session processed)
- Week-2 retention
- NEEDS_CURATOR rate (inference quality signal)
- Average sessions per active user per week
- Paid conversion rate
- Monthly churn
- ARPU
- MRR

When a metric goes the wrong direction for two consecutive months, treat it as a product problem and fix it before acquiring more users.

**Step 29: Begin building the fine-tuning dataset**

This is a Stage 2 task that you start in Stage 1 so you have data when you need it.

In `worker.js`, after a successful job completion, add logging to a separate `training_pairs` table:

```sql
CREATE TABLE training_pairs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_text   TEXT NOT NULL,
  output_json  TEXT NOT NULL,
  payload_type VARCHAR(50),
  model_used   VARCHAR(100),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

Log every successful (input, output) pair. Exclude sessions where:
- The user manually fixed a NEEDS_CURATOR job
- The output failed validation and was retried
- The session was shorter than 500 characters

By the time you have 2,000 users processing 4 sessions/week, you'll accumulate ~400,000 training pairs per year. You'll need approximately 10,000–50,000 high-quality pairs to fine-tune a capable smaller model.

**Stage 1 complete when:**
- 2,000 registered users
- 800+ paid users
- MRR > $11,200 ($14 ARPU × 800 users)
- Monthly API spend > $800 (signal of real usage volume)
- Training dataset has at least 10,000 quality pairs logged

---

# STAGE 2
## Months 12–24: Growth Phase, 2,000–5,000 Users

**Infrastructure:** Cloud Run + Anthropic API (unchanged) + fine-tuning pipeline being built
**Primary metric:** MRR growth rate
**Stage complete when:** 5,000 registered users, ~2,000 paid users, MRR > $28,000, training dataset > 50,000 quality pairs

---

### Month 12–14: Strengthen the Distribution Engine

**Step 30: Identify your best acquisition channel from Stage 1**

Review your analytics. Where did your best users come from? Best = highest activation rate + lowest churn. Invest in that channel. Reduce effort on channels that brought users who didn't activate or churned quickly.

Likely findings:
- Personal outreach to TPT creators: high quality, low volume
- YouTube video: moderate quality, moderate volume
- Reddit posts: variable quality, moderate volume
- Referral: highest quality, requires active nurturing

**Step 31: Create a creator partnership program**

Identify the 10 TPT creators who are your most active users. Offer them:
- Lifetime Professional tier ($29/month value) in exchange for a dedicated video review
- A custom referral link that gives their audience 100 free credits on signup
- Early access to new features and direct line to you for feedback

The right creator-product fit here: a TPT creator who makes $50,000–150,000 annually on the platform, uses AI extensively for curriculum development, and already talks about their workflow publicly. This person's audience is your exact target user.

**Step 32: Build the TPT-specific configuration**

Based on Stage 1 feedback from educator users, create a dedicated onboarding path:
- On the Bootstrap screen, add a "Deployment type" selection before "Build My Studio"
- For EDUCATOR selection: pre-configure vector domains as LESSON_DESIGN, ASSESSMENT_WRITING, STANDARDS_ALIGNMENT, DIFFERENTIATION, PRODUCT_DEVELOPMENT
- Pre-configure admin ghost prompt: "What curriculum formatting, grading, or administrative tasks steal your time?"
- Pre-configure necessary struggle prompt: "What student work will you never automate?"

This is one week of engineering work that makes the product feel built for educators rather than adapted for them. It materially improves activation rates in that segment.

---

### Month 14–18: Fine-Tuning Pipeline Construction

**Step 33: Curate the training dataset**

From your `training_pairs` table, run a quality filter:
- Remove pairs where output JSON has any validation warnings (near-miss quality)
- Remove pairs from users with high NEEDS_CURATOR rates (lower quality inference)
- Remove sessions shorter than 2,000 characters (not enough content)
- Randomly sample to ensure domain diversity across the vector categories

Target: 20,000–50,000 high-quality (input, output) pairs for initial fine-tuning run.

**Step 34: Choose your fine-tuning approach**

Options:
- **Together AI:** Managed fine-tuning service, $3/million tokens for Llama 3 fine-tuning. No infrastructure to manage. Recommended for first fine-tuning run.
- **Modal Labs:** Serverless GPU compute with good Python tooling. More control, similar pricing.
- **GCP Vertex AI:** Fine-tune Gemma models directly in the Google ecosystem. Tighter integration possible.
- **Self-managed on Lambda Labs / CoreWeave:** Cheapest at scale, most complex.

Start with Together AI for the first fine-tuning run. Switch to self-managed when you're running regular fine-tuning jobs.

**Step 35: Run the first fine-tuning experiment**

Fine-tune Llama 3 8B on your curated dataset. The goal is to validate the hypothesis that a fine-tuned smaller model can match Claude Sonnet quality on KOS-specific inference.

Evaluation criteria:
- JSON validity rate: target > 95%
- Schema compliance rate: target > 92%
- Semantic quality vs Sonnet: evaluate 200 sessions manually, score 1–5 on extraction accuracy
- NEEDS_CURATOR rate in A/B test: target within 2 percentage points of Sonnet

If the fine-tuned model passes all four criteria: proceed to Step 36.
If it fails: run another fine-tuning round with more data or a larger base model (13B). Document what types of sessions it fails on and ensure those are over-represented in the next training set.

---

### Month 18–24: Prepare for Stage 3

**Step 36: Build the model serving infrastructure**

While still running on the Anthropic API for all production traffic, build and test the self-hosted serving infrastructure in parallel:

Deploy a reserved GCP `g2-standard-4` (L4 GPU, $400/month reserved):
- Install Ollama or vLLM for model serving
- Load the fine-tuned model
- Run the full KOS pipeline against this model in a staging environment
- Shadow-mode testing: for 10% of production sessions, run both Sonnet and the fine-tuned model. Compare outputs. Do not use the fine-tuned output in production yet.

Shadow-mode testing gives you weeks of real-world quality data before you make the switch.

**Step 37: Build the hybrid routing logic**

Before switching fully to the fine-tuned model, implement routing logic in `worker.js`:

```javascript
function selectModel(payloadType, sessionLength, userTier) {
  // COG_STIMULUS always uses frontier model — quality is non-negotiable
  if (payloadType === 'COG_STIMULUS') return 'anthropic';
  // Short sessions on fine-tuned model are fine
  if (sessionLength < 10000) return 'fine-tuned';
  // Long complex sessions: use frontier model for Creator tier users
  if (sessionLength > 20000 && userTier === 'creator') return 'anthropic';
  // Default: fine-tuned model
  return 'fine-tuned';
}
```

This lets you preserve Sonnet quality for high-stakes inference (council reviews, Creator tier users) while routing standard sessions to the cheaper fine-tuned model.

**Stage 2 complete when:**
- 5,000 registered users
- ~2,000 paid users
- MRR > $28,000
- Fine-tuned model passes quality evaluation
- Shadow-mode testing shows < 1% quality delta vs Sonnet for standard sessions
- Training dataset has > 50,000 quality pairs

---

# STAGE 3
## Months 24–36: Scale Phase, 5,000–10,000 Users

**Infrastructure:** Hybrid — fine-tuned model for standard sessions, Anthropic API for council/complex
**Primary metric:** Gross margin improvement
**Stage complete when:** 10,000 registered users, ~4,500 paid users, MRR > $63,000, blended COGS < $0.005/session

---

### Month 24–26: Infrastructure Transition

**Step 38: Switch standard inference to fine-tuned model**

With shadow-mode validation complete, route all standard SESSION_LOG and EXTERNAL_DATA inference to the fine-tuned model on the reserved VM. Keep COG_STIMULUS and Creator tier sessions on Sonnet.

Monitor for two weeks:
- NEEDS_CURATOR rate: alert if it rises above 6%
- Processing time: alert if average exceeds 45 seconds
- User complaints: watch for an uptick in support tickets about poor extraction quality

If all clear after two weeks: the switch is complete. Estimated COGS reduction: $0.016 → $0.005 per standard session.

Financial impact at 5,000 users processing 4 sessions/week:
- Monthly sessions: 80,000
- Before: 80,000 × $0.016 = $1,280/month in COGS
- After: 80,000 × $0.005 = $400/month in COGS
- Monthly saving: $880 → $10,560/year

**Step 39: Implement continuous fine-tuning**

Set up a monthly fine-tuning pipeline:
1. Export new training pairs from the last 30 days
2. Quality filter and deduplicate
3. Fine-tune on the accumulated dataset (not just new pairs)
4. Evaluate against the previous model version
5. If better: deploy to production. If not: investigate.

The model improves every month as more operator context accumulates in the training data. This is the compounding moat — the model becomes progressively more calibrated to the specific extraction patterns of KOS users.

---

### Month 26–30: Team Building

At $63,000+ MRR, you have enough revenue to bring in support. The first hire should address your biggest constraint.

**Step 40: Identify your constraint**

Common constraints at this stage:
- **Support volume:** You're spending 10+ hours/week on support tickets. Hire part-time support.
- **Engineering capacity:** There's a backlog of product improvements you can't get to. Hire a part-time contractor for specific features.
- **Distribution:** You've maximized your personal network and need systematic growth. Bring in a part-time growth/content person.

The worst hire at this stage: a full-time employee in any function before you know the constraint. The best hire: a contractor in your specific bottleneck function for 20 hours/week.

**Step 41: Document everything before delegating anything**

Before anyone else touches the product, codebase, or customer communications, every process needs a written playbook. At minimum:
- How to handle a NEEDS_CURATOR support ticket
- How to issue a refund
- How to add credits to a user account manually
- How to restart the worker if it stops processing
- How to deploy a new version of the inference service
- How to run the monthly fine-tuning pipeline

These playbooks live in a private Notion workspace. They are the foundation of operational scale.

---

### Month 30–36: Expansion

**Step 42: Launch the Creator vertical fully**

By now you have enough educator users to understand their specific needs deeply. Build and launch the Creator Edition:
- TPT-specific vector domains live in production
- Creator tier includes a TPT product catalog integration (Sensor 3 watching a TPT sales export sheet)
- Creator tier includes a differentiation prompt: "What student populations do you serve who require modified materials?"
- Creator tier includes a lesson plan template library in CCPS_Master_Templates pre-populated with common structures

This is not a new product — it's a configuration of the existing product targeted at the highest-value segment.

**Step 43: Explore the second vertical**

Based on Stage 1 and Stage 2 user data, you know which non-TPT professions have the highest activation and retention rates. That's your second vertical. Build a similar configuration package for them.

Common candidates based on the KOS value proposition:
- Independent consultants (strong admin ghost problem, high hourly rate = strong ROI)
- Academic researchers (long sessions, complex decision trees, clear state evolution over time)
- Executive coaches (session-heavy, relational targets concept maps directly)

**Stage 3 complete when:**
- 10,000 registered users
- ~4,500 paid users
- MRR > $63,000
- Blended COGS < $0.005/session
- Monthly fine-tuning pipeline is automated and running
- At least one contractor or part-time hire is handling their function well

---

# STAGE 4
## Month 36+: Infrastructure Maturity, 10,000+ Users

**Infrastructure:** Evaluate full self-hosting on owned hardware
**Primary metric:** Infrastructure cost per session
**Trigger for owned hardware evaluation:** Monthly compute spend > $5,000 on reserved VMs

---

### Month 36–38: Owned Hardware Evaluation

**Step 44: Run the hardware cost analysis**

At 10,000 users processing 4 sessions/week:
- Monthly sessions: 160,000
- Monthly fine-tuned model inference cost (reserved VM): ~$800 (1 VM at $400 + overhead)
- Monthly Sonnet API cost (council + Creator tier): ~$400
- Total monthly compute: ~$1,200

At this volume, owned hardware is not yet justified — monthly compute is well below the $5,000 threshold where hardware depreciates competitively against cloud.

Revisit this calculation at 25,000 monthly active users.

**Step 45: If the threshold is met, evaluate colocation**

If monthly cloud compute exceeds $5,000:

1. Get quotes from colocation providers near you (Equinix, Coresite, local data centers)
2. Price out the hardware: 2× A100 80GB server = ~$25,000
3. Calculate payback period: $25,000 ÷ ($5,000 - $800 operating cost) = ~6 months
4. Make the decision: if payback period < 12 months and you have the capital, buy. Otherwise, stay on cloud.

At this stage you should have a part-time infrastructure contractor who can manage the hardware. Do not buy servers you can't maintain.

---

### Ongoing: The Moat Deepens

**Step 46: The fine-tuned model becomes your primary differentiator**

By Month 36, the fine-tuned model has been trained on 500,000+ KOS-specific session-to-JSON pairs. It is the best inference model in existence for this specific task. No competitor can replicate it without building the same user base and accumulating the same data.

This is the proprietary asset that makes KOS defensible against both well-funded competitors and Google building something adjacent.

**Step 47: Evaluate operator-level fine-tuning**

For Creator tier users with 100+ sessions processed, explore per-operator fine-tuning: a model variant fine-tuned on that specific user's session history. This produces inference that is calibrated to the individual operator's vocabulary, decision patterns, and domain emphasis — not just the aggregate user base.

This is computationally expensive but deeply differentiating. A model that knows your specific writing style, decision vocabulary, and relational context produces extraction that feels uncannily accurate.

At $49/month Creator tier, operator-level fine-tuning may require a separate higher tier ($99/month Professional+). The economics work if users stay for 24+ months, which the compounding value story makes likely.

---

## Critical Path Summary

The single most important thing at each stage:

| Stage | The One Thing |
|---|---|
| Pre-launch | Pipeline must work end-to-end without manual intervention |
| Stage 1 (months 1–6) | Get to 21 paid users (breakeven) |
| Stage 1 (months 6–12) | Get a well-known TPT creator to genuinely endorse KOS |
| Stage 2 | Build the fine-tuning dataset while the Anthropic API pays for itself |
| Stage 3 | Deploy the fine-tuned model and prove the margin improvement |
| Stage 4 | Build the per-operator fine-tuning capability |

---

## What Not to Do

**Do not raise external funding before Stage 2.** The business is profitable at 21 users. External funding creates pressure to grow faster than the quality infrastructure can support. The compounding value proposition requires users to stay for months. Forced growth with a broken experience destroys that.

**Do not hire a full-time employee before MRR > $30,000.** A full-time hire at $80,000/year salary requires ~250 paying users just to cover the cost. Before that threshold, contractors are more flexible and less risky.

**Do not add features before fixing retention.** If month-3 retention is below 40%, adding features will not fix it. Talk to users who churned. Fix the thing that caused them to leave.

**Do not compete on price.** KOS's value is not that it's cheap — it's that it's the only tool that processes sessions as the primary unit, calibrates to operator values, and compounds with use. Competing on price attracts users who will leave for the next cheap thing.

**Do not neglect the open-source community.** The self-hosted users who deploy KOS without the managed inference service are not revenue — but they are your public credibility, your bug reporters, your most engaged community members, and your best source of engineering talent when you're ready to hire. Treat them as well as paid users.
