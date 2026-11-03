export const meta = {
  name: 'ref5-evidence-evaluation',
  description: 'Evidence-based independent evaluation of the REF5 strength program: research sweep, source verification, two-lens synthesis, adversarial claim checks, report',
  phases: [
    { title: 'Research', detail: '8 evidence dimensions + internal spec/code/data analysis' },
    { title: 'Verify sources', detail: 'confirm each cited source exists and says what is claimed' },
    { title: 'Synthesize', detail: 'two independent evaluator lenses, then merge into claims' },
    { title: 'Challenge', detail: 'adversarial verification of each claim from two lenses' },
    { title: 'Report', detail: 'completeness critic + final Korean report' },
  ],
}

const BRIEF = `
## REF5 Adaptive Strength v1.4 — program under evaluation (facts; spec at /home/claude/workout-log/docs/ref5-program-spec.md, engine packages/core/src/program-engine/ref5.ts)
Session-queue (not calendar) strength program for an irregular 2–4 sessions/week schedule. Exactly 5 barbell lifts: high-bar back squat (SQ, top priority), weighted pull-up (PULL, tracked as TOTAL load = bodyweight + added), bench press (BP), deadlift (DL, capped so DL REF <= SQ REF), overhead press (OHP, capped at BP REF x 0.5). No accessories. Since v1.4 a self-assisted one-arm pull-up (OAP) "skill slot" replaces the normal-session PULL volume slot on BP-focus days.
Session types: NORMAL alternates PULL-focus / BP-focus.
- Normal PULL-focus: SQ (H3/H2/V) 3 sets -> PULL focus 3x3 -> BP volume 2x5 -> DL 2x4 (10 work sets).
- Normal BP-focus: SQ 3 sets -> BP focus 3x3 -> OAP slot (per arm 2x3 assisted, counted as 2 pair-sets; +1x2 one-arm negatives per arm once rung>=4) -> OHP 2x6 (10–11 sets).
- MICRO (density valve): SQ V 2x5, BP volume 1x5, PULL volume 1x6 (4 sets). Micro if: user chooses (any reason), both previous two calendar days were program days, >=3 normal starts in previous 6 days, forced micro (new FAILs in 2 different main lifts within last 2 sessions), or stagnation micro pending.
- SQ prescriptions: H3 = 3x3 at direct standard; H2 = 3x2 at H3+5kg; V = 3x5 at floor2.5(H3*72.5/82.5) (~88% of H3). Hard (H3/H2 alternating) only if >=48h since last hard start AND <2 hard starts in prior 168h; else V.
- Derived: BP volume = BP focus*70/82.5 (2x5); PULL volume target total = PULL focus total*75/87.5 (1x6 micro only).
- Set termination: stop before a rep that can't keep ROM/technique; the first "obvious slowdown" rep counts and then the set ends; no extra reps beyond prescription; no intentional failure. Session RPE target ~7–8. No RIR, no AMRAP, no velocity device, no 1RM tests.
- Outcome per exercise: PASS (all prescribed reps, no obvious slowdown), HOLD (1 rep short, or all reps but obvious slowdown), FAIL (>=2 reps short for strength/technique reasons), INVALID (safety/external; excluded).
- Progression windows: SQ = 6 valid normal hard (H3/H2) exposures; BP/PULL = 4 valid normal focus exposures. Increase +2.5 kg only if FAIL 0 AND HOLD <=1 AND no volume FAIL veto during window; else "maintain". DL/OHP: 4 normal exposures all PASS and candidate within cap -> +2.5.
- Immediate decrease: 2 consecutive valid FAILs in the same stream -> -2.5 kg before next exposure.
- Stagnation: two consecutive "maintain" windows -> stagnation micro -> reassessment -> if still maintain, direct standard lowered. No scheduled deloads (deliberate; cites Coleman 2024 deload RCT). structureReview procedure: recovery audit first (sleep, protein >=1.6 g/kg, weight-loss rate), then stimulus/volume audit.
- Load grid 2.5 kg everywhere (OHP 1.25 microloading was withdrawn: gym's smallest plate is 1.25/side).
- Rest (engine prescribes, overrides user setting): SQ hard & BP/PULL focus 240 s; volume/OHP/micro/OAP 150 s; DL 180 s.
- Expected weekly work sets (spec table): 2x/wk SQ 6, BP 5, PULL 3, OAP pairs 2, DL 2, OHP 2; 3x/wk SQ 9, BP 7–8, PULL 4–5, OAP ~3, DL ~3, OHP ~3; 4x/wk SQ ~11, BP 8–9, PULL 5–6, OAP ~3, DL ~3, OHP ~3.
- Starting values (v1.1): SQ H3/H2/V 82.5x3 / 87.5x2 / 72.5x5; PULL focus total 87.5 3x3; BP focus 82.5 3x3, BP vol 70x5; DL 72.5 2x4; OHP 32.5 2x6. Control REFs (NOT 1RM): SQ 104, BP 101, PULL 108 total, DL 100, OHP 50. So SQ H3 ~79–82% of the user's stated ~103–104 1RM, H2 ~84–87%, V ~70%.
- OAP ladder (v1.4): fixed 6 rungs of self-assist hand position (1 wrist, 2 forearm[default start], 3 elbow, 4 upper arm = negatives unlock, 5 shoulder, 6 free). Per-arm independent. Per arm 2x3. Promote after 3 consecutive PASS at a rung; demote after 2 consecutive FAIL (floor rung 1); HOLD breaks both streaks; INVALID neutral. Rung 6 x3 PASS = achieved -> maintenance (rung 5 2x3 + free 1x1 at most once per 168h). OAP is fully independent of all kg progression. Operational (non-enforced) guidelines: no climbing the day before/of OAP; stay >=2 weeks on a new rung; stop slot on elbow discomfort. A "revert" input restores v1.3 PULL volume 2x6 instead of OAP for that session.
- Known weaknesses the spec itself lists (§22.4): 2x/wk may give too little BP/PULL volume; 4x/wk micro limit may understimulate; stagnation decrease can't tell overload from underload; long calendar time to reassess at 2–3x/wk; OHP +2.5 is a large step and cap can freeze it; PULL lock varies with bodyweight; binary slowdown judgment discards velocity info; no max test so REF can't prove goal attainment; v1.4 reduces PULL weekly sets ~8->~6 and makes the PULL volume veto rare (judgment slightly more lenient); OAP rungs are ordinal not equal-interval.

## The athlete (user) — from their constraints sheet + handoff
- Goal G1: high-bar back squat 175 kg at ~70 kg bodyweight (2.5x BW), multi-year, KPI = squat e1RM / bodyweight. G2 squat first. G3 high-bar is the target lift. G6 (added 2026-09): one-arm pull-up (first target: one-arm chin-up), upper-body #1 priority, overall #2.
- Bodyweight ~75 kg, plans a slow recomp/cut to ~70 kg at ~0.25%/wk; refuses bulking (climbing performance).
- History: high-bar squat 1RM ~103 kg (92.5x3 @ RPE 9–10), ~1 year plateau. Weighted pull-up best +40 kg (BW 65–75), last 1RM total 110 (75+35). Failed approaches: 5x5 linear (stalled), 5/3/1 Wendler (too little squat frequency), nSuns 5/3/1 (too much volume for their recovery), Tactical Barbell Operator (insufficient proximity; TM drift up to real capacity unnoticed). Common diagnosis they adopted: never had frequency + proximity + recoverable volume together.
- Constraints: C1 irregular training days (clusters and 2–3+ day gaps); C2 poor nutrition/recovery (work, social); C3 indoor bouldering/climbing (1–2x/month per sheet; elsewhere described as ongoing); C4 2–4 sessions/week; C5 only the 5 lifts, no accessories; C6 squat #1; C7 DL <= squat; C8 OHP <= 0.5x bench; C9 no 1RM tests; C10 rejects RIR (finds it ambiguous); C11 no competition, wants steady increases, no peaking; does not want grinding/form breakdown each session.
- Knee: pain at quadriceps tendon insertion (suprapatellar; quadriceps tendinopathy-like, NOT diagnosed), present in daily activities (stairs, sit-to-stand). Managed outside the program with depth/posture control and warm-up isometric leg extensions (45 s x 4–5, pain 0–3/10). Program auto-micro is not treated as rehab.
- Elbow risk ledger: heavy pull-ups + OAP + climbing.

## Real training record (DB, read-only, verified 2026-10-14)
28 sessions since 2026-07-19 (old plan 15 sessions 7/19–9/01 ~2.3/wk; current v1.4 plan 13 sessions 9/05–10/06 ~2.9/wk; then an 8-day gap through 10/14). Direct standards: SQ H3 80 -> 85 (H2 85 -> 90), BP focus 80 -> 85, PULL added load +7.5 -> +15 (total 90 incl. a cutover calibration), DL 72.5 -> 75, OHP 30 -> 32.5. Every main-lift window so far ended INCREASE; no main-lift HOLD/FAIL recorded. SQ 6-hard window took ~24–25 days (hard exposures ~1.75/week while sessions ~2.9/week). OAP: 9/07 rung 2 L 2+2 R 2+1 FAIL; 9/12 L 1+2 R 1+2 FAIL -> both demoted to rung 1; 9/21 L 2+3 HOLD R 3+3 PASS; 9/24 L 3+2 HOLD R PASS; 10/04 both PASS -> right promoted to rung 2. Twice a heavy PULL session and an OAP session were ~24 h apart. Logged bodyweight is 75 kg on every session (probably a default, not measured — unconfirmed).
`

const FIXED = `
User-fixed principles (do not recommend violating; you may describe the evidence-based COST of a constraint, but recommendations must stay inside them): exactly 5 lifts + OAP slot, no accessories; squat first; no 1RM tests; no RIR; no AMRAP; no scheduled deloads unless evidence is strong (then present as a §26-style proposal, not a directive); do NOT propose relaxing the judgment criteria (FAIL 0, HOLD<=1, volume veto) — the user has pre-registered that low success rate is first read as insufficient stimulus or recovery; propose at most one protocol element change at a time; do not mix in other programs wholesale — compare at the level of principles.
Rules for you: read-only. Never call any mcp__hearthbot__ tool. Do not write to /mnt/project-files or modify the repo or database. Distinguish direct evidence from extrapolation from coaching opinion. Prefer meta-analyses, RCTs, position stands; give real URLs (PubMed/DOI/publisher). Never invent a citation; if unsure a paper exists, say so or leave it out. Today is 2026-10-15; seek the most recent work (2020–2026) as well as foundational studies.
`

const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    dimension: { type: 'string' },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          citation: { type: 'string', description: 'authors, year, title, journal' },
          year: { type: 'integer' },
          url: { type: 'string' },
          kind: { type: 'string', description: 'meta-analysis | RCT | cohort | review | position stand | consensus | coaching source | program document | other' },
          finding: { type: 'string', description: 'what it actually found, with numbers where available' },
          relevanceToREF5: { type: 'string' },
        },
        required: ['citation', 'url', 'kind', 'finding', 'relevanceToREF5'],
      },
    },
    implicationsForREF5: { type: 'array', items: { type: 'string' } },
    uncertainties: { type: 'array', items: { type: 'string' } },
  },
  required: ['dimension', 'sources', 'implicationsForREF5', 'uncertainties'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    checked: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          citation: { type: 'string' },
          url: { type: 'string' },
          status: { type: 'string', enum: ['confirmed', 'corrected', 'misattributed', 'not_found', 'unverifiable'] },
          verifiedFinding: { type: 'string', description: 'finding as actually reported by the source (corrected if needed)' },
          note: { type: 'string' },
        },
        required: ['citation', 'status', 'verifiedFinding'],
      },
    },
    implicationsStillSupported: { type: 'array', items: { type: 'string' } },
    implicationsWeakened: { type: 'array', items: { type: 'string' } },
  },
  required: ['checked', 'implicationsStillSupported', 'implicationsWeakened'],
}

const DIMENSIONS = [
  { key: 'volume-frequency', prompt: `Dimension: training VOLUME and FREQUENCY dose-response for maximal strength (and hypertrophy as secondary), especially in trained/intermediate lifters. Cover: Pelland et al. 2024/2025 volume & frequency meta-regression (check https://pubmed.ncbi.nlm.nih.gov/41343037/), ACSM 2026 resistance training position stand/guidelines (check https://pubmed.ncbi.nlm.nih.gov/41843416/), Ralston 2017, Grgic 2018 frequency, Schoenfeld 2017/2019 volume, Currier 2023 network meta-analysis, Androulakis-Korakakis 2020 minimal dose, Iversen 2021 minimal dose, Nuckols/SBS analyses of sets per week. Evaluate REF5's weekly hard sets per lift (SQ ~6–11, BP ~5–9, PULL ~3–6 + OAP, DL/OHP ~2–3), low per-session volume (10 sets total), and the 2x/week case. Also: does squat frequency 2–4x/week matter for strength independent of volume?` },
  { key: 'proximity-autoregulation', prompt: `Dimension: PROXIMITY TO FAILURE, set termination and AUTOREGULATION. Cover: Robinson et al. 2024 proximity-to-failure meta-regression (check https://pubmed.ncbi.nlm.nih.gov/38970765/), Refalo 2023/2024, Grgic 2022 failure vs non-failure, Vieira 2021, velocity-loss literature (Pareja-Blanco 2017/2020, Jukic 2023/2024 velocity loss meta-analyses, the 2025/2026 bench velocity-loss study https://pubmed.ncbi.nlm.nih.gov/41872733/), autoregulation meta-analyses (Hickmott 2022, Larsen 2021), RPE/RIR accuracy in trained lifters (Halperin 2022, Remmert 2023), "first obvious slowdown" / perceived bar-speed stopping as a proxy. Evaluate REF5's binary PASS/HOLD/FAIL with stop-at-first-obvious-slowdown, no RIR, and the athlete's history of TM drift and grinding. Is ~2–4 RIR-equivalent training sufficient for strength gains in intermediates?` },
  { key: 'intensity-progression', prompt: `Dimension: LOAD/INTENSITY and PROGRESSION MODELS for maximal strength. Cover: heavy vs moderate load meta-analyses (Lopez 2021, Schoenfeld 2017/2021 low vs high load, Carvalho 2022, Currier 2023), specificity of heavy singles/doubles/triples for 1RM, the "strength is a skill" practice effect, linear vs undulating vs block periodization meta-analyses (Moesgaard 2022 periodization MA, Harries 2015, Williams 2017), double-progression vs fixed-increment progression, effect of increment size (2.5 kg) and of stall/reset rules, deloads and taper (Coleman 2024 deload RCT, Bell 2023 deload Delphi consensus, Bell 2024 survey), training cessation/detraining timelines (Bosquet 2013, Androulakis 2024?). Evaluate REF5's ~70–87% intensity zone with 3x3/3x2/3x5, the 6/4-exposure judgment windows with +2.5 kg steps, immediate -2.5 after 2 consecutive FAILs, stagnation decreases, no planned deload, and the fact that no max is ever tested. Also realistic rates of strength gain in intermediate/advanced trained men and women (e.g., Latella 2020?, Steele 2023 trained-population progression, Nuckols analyses), to judge whether +2.5 kg per ~3.5 weeks on squat is fast, slow, or reasonable.` },
  { key: 'recovery-deficit-concurrent', prompt: `Dimension: RECOVERY CONTEXT — energy deficit, protein, sleep, concurrent climbing, and exercise order. Cover: Murphy & Koehler 2022 energy deficit meta-analysis (check https://pubmed.ncbi.nlm.nih.gov/34623696/), Roth 2023? on deficit and strength, Helms 2014 contest prep, protein dose (Morton 2018, Nunes 2022), sleep restriction and performance meta-analyses (Craven 2022, the 2025 study https://pubmed.ncbi.nlm.nih.gov/40663194/, Knowles 2018), concurrent training interference meta-analyses (Wilson 2012, Schumann 2022, Petré 2021) and specifically climbing/bouldering demands on forearm flexors/elbow (climbing injury epidemiology, e.g., Lutter, Schöffl), exercise order meta-analysis (Nunes 2021, check https://pubmed.ncbi.nlm.nih.gov/32077380/), inter-session recovery after heavy squats/pulls (48–72 h time-course studies, e.g., Bartolomei, Raastad, Belcher 2019?). Evaluate REF5's decisions: SQ always first, 48h/168h hard-density gates, micro density valve for clustered days, no scheduled deload, ignoring climbing in the engine, PULL focus/OAP proximity, recomposition at 0.25%/wk while expecting strength gains, and the user's self-reported poor recovery.` },
  { key: 'oap-tendon-unilateral', prompt: `Dimension: ONE-ARM PULL-UP skill acquisition, UNILATERAL/BILATERAL specificity, eccentrics, and TENDON adaptation/injury risk (elbow, plus the athlete's knee). Cover: unilateral vs bilateral training specificity meta-analysis (check https://pubmed.ncbi.nlm.nih.gov/39794667/), cross-education, eccentric/negative training for strength, assisted-progression methods for one-arm pull-ups/chin-ups in calisthenics coaching (Steven Low "Overcoming Gravity" and https://stevenlow.org/prilepin-tables-for-bodyweight-strength-isometric-and-eccentric-exercises/, Antranik, FitnessFAQs, climbing coaches like Lattice Training / Eva López / Tyler Nelson on one-arm work), typical prerequisites (e.g., weighted pull-up at ~+50–70% BW often cited), how long OAP typically takes; tendon adaptation time course (Bohm 2015 tendon meta-analysis, Magnusson & Kjaer, Baar), elbow (medial epicondyle, biceps/brachialis) injury epidemiology in climbers and pull-up athletes; quadriceps/patellar tendinopathy load management (isometrics Rio 2015 vs later trials van Ark 2016, Pearson 2020; heavy slow resistance Kongsgaard 2009; Malliaras 2015; and the clinical-literature limits noted at https://pubmed.ncbi.nlm.nih.gov/30963066/), squat depth & knee loading. Evaluate REF5's OAP ladder (ordinal hand-position assistance, 2x3 per arm, 3-PASS promote, 2-FAIL demote, ~1.5 exposures/week, placement after heavy BP focus, negatives from rung 4), the assumption that OAP replacing PULL volume is a good trade, and the knee being outside program scope.` },
  { key: 'program-comparison-a', prompt: `Dimension: COMPARISON WITH ESTABLISHED PROGRAMS, part A (submaximal / autoregulated / frequency-oriented). Compare REF5 at the level of PRINCIPLES (input burden, specificity, volume, intensity, progression rule, fatigue management, handling of irregular schedules, failure modes) with: Tactical Barbell Operator/Zulu/Fighter (https://www.tacticalbarbell.com/operator-options/), Wendler 5/3/1 incl. "5/3/1 for a Beginner" and Leader/Anchor and 5/3/1 Krypteia (https://www.jimwendler.com/blogs/jimwendler-com/101065094-5-3-1-for-a-beginner), Pavel Tsatsouline Easy Strength / Grease the Groove / Power to the People, Dan John, "squat every day" (Broz), Bulgarian-inspired high-frequency submax approaches, Sheiko (frequency, volume at 70–85%), Mike Tuchscherer RTS/emerging strategies. For each: what does it do that REF5 does better or worse given THIS athlete's constraints (irregular schedule, poor recovery, no RIR, no AMRAP, no 1RM test, plateau history)? Note which of these the athlete has already failed on and why.` },
  { key: 'program-comparison-b', prompt: `Dimension: COMPARISON WITH ESTABLISHED PROGRAMS, part B (evidence-based / periodized / linear). Compare REF5 at the level of PRINCIPLES with: Stronger by Science programs (Reps to Failure / Hypertrophy / Strength / 2-day-3-day templates; https://www.strongerbyscience.com/program-bundle/), Juggernaut Method, GZCL (GZCLP, Jacked & Tan), nSuns, Texas Method, Madcow 5x5, StrongLifts/Starting Strength/advanced novice progressions, Renaissance Periodization approaches (MEV/MRV, auto-regulated volume), Calgary Barbell programs, and the "minimum effective dose" programs. Focus on how each handles progression after the novice phase, deloads, volume landmarks, autoregulation without RIR (e.g., rep-out tests, AMRAP-driven TM updates) and what REF5 gives up by refusing AMRAPs, RIR and maxes. Identify any principle with good evidence that REF5 lacks AND that could be added without violating the user's fixed constraints.` },
  { key: 'goal-feasibility', prompt: `Dimension: GOAL FEASIBILITY and STRENGTH STANDARDS. Using data sources (OpenPowerlifting-based analyses, Strength Level / Symmetric Strength norms with caveats, Greg Nuckols' analyses of strength progression and genetic limits, Latella/Steele studies on trained-lifter progression, IPF/USAPL weight-class data, research on 1RM-to-bodyweight ratios), estimate how rare a 175 kg HIGH-BAR raw squat at ~70 kg bodyweight (2.5x BW) is, the typical gap between high-bar and low-bar/competition squat, and realistic multi-year timelines from a ~103 kg 1RM with 1 year of plateau, while losing ~5 kg and training 2–4x/week with ~10 sets/session. Also the realistic feasibility of a one-arm chin-up for someone with weighted pull-up total ~110 kg at ~75 kg BW, and typical timelines. Then judge whether REF5's maximum progression rate (SQ +2.5 kg per 6 hard exposures, roughly per 3–4 weeks at observed frequency ~= 30–40 kg/yr ceiling) is the binding constraint or not, and what the realistic binding constraints are.` },
]

const researchPrompt = (d) => `You are a sports-science and strength-coaching researcher helping produce an independent, objective evaluation of a custom strength program called REF5.
${BRIEF}
${FIXED}
${d.prompt}

Method: load tools first with ToolSearch query "select:WebSearch,WebFetch" (and optionally "mcp__Exa__web_search_exa" / "mcp__Exa__web_fetch_exa"). Run MANY searches (aim for 15+), in the same turn when independent; use WebSearch mode "standard" by default and "extended" for niche/recent items. Fetch PubMed/publisher pages to read abstracts rather than relying on memory. Collect as many relevant, real sources as you can (target 12–25), including the most recent (2023–2026). For coaching sources, cite the actual author page. Then state concrete implications for REF5 (each implication should name which REF5 rule it concerns and whether the evidence supports, contradicts, or is silent on it) and the main uncertainties. Return structured output.`

const verifyPrompt = (d, r) => `You are a meticulous fact-checker for sports-science citations. Another researcher produced the findings below for the dimension "${d.key}" of an evaluation of a strength program (REF5).
${FIXED}
Load WebSearch/WebFetch via ToolSearch ("select:WebSearch,WebFetch"). For EVERY source: confirm it exists (fetch the URL or find it on PubMed/DOI/publisher), confirm authors/year roughly match, and confirm the stated finding matches what the abstract/page actually says. Mark status confirmed / corrected (exists but finding or details needed correction — give the corrected finding) / misattributed (finding belongs to a different paper — say which) / not_found / unverifiable (paywalled coaching material etc.). Be skeptical of numbers. Then re-check each implication: list those still supported by confirmed sources and those weakened (with reason).

Findings to check (JSON):
${JSON.stringify(r)}`

const INTERNAL_PROMPT = `You are an analyst producing an INTERNAL characterization of the REF5 program from its normative spec, code and the athlete's real records, to be used by evaluators.
${BRIEF}
${FIXED}
Read /home/claude/workout-log/docs/ref5-program-spec.md in full (it is ~1100 lines; read all of it, especially §3, §7–§23, §27–§28) and skim packages/core/src/program-engine/ref5.ts where needed. You may run READ-ONLY SQL against Supabase (load mcp__Supabase__execute_sql via ToolSearch; project_id "edaoieuohxtqiyzcwnjj"). ALWAYS filter the athlete with user_id::text LIKE '6f47ec53%' and exclude the demo account f7e726df…; plans are named 'REF5 Adaptive Strength 프로그램' (old) and 'REF5 Adaptive Strength 프로그램 2' (current). Tables: plan, plan_runtime_state(state jsonb), workout_log(plan_id, user_id, performed_at), workout_set(log_id, exercise_name, weight_kg, reps, sort_order, meta jsonb incl. meta.ref5 outcome info). SELECT only.
Produce (markdown, dense, numbers over prose):
1. Per-lift intensity relative to the athlete's best known numbers (SQ 1RM ~103; PULL total 110; use REF only as a proxy and say so), weekly hard sets actually achieved (by week, from the records), sets per session, session density, and estimated proximity to failure implied by "stop at first obvious slowdown" (state that this is inferred).
2. Progression mechanics math: minimum calendar time per window for each lift at 2/3/4 sessions per week given the 48h/168h gates and micro rules; resulting theoretical maximum kg/year per lift; observed window durations from the records; how a cutover/new plan resets windows.
3. Any record-level signals: reps achieved vs prescribed, any HOLD/FAIL/INVALID or endReason in meta, session timing patterns (consecutive days, gaps), whether bodyweight looks measured, OAP per-arm sequence.
4. Internal-consistency issues you notice in the spec relevant to training effectiveness (not UI): e.g., the claimed 48h separation of PULL focus and OAP not enforced; 2-week rung stay not enforceable; PULL veto now rare; OHP cap freezing; DL volume tiny; BP volume vs focus; etc.
5. A neutral list of what the program is optimised for and what it trades away.`

const CLAIMS_SCHEMA = {
  type: 'object',
  properties: {
    overall: { type: 'string' },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          area: { type: 'string', description: 'e.g. volume, frequency, intensity, proximity/autoregulation, progression/windows, deload/fatigue, recovery/deficit, concurrent climbing, OAP, knee/elbow, goal feasibility, comparison, measurement' },
          claim: { type: 'string' },
          verdict: { type: 'string', enum: ['strength', 'weakness', 'risk', 'tradeoff', 'unknown'] },
          evidence: { type: 'array', items: { type: 'string' }, description: 'verified citations or record facts supporting it' },
          reasoning: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          recommendation: { type: 'string', description: 'optional; must respect fixed constraints; one element at a time' },
          changeClass: { type: 'string', enum: ['protocol', 'doc-or-display', 'operational', 'observation-only', 'none'] },
        },
        required: ['id', 'area', 'claim', 'verdict', 'evidence', 'reasoning', 'confidence', 'changeClass'],
      },
    },
  },
  required: ['overall', 'claims'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    holds: { type: 'string', enum: ['holds', 'holds-with-revision', 'refuted', 'insufficient-evidence'] },
    revisedClaim: { type: 'string' },
    revisedConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reasons: { type: 'string' },
    recommendationOk: { type: 'boolean', description: 'false if the recommendation violates fixed constraints, is unsupported, or changes more than one protocol element' },
  },
  required: ['holds', 'revisedConfidence', 'reasons', 'recommendationOk'],
}

phase('Research')
const internalP = agent(INTERNAL_PROMPT, { label: 'internal:spec+code+records', phase: 'Research' })

const researched = await pipeline(
  DIMENSIONS,
  (d) => agent(researchPrompt(d), { label: `research:${d.key}`, phase: 'Research', schema: RESEARCH_SCHEMA }),
  (r, d) => r ? agent(verifyPrompt(d, r), { label: `verify:${d.key}`, phase: 'Verify sources', schema: VERIFY_SCHEMA }).then(v => ({ key: d.key, research: r, verification: v })) : null,
)
const internal = await internalP
const evidence = researched.filter(Boolean)
const dropped = DIMENSIONS.filter((d, i) => !researched[i]).map(d => d.key)
if (dropped.length) log(`Dimensions without results: ${dropped.join(', ')}`)

const nSources = evidence.reduce((a, e) => a + (e.verification?.checked?.length ?? 0), 0)
const nConfirmed = evidence.reduce((a, e) => a + (e.verification?.checked?.filter(c => c.status === 'confirmed' || c.status === 'corrected').length ?? 0), 0)
log(`Sources checked: ${nSources}, confirmed/corrected: ${nConfirmed}`)

const evidencePack = JSON.stringify(evidence.map(e => ({
  dimension: e.key,
  sources: (e.verification?.checked ?? []).filter(c => c.status === 'confirmed' || c.status === 'corrected'),
  rejectedSources: (e.verification?.checked ?? []).filter(c => !(c.status === 'confirmed' || c.status === 'corrected')).map(c => `${c.citation} [${c.status}]`),
  implicationsSupported: e.verification?.implicationsStillSupported ?? [],
  implicationsWeakened: e.verification?.implicationsWeakened ?? [],
  uncertainties: e.research?.uncertainties ?? [],
})))

phase('Synthesize')
const LENSES = [
  { key: 'sport-science', text: 'You are an exercise physiologist / sport scientist. Judge REF5 strictly by what the verified research supports, flagging extrapolations.' },
  { key: 'coaching', text: 'You are an experienced strength coach (powerlifting + calisthenics/climbing athletes). Judge REF5 by practical coaching logic, comparison to established programs, adherence, and this athlete\'s history and constraints — while staying consistent with the verified research.' },
]
const synthPrompt = (lens) => `${lens.text}
Produce an objective evaluation of REF5 for THIS athlete as a set of discrete, testable claims (aim for 14–22), covering at least: volume, frequency, intensity, proximity/autoregulation, progression windows & increments, stagnation/decrease logic, deload/fatigue management, recovery & energy deficit, concurrent climbing, exercise order, OAP design, tendon/knee/elbow risk, measurement/observability (no max test, REF proxy, bodyweight), goal feasibility, and comparison with established programs. Include genuine strengths, not only weaknesses. Every claim must cite verified sources from the evidence pack or the internal analysis/records; if evidence is thin, verdict 'unknown' or confidence low. Recommendations must respect the fixed constraints and change at most one protocol element each.
${BRIEF}
${FIXED}
## Internal analysis
${internal ?? '(internal analysis unavailable)'}
## Verified evidence pack (JSON)
${evidencePack}`

const synths = (await parallel(LENSES.map(l => () => agent(synthPrompt(l), { label: `synth:${l.key}`, phase: 'Synthesize', schema: CLAIMS_SCHEMA })))).filter(Boolean)

const merged = await agent(`Merge the two independent evaluations of the REF5 program below into ONE de-duplicated list of claims (keep 16–24). Where the two lenses agree, merge and keep the stronger evidence. Where they DISAGREE, keep a single claim that states the disagreement explicitly and set confidence accordingly. Preserve evidence citations. Keep ids short (C1, C2…). Also write a merged 'overall' paragraph.
${FIXED}
Evaluations (JSON):
${JSON.stringify(synths)}`, { label: 'synth:merge', phase: 'Synthesize', schema: CLAIMS_SCHEMA })

phase('Challenge')
const claims = merged?.claims ?? []
log(`Claims to challenge: ${claims.length}`)
const CH_LENSES = [
  { key: 'evidence', text: 'Lens: EVIDENCE FIDELITY. Try to refute the claim by checking whether the cited research actually supports it at the strength stated (population, outcome, effect size, trained vs untrained, direct vs extrapolated). You may search the web (ToolSearch "select:WebSearch,WebFetch") for counter-evidence.' },
  { key: 'applicability', text: 'Lens: APPLICABILITY TO REF5 AND THIS ATHLETE. Try to refute the claim by checking whether it correctly describes REF5\'s actual rules (spec at /home/claude/workout-log/docs/ref5-program-spec.md) and the athlete\'s records/constraints, and whether any recommendation violates the fixed constraints or bundles several protocol changes.' },
]
const challenged = await parallel(claims.map(c => () =>
  parallel(CH_LENSES.map(l => () => agent(`${l.text}
Default to skepticism: if you cannot establish the claim, say 'insufficient-evidence' or 'refuted'.
${BRIEF}
${FIXED}
Claim (JSON): ${JSON.stringify(c)}
Relevant verified evidence pack (JSON, for reference): ${evidencePack}`, { label: `challenge:${c.id}:${l.key}`, phase: 'Challenge', schema: VERDICT_SCHEMA })))
    .then(vs => ({ claim: c, verdicts: vs.filter(Boolean) }))
))

const finalClaims = challenged.filter(Boolean).map(x => {
  const v = x.verdicts
  const refuted = v.filter(y => y.holds === 'refuted').length
  const insufficient = v.filter(y => y.holds === 'insufficient-evidence').length
  const status = v.length === 0 ? 'unchallenged' : refuted >= 2 ? 'dropped' : (refuted === 1 || insufficient >= 1) ? 'contested' : 'kept'
  return { ...x, status }
})
log(`Kept: ${finalClaims.filter(c => c.status === 'kept').length}, contested: ${finalClaims.filter(c => c.status === 'contested').length}, dropped: ${finalClaims.filter(c => c.status === 'dropped').length}`)

phase('Report')
const critic = await agent(`You are a completeness critic for an evidence-based evaluation of the REF5 strength program. Given the claims and their challenge verdicts, list what is MISSING or under-supported: evidence dimensions not covered, important famous programs/coaching approaches not compared, claims relying on rejected sources, and any risk to the athlete not addressed. Be concrete and brief; if you can fill a gap quickly with a verified source (ToolSearch "select:WebSearch,WebFetch"), do so and give the citation + URL.
${FIXED}
${BRIEF}
Claims + verdicts (JSON): ${JSON.stringify(finalClaims)}`, { label: 'critic:completeness', phase: 'Report' })

const report = await agent(`Write the FINAL evaluation report of the REF5 Adaptive Strength v1.4 program in KOREAN, as a markdown document.
Audience: the athlete-developer (Korean, prefers terse, objective, evidence-based prose; dislikes preamble, filler, and excessive bullet lists/tables — use short prose paragraphs, with tables only where they really compress information such as a source list). Use 반말-free neutral written style (plain declarative 다/이다 체).
Structure:
1. 결론 (one short paragraph: overall verdict on goal fit and efficiency, with confidence and what is still unknown)
2. 강점 (evidence-backed)
3. 약점·위험 (evidence-backed; separate design trade-offs the spec already accepts from new findings)
4. 유명 프로그램과의 원리 비교 (principle level; no wholesale mixing)
5. 목표 현실성 (175 kg high-bar at ~70 kg; OAP)
6. 권고 — at most a handful, ordered by priority; each tagged 프로토콜 변경 / 문서·표출 / 운영 / 관찰 only, each changing at most one protocol element, none relaxing the judgment criteria (FAIL 0·HOLD≤1·veto), none violating the fixed constraints. Say explicitly which ideas were considered and rejected and why.
7. 논쟁 중이거나 근거가 약한 판단 (contested claims, stated as such)
8. 근거 목록 (only verified sources: citation, year, type, URL; group by topic)
Rules: Use ONLY claims with status kept or contested (mark contested ones as such); claims with status unchallenged may be used only if explicitly labelled 미검증; never present dropped claims as findings. Distinguish fact, inference and opinion. Cite sources inline as (저자 연도). Numbers where available. Do not invent sources. Mention evidence gaps the critic found. Length: thorough but no padding (roughly 1,500–3,500 Korean words).
${FIXED}
${BRIEF}
## Internal analysis
${internal ?? ''}
## Claims with challenge verdicts (JSON)
${JSON.stringify(finalClaims)}
## Merged overall
${merged?.overall ?? ''}
## Completeness critic
${critic ?? ''}
## Verified evidence pack (JSON)
${evidencePack}

Return ONLY the markdown document.`, { label: 'report:write', phase: 'Report' })

return { report, stats: { nSources, nConfirmed, claims: claims.length, kept: finalClaims.filter(c => c.status === 'kept').length, contested: finalClaims.filter(c => c.status === 'contested').length, dropped: finalClaims.filter(c => c.status === 'dropped').map(c => c.claim.claim) , droppedDimensions: dropped } }
