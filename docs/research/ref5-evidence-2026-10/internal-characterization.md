# REF5 v1.4: internal characterization for evaluators

**Inputs:** the full spec (`/home/claude/workout-log/docs/ref5-program-spec.md`), the engine (`/home/claude/workout-log/packages/core/src/program-engine/ref5.ts`, especially `decideRef5SessionType` and `selectRef5SquatPrescription` at about lines 1154–1207), and read-only SQL on Supabase for user `6f47ec53…` (demo account excluded).

**Evidence tags used below:**
- **[D]** a fact read directly from the database, spec or code.
- **[C]** computed from spec or engine rules.
- **[I]** an inference or extrapolation.
- **[O]** coaching opinion.

**Corrections to the brief:**
- The database now holds **29 REF5 sessions**, not 28. A BP-focus session was logged on **10/14 at 22:01 KST** after an 8-day gap. Plan B therefore has 14 sessions from 9/05 to 10/14, about 2.45 per week.
- The 10/14 session is also the first one where the logged bodyweight differs from 75: it shows **76**.
- Not every window ended INCREASE. Squat, bench and pull went **6 for 6**. Deadlift and OHP each had one MAINTAIN, both forced by their caps.

---

## 1. Intensity, weekly sets, density and inferred proximity to failure

### 1a. Reference maxima from the athlete's own pre-REF5 records (Tactical Barbell, May–July 2026) [D]

| Lift | Best evidence in the DB | Reference used below |
|---|---|---|
| SQ | 92.5×3×3 (6/11, 6/16, 6/20); 97.5×1×3 (7/09–7/17). Epley e1RM 101.8 | 1RM ≈ 102–103 (user says about 103) |
| BP | 90×3×3 (June); 95×1×3 (July). e1RM 99 | about 100 |
| PULL (total load) | 94×3×3 (June); 100×1×3 (July); stated tested 1RM 110 (75+35) | 110 |
| DL | 100×5 (5/25, 5/26); 100×3 (June). e1RM 116.7 | about 112–117 |
| OHP | 50×5 (5/25–26); 50×3 (June); 47.5×1 (July). e1RM 58.3 | about 55–58 |

The REF values are proxies only. Current REFs: SQ 107.2, BP 104.1, PULL 111.1, DL 103.4, OHP 50.0. The three main-lift REFs already **exceed** the last-known maxima, even though the working loads are still below the June 3×3 loads (see section 3).

### 1b. Current prescriptions: intensity and inferred reps in reserve (RIR) [D for loads; I for RIR]

RIR is estimated two ways:
- **RTS-style chart:** an RTS-style RPE/%1RM coaching chart, read within Helms et al. 2016's RIR-based RPE framework. This is a coaching heuristic.
- **Population mean:** Nuzzo et al. 2024 meta-regression of reps to failure: about 15 at 70%, about 5 at 90%; bench about 8.8 at 80%. Interpolated by me.

| Prescription (as of 10/14) | Load | % of reference | % of the June 2026 working load | RIR, RTS chart | RIR, population mean |
|---|---|---|---|---|---|
| SQ H3 3×3 | 85 | 83% | 92% of 92.5×3 | about 3–3.5 | about 5 |
| SQ H2 3×2 | 90 | 88% | — | about 2.5 | about 3–4 |
| SQ V 3×5 (micro 2×5) | 72.5 | 71% | — | ≥5 (off the chart) | about 10 |
| BP focus 3×3 | 85 | 85% | 94% of 90×3 | about 2.5 | about 3 |
| BP volume 2×5 (micro 1×5) | 70 | 70% | — | ≥5 | about 9 |
| PULL focus 3×3 (total) | 90 (+15 added) | 82% | 96% of 94×3 | about 3.5 | about 5 |
| PULL volume, micro 1×6 | 75 (bodyweight, +0) | 68% | — | ≥8 | about 10 |
| DL 2×4 | 75 | 64–67% | 75% of the 100 kg load | ≥8 | ≥12 |
| OHP 2×6 | 32.5 | 56–59% | 65% of the 50 kg load | ≥10 | ≥15 |
| OAP 2×3 per arm, by rung | bodyweight | — | — | about 0–1 at the current rung: 7 of 12 arm-exposures were not PASS | — |

**What the stop-at-first-obvious-slowdown rule implies for proximity [I]:**
- At 2–3 reps with loads of 82–88%, sets end at the prescribed reps well before a visible slowdown would normally appear.
- In the velocity-loss literature, a 20% velocity loss is roughly half the possible reps in a set (Pareja-Blanco et al. 2017).
- So proximity is set by the **load prescription**, not by the stop rule. The rule only becomes binding when H3 reaches roughly 90–92% of 1RM, which is about 2–3 more squat increments.

**Detection bias [I]:**
- Perceiving slowdown is noisy. In bench press the error was about ±1 rep at the 20% and 40% velocity-loss thresholds (Dello Iacono et al. 2023). In deadlifts people **under-detected** a 20% velocity loss, perceiving it about 10% of the time (Shaw et al. 2023).
- Spec §11.1 adds a tie-break: "if ambiguous, do not record slowdown."
- Net effect: HOLD, the program's earliest warning, is structurally biased toward under-recording. When it is first recorded, the lifter may already be at RIR 0–1.
- The intensities are consistent with the brief's stated session-RPE target of about 7–8.

### 1c. Weekly work sets from the records [D]

OAP is counted as pairs, as the spec does. "Hard" here means SQ H3/H2 plus BP and PULL focus sets.

| Week (Mon) | Sessions (micro) | SQ (hard) | BP (focus) | PULL (focus) | OAP pairs | DL | OHP | Total | Hard |
|---|---|---|---|---|---|---|---|---|---|
| 07-13 (only 7/19) | 1 | 3 (3) | 2 (0) | 3 (3) | – | 2 | 0 | 10 | 6 |
| 07-20 | 2 | 6 (3) | 5 (3) | 5 (3) | – | 2 | 2 | 20 | 9 |
| 07-27 | 0 | 0 | 0 | 0 | – | 0 | 0 | 0 | 0 |
| 08-03 | 3 | 9 (6) | 8 (6) | 7 (3) | – | 2 | 4 | 30 | 15 |
| 08-10 | 2 | 6 (6) | 5 (3) | 5 (3) | – | 2 | 2 | 20 | 12 |
| 08-17 | 2 (1) | 5 (3) | 3 (0) | 4 (3) | – | 2 | 0 | 14 | 6 |
| 08-24 | 4 (1) | 11 (3) | 9 (6) | 8 (3) | – | 2 | 4 | 34 | 12 |
| 08-31 (cutover) | 2 | 6 (6) | 4 (0) | 6 (6) | 0 | 4 | 0 | 20 | 12 |
| 09-07 | 4 (1) | 11 (3) | 9 (6) | 4 (3) | 4 | 2 | 4 | 34 | 12 |
| 09-14 | 1 | 3 (3) | 2 (0) | 3 (3) | 0 | 2 | 0 | 10 | 6 |
| 09-21 | 4 (1) | 11 (6) | 9 (6) | 4 (3) | 4 | 2 | 4 | 34 | 15 |
| 09-28 | 2 | 6 (6) | 5 (3) | 3 (3) | 2 | 2 | 2 | 20 | 12 |
| 10-05 | 1 | 3 (3) | 2 (0) | 3 (3) | 0 | 2 | 0 | 10 | 6 |
| 10-12 (Mon–Wed) | 1 | 3 (3) | 3 (3) | 0 | 2 | 0 | 2 | 10 | 6 |

**Weekly averages [C]:**

| Period | Sessions/wk | SQ (hard) | BP (focus) | PULL (focus) | OAP pairs | DL | OHP |
|---|---|---|---|---|---|---|---|
| Whole period, 7/19–10/14 (12.4 wk) | 2.33 | 6.7 (4.3) | 5.3 (2.9) | 4.4 (3.1) | — | 2.1 | 2.25 |
| Plan B, 9/05–10/14 (5.7 wk) | 2.45 | 7.0 (4.7) | 5.6 (3.15) | 3.5 (3.15) | 2.1 | 2.1 | 2.1 |

- For comparison, the spec's §19.3 table gives at 3 sessions per week: SQ 9, BP 7–8, PULL 4–5, OAP about 3, DL about 3, OHP about 3.
- Weekly totals vary widely, from 0 to 34 sets. Weeks with 4 sessions alternate with 0–1-session weeks.
- **[I]** Counting only sets within about 4 RIR, the realistic weekly hard sets are about 4–5 for SQ, about 3 each for BP and PULL, OAP about 2 pairs at near-limit effort, and **0 for DL and OHP**.

### 1d. Density [D]

- **Session mix:** 25 normal sessions and 4 micros.
  - Micro triggers: 1 MANUAL (8/21, after an 8-day gap); 3 NORMAL_SESSION_DENSITY (8/27, 9/11, 9/25); 9/25 also hit CONSECUTIVE_PROGRAM_DAYS.
- **Normal-session squat type:**
  - 18 hard (H3/H2) and 7 V.
  - Of the 7 V sessions, 5 were caused by the 48h gate: 44h, 24h, 24h, 23h, 44h.
  - The other 2 were caused by the 168h count, missing the boundary by **13.9 min (8/29) and 10.5 min (9/12)**.
- **Gaps between sessions (28 gaps):** 1 day ×7, 2 days ×9, 3 ×3, 4 ×2, 5 ×3, 6 ×1, 8 ×3. Median 2 days, mean 3.1 days.
- **Work sets per session (spec accounting):** normal 10 (12 logged rows on OAP days), micro 4, mean 9.2.
- **Time from the first squat work set to save:** normal sessions median 47 min (range 35–79, n=23); micro 23–41 min.
- **Late logging:** 2 sessions were backfilled. 7/19 was saved 5 days later. 10/04 was saved 53 hours later, just before the 10/06 session.

---

## 2. Progression mechanics

### 2a. Cadence ceilings [C]

Two rules drive these ceilings:
- **Normal sessions:** at most 3 in any 7 calendar days (the "≥3 normal sessions in the prior 6 days" rule). The third consecutive day is also a micro. So at 4 sessions per week, the 4th session is always a micro, and 4/wk equals 3/wk for every progression stream.
- **Hard squat:** at most 2 starts per rolling 168 hours, at least 48 hours apart. Steady state is exactly 2 per 7 days. A first window of 6 hard exposures can close on day 16; after that the period is 21 days.

| Stream | Exposures per window | Qualifying exposures/wk (2 / 3 / 4 sessions) | Minimum weeks per window | Maximum +kg/yr at 100% INCREASE | Extra limiter |
|---|---|---|---|---|---|
| SQ H3 | 6 hard | 2 / 2 / 2 | 3 / 3 / 3 | **43 / 43 / 43** | At 2/wk this needs the two sessions ≥48h apart. A Sat/Sun pattern gives 1 hard/wk, so 6 weeks per window and about 22 kg/yr. Session start times must not drift earlier. |
| BP focus | 4 | 1 / 1.5 / 1.5 | 4 / 2.67 / 2.67 | 32.5 / 48.75 / 48.75 | — |
| PULL focus (total) | 4 | 1 / 1.5 / 1.5 | 4 / 2.67 / 2.67 | 32.5 / 48.75 / 48.75 | Increments are in added load; bodyweight drift is not tracked. |
| DL | 4, all PASS | 1 / 1.5 / 1.5 | 4 / 2.67 / 2.67 | Limited by cap: DL ≤ floor2.5(0.914 × H3), so at most about 40 kg/yr in the long run | DL 80 needs H3 90, not 87.5 (REF inequality) |
| OHP | 4, all PASS | 1 / 1.5 / 1.5 | 4 / 2.67 / 2.67 | Limited by cap: OHP ≤ floor2.5(0.398 × BP focus), so at most about 13–19 kg/yr | Steps at BP 90, 95, 100… (one OHP step per ~2.5 BP steps) |

- **Squat is frequency-capped independently of attendance [C].** At 3–4 sessions per week, extra sessions only add V sets (about 70%×5) or micros.
- **Observed cadence [C from D].**
  - Plan B: hard squat 1.58/wk and each focus lift 1.05/wk, which gives about 3.8 weeks per window for squat, bench and pull. At 100% INCREASE that is about 34 kg/yr for each.
  - Whole period: hard squat 1.45/wk, about 4.1 weeks per window.

### 2b. Probability that a window ends INCREASE, by per-exposure outcome rates [C]

| P(HOLD), P(FAIL) per exposure | SQ (6, HOLD ≤1, FAIL 0) | BP/PULL (4, same rule) | DL/OHP (4, all PASS) |
|---|---|---|---|
| 0.05, 0 | 0.97 | 0.99 | 0.81 |
| 0.10, 0 | 0.89 | 0.95 | 0.66 |
| 0.10, 0.05 | 0.64 | 0.77 | 0.52 |
| 0.20, 0.05 | 0.46 | 0.65 | 0.32 |
| 0.30, 0.10 | 0.19 | 0.39 | 0.13 |

- Squat, the top priority, has both the slowest cadence and the strictest gate: it needs at least 5 clean exposures out of 6.
- Volume vetoes are effectively inert at current loads (see section 4C), so in practice the judgment rests on the focus and hard exposures alone.

### 2c. Latency to a decrease [C]

- **Stagnation decrease:**
  - Squat: 2 MAINTAIN windows, then a stagnation micro, then a reassessment window. That is about 3 windows: about 11.5 weeks at the observed cadence, about 9 weeks at the ceiling.
  - Bench and pull: about 8–12 weeks.
- **Immediate decrease:** needs 2 consecutive FAILs in the **same** stream. SQ_H3 and SQ_H2 are separate streams, so the earliest squat decrease comes after about 3 hard sessions.

### 2d. Goal-scale arithmetic [I]

- If the REF tracked 1RM, a 175 kg squat corresponds to an H3 of about 140, roughly 22 increments from 85.
  - At the observed 3.8 weeks per window, that is about 84 weeks if every window passes.
  - At 65% window success it is about 2.5 years; at 46% it is about 3.5 years.
- For context only: competitive male powerlifters gained about 37–77 kg/yr on their **total** over 15 years (Latella et al. 2020; a selected sample, linear extrapolation).
- So the long-run limiter will be outcome quality, not cadence [I].

### 2e. Observed window durations and decisions [D]

| Plan | Lift | First exposure → deciding exposure | Days | Result |
|---|---|---|---|---|
| A (v1.3) | SQ | 7/19 → 8/13 | 25 | INCREASE 80 → 82.5 |
| A | BP | 7/24 → 8/13 | 20 | INCREASE 80 → 82.5 |
| A | PULL | 7/19 → 8/11 | 23 | INCREASE 82.5 → 85 |
| A | DL | 7/19 → 8/11 | 23 | **MAINTAIN by cap**: candidate 75 against max 72.5 at H3 80. The squat increase came 2 days later, so 4 PASS exposures were discarded. |
| A | OHP | 7/24 → 8/13 | 20 | INCREASE 30 → 32.5 (grid re-folded after the microloading option was withdrawn) |
| B (v1.4) | SQ | 9/05 → 9/29 | 24 | INCREASE 82.5 → 85 |
| B | BP | 9/07 → 9/24 | 17 | INCREASE 82.5 → 85 |
| B | PULL | 9/05 → 9/23 | 18 | INCREASE 87.5 → 90 |
| B | DL | 9/05 → 9/23 | 18 | INCREASE 72.5 → 75 |
| B | OHP | 9/07 → 9/24 | 17 | **MAINTAIN by cap** (35 against max 33.8 at BP 85) |

- **In progress as of 10/14:** SQ 3 of 6 (10/04, 10/06, 10/14); BP, PULL, DL and OHP each 2 of 4.
- **Net change since 7/19 (87 days):** SQ H3 +5, BP +5, PULL total +7.5 (of which +2.5 came from the cutover calibration, not a window), DL +2.5, OHP +2.5.
- **[I]** The §21 minimum gate was reached on 9/29. The §21.1 review at "3 windows per lift" falls around early to mid December at the observed cadence; the spec estimates about 9 weeks for squat.

### 2f. How a cutover or new plan resets windows [D/C]

- The v1.4 decoder rejects v1.3 state, so a new plan starts with empty state. That clears:
  - the windows, fail streams, and stagnation phase, history and structureReview flag;
  - the forced-micro events;
  - **hardStartTimes and startedSessions**, so the 48h, 168h and calendar-density gates do not see sessions from the previous plan;
  - the focus queue (reset to PULL), the H3/H2 turn (reset to H3) and the OAP state.
- **What was observed at the 9/01 → 9/05 cutover:**
  - Spec §19.6 advises ending the old plan right after a squat window closes. It ended mid-window instead, discarding **13 exposures**: SQ 3/6, BP 2/4, PULL 3/4, DL 3/4, OHP 2/4. For squat and pull that is roughly 2–3 weeks of window time.
  - Plan A ended with next focus = BP and next hard = H2. Plan B restarted at PULL and H3. As a result, H3 ran twice in a row (9/01, 9/05), PULL focus ran twice in a row, and the BP focus gap stretched to 9 days (8/29 → 9/07).

---

## 3. Record-level signals [D unless tagged]

- **Outcomes:** all **106 kg-lift exposures were PASS** with terminationReason NORMAL and 100% of prescribed reps. There were 0 HOLD, 0 FAIL and 0 INVALID. No vetoes, fail streaks, stagnation or structureReview have fired.
- **Loads are still below demonstrated capacity.** Current working loads remain under the June 2026 3×3 loads: SQ 85 vs 92.5, BP 85 vs 90, PULL 90 vs 94, DL 75 vs 100, OHP 32.5 vs 50.
  - **[I]** So far the program has been re-climbing to known capacity. The all-PASS record says little yet about new adaptation.
  - **[I]** The first informative zone is H3 around 90–92.5 and H2 around 95–97.5, about 2–3 squat increments away (roughly 7–11 weeks).
- **Memos:**
  - 7/24: "wide stance, knees-out cue is improving the knee pain."
  - 10/04 (SQ H3 85): "strength wasn't coming, narrowed stance slightly, a bit better." This was still recorded as PASS/NORMAL.
  - The squat stance has changed at least twice within the program, which reduces how comparable exposures are.
- **Bodyweight:**
  - 28 of 29 sessions record exactly 75.00 as both today's and the calculation bodyweight. On 10/14 the value is 76.
  - The `body_measurement` table has **0 rows** for this user.
  - **[I]** The value looks like a default rather than a measurement. Consequences:
    - Logged PULL totals equal 75 plus the added load by construction.
    - If the planned cut is happening, the real totals are lower than logged.
    - The G1 KPI (e1RM ÷ bodyweight), the §21 trend metric (REF ÷ 7-day bodyweight) and the §23.1 weight-loss audit cannot be computed.
- **PULL volume:** every PULL volume prescription has been bodyweight +0 kg, because the target total (70–75) is at or below the logged bodyweight of 75. Plan A's "PULL volume 2×6" was therefore just bodyweight pull-ups.
- **OAP sequence by arm (rung, reps per set, outcome):**
  - **Left:**
    - 9/07: rung 2, [2,2], FAIL
    - 9/12: rung 2, [2,1], FAIL → demoted to rung 1
    - 9/21: rung 1, [3,2], HOLD. Memo: "the rung-1 grip felt awkward on the left; I may have had strength left."
    - 9/24: rung 1, [3,2], HOLD
    - 10/04: rung 1, [3,3], PASS
    - 10/14: rung 1, [3,3], PASS → current state rung 1, pass streak 2 of 3
  - **Right:**
    - 9/07: rung 2, [2,1], FAIL
    - 9/12: rung 2, [2,1], FAIL → rung 1
    - 9/21, 9/24, 10/04: PASS → promoted to rung 2 (13 days after the first PASS)
    - 10/14: rung 2, [3,2], HOLD → current state rung 2, streak 0
  - The brief's "9/12 L 1+2" appears as [2,1] by set number in the DB; the total is the same.
  - **Totals:** 12 arm-exposures: 4 FAIL, 3 HOLD, 5 PASS.
  - **Net rung change after 5.7 weeks:** left −1, right 0.
  - **Exposure rate:** 1.05 per week, against the spec's "about 1.5 per week at 3x."
  - The revert option has never been used.
- **Heavy pull next to OAP (n = 11 adjacencies):**
  - **<48h apart:** 9/07 OAP → 9/08 PULL focus (23h); 9/21 OAP → 9/23 PULL (44h); 9/23 PULL → 9/24 OAP (24h).
  - Micro bodyweight pull-ups also fell about 21–24h before or after OAP twice (9/11 → 9/12, 9/24 → 9/25).
  - No performance effect is visible at this sample size [I].
- **8-day gaps** occurred 3 times: 7/26 → 8/03, 8/13 → 8/21 (followed by a manual micro) and 10/06 → 10/14 (followed by a full hard session, all PASS).
- **Microloading artefact:** the 8/24 OHP was prescribed at 31.25 (the withdrawn 1.25 kg grid) but lifted at 32.5.
- **OHP has been at 32.5 since 8/24:** 8 straight PASS exposures, frozen by the cap. It cannot move until BP focus reaches 90, which is 2 more BP windows, so about December at the earliest [C].

---

## 4. Internal-consistency issues relevant to training effectiveness

**A. The "48h heavy-pull vs OAP separation" is not guaranteed (spec §7.3).** [D/C]
- The spec claims this separation is "structurally guaranteed." The engine only guarantees they are not in the same session.
- Because focus alternates on every normal session, any two normal sessions less than 48h apart pair a heavy pull day with an OAP day.
- 7 of 28 gaps were 1 day. 3 of 11 adjacencies were under 48h.
- Climbing next to OAP (§19.5.1a) is also unenforced.

**B. The 2-week stay on a new OAP rung (§19.5c) cannot be implemented as written.** [C]
- The engine can promote after 3 BP-focus exposures, which can fall within about 8 calendar days (focus on days 0, 3 and 8 under the density rules).
- Outcomes are computed from reps, and the guideline offers no compliant way to hold a rung. The only neutral options are INVALID (SAFETY or EXTERNAL) or the revert input, both of which misuse their meaning.
- In practice the slow cadence (about 1 exposure per week) makes a ≥2-week stay likely by accident.

**C. The volume vetoes are effectively dead, not just "rare" (§13.2, §22.4.10).** [I]
- The PULL veto's only input is micro bodyweight ×6, about 68% of the pull 1RM total, roughly RIR 8–10.
- The squat V veto (about 71%×5) and the BP volume veto (about 70%×5) are almost as unlikely to fire.
- So the stated safeguard "FAIL 0, HOLD ≤1, no volume veto" reduces in practice to "FAIL 0, HOLD ≤1" on focus and hard exposures.

**D. The v1.4 trade-off is framed as larger than it is (§19.3, §22.4.9).** [I]
- The removed PULL volume 2×6 was performed at bodyweight with +0 kg (target ≤ bodyweight), likely RIR 8 or more. Its loss to lat stimulus is probably small.
- The added OAP sets are near-limit. Net effect: more high-tension unilateral elbow-flexor and lat loading, and more elbow risk.

**E. The OHP cap freezes OHP and works against the athlete's own ratio.** [D/C/I]
- The cap holds OHP at or below 0.398 × BP focus. The athlete's historical OHP/BP e1RM ratio is about 0.58–0.59.
- OHP therefore sits at about 56% of e1RM (RIR ≥10), which is a maintenance-or-less dose.
- One +2.5 step is 7.7% of the current load, compared with about 2.9% for the main lifts.
- C8 is a fixed user constraint, so this describes its cost only.

**F. The deadlift dose is very small, and DL increases are gated by squat timing.** [D/C]
- DL gets about 2 sets per week at about 64% of e1RM.
- The DL REF baseline (100 at 72.5 kg) sits about 15% below the athlete's DL e1RM.
- If an auxiliary window closes just before a main-lift increase, its 4 PASS exposures are discarded (DL, 8/11).

**G. Squat hard exposure does not grow with attendance.** [C]
- Hard squat is capped at 2 per 168h whether the athlete trains 2, 3 or 4 times a week. "Squat first" shows up in session order and exclusivity, not in extra hard dose.
- The exact 168h boundary with no tolerance (§9) cost 2 hard exposures, each by under 15 minutes. Each loss is about 1/6 of a window, roughly 4–5 days.

**H. A new plan erases history.** [C]
- §23.1 step 4 (recalibrate, then new plan) and any cutover wipe the stagnation history, the structureReview flag and the hard-start history.
- The §23 trigger "second stagnation decrease at the same basis" can therefore be silently reset.
- The density gates also lose sight of the last plan's sessions.

**I. REF has drifted above the known maxima, and nothing ties it back.** [D/I]
- REF rises 3.15 per squat increment regardless of true 1RM. The only brake is the binary slowdown judgment, which is biased toward PASS (section 1b).
- The spec acknowledges this in §6.3 and §22.4.8. The records show the drift has already begun.

**J. The stagnation micro is too small to act as recovery.** [I]
- It is one 4-set session. In effect it is a delay before reassessment, not a recovery intervention.
- The Coleman 2024 trial the spec cites against scheduled deloads tested complete cessation, not a reduced-volume deload; the spec notes this itself in §22.2.

**K. Rounding creates plateaus in derived loads.** [C]
- BP volume stays at 70 while BP focus moves from 82.5 to 85 (ratio 0.848 → 0.824).
- SQ V stays at 72.5 while H3 moves from 82.5 to 85.
- PULL volume stays at bodyweight +0 for focus totals up to 90 at 75 kg bodyweight.
- H2 = H3 + 5 is a fixed offset: 5.9% above H3 at 85, but only 3.6% at 140.

**L. Several §21/§23 evaluation inputs are unobservable.** [D]
- Bodyweight is unmeasured, as above.
- No session RPE or duration is stored.
- Climbing and elbow-pain notes are not in the database.

**M. The OAP rungs are not equivalent across arms.** [D/I]
- The 9/21 left-arm memo suggests the rung-1 hand position affected the HOLD outcome more than strength did. This supports §22.4.11 (the ordinal scale) and points to an arm asymmetry in the rung definitions.

**N. Weekly dose varies widely.** [D]
- Weekly totals range from 0 to 34 sets. 3 of 4 micros were automatic in cluster weeks, and there is no carry-over or redistribution by design.

---

## 5. What REF5 is optimised for, and what it gives up [O, grounded in the above]

### Optimised for

- **Irregular schedules:** a session queue with no debt for missed sessions; clusters are downgraded automatically (micro and V); 8-day gaps are absorbed without manual action.
- **Squat priority and squat recoverability:** squat comes first in every session, hard squat is limited to ≤2 per week at ≥48h spacing, and DL and OHP are subordinated by caps.
- **Non-failure, moderate-RIR work:** main lifts at about 82–88% for 2–3 reps (RIR about 2.5–5, inferred), 10 sets per session, about 47 minutes.
  - This fits evidence that strength gains are fairly flat across RIR (Robinson et al. 2024, spec-cited).
  - Strength also shows strongly diminishing returns to weekly volume, with frequency associated with strength gains (Pelland et al. 2026).
- **Low input burden:** no RPE, RIR, velocity or AMRAP. Outcomes are computed from reps and termination reason.
- **Conservative, error-correcting progression:** strict windows, a decrease after 2 consecutive FAILs, forced micros, and deterministic replay for comparability.
- **OAP skill acquisition** that is isolated from all kg progression and has its own failure handling (demotion).

### Gives up

- **Volume and hypertrophy stimulus:** about 3–5 hard sets per week per main lift, effectively 0 hard sets for DL and OHP, and no accessories. The hypertrophy side of long-term strength potential is under-dosed [I].
- **Rate ceiling and responsiveness:** squat is capped at about 43 kg/yr of H3 in theory and about 34 kg/yr at the observed cadence, and extra sessions do not raise it. Underload stagnation takes about 8–12 weeks to detect, and the stagnation logic cannot tell overload from underload.
- **Measurement resolution:** the binary slowdown judgment is biased toward PASS and there is no e1RM. REF can outrun true 1RM, and goal attainment (G1) cannot be verified inside the program. The KPI denominator, bodyweight, is not being measured.
- **Individualised lift ratios:** fixed caps (DL ≤ SQ, OHP ≤ 0.5 × BP) are applied through REF baselines that do not match this athlete's DL and OHP. Those two lifts are held at about 56–64% of e1RM.
- **Planned fatigue management and variation:** no deloads, no rep-range or exercise variation beyond H3/H2/V, and no peaking. Recovery relies on micro valves and the user choosing a micro.
- **Pulling-tissue load management:** elbow and tendon spacing (heavy pull, OAP, climbing) depends on user discipline. The spec's 48h claim is not enforced, and climbing is not modelled.
- **Continuity across plan changes:** cutovers and recalibrations discard in-progress windows and stagnation history.

---

## Sources

Verified this session unless marked "spec-cited":

- Nuzzo JL et al. 2024. Maximal number of repetitions at %1RM: meta-regression. *Sports Med* 54(2):303–321. https://pubmed.ncbi.nlm.nih.gov/37792272/ (also https://pmc.ncbi.nlm.nih.gov/articles/PMC10933212/)
- Helms ER et al. 2016. Application of the RIR-based RPE scale. *Strength Cond J* 38(4):42–49. https://doi.org/10.1519/SSC.0000000000000218
- Pareja-Blanco F et al. 2017. Effects of velocity loss (VL20 vs VL40). *Scand J Med Sci Sports*. https://doi.org/10.1111/sms.12678
  - Velocity-loss groups: VL20 averaged 3.9 vs VL40 6.5 reps per set; 1RM +18.0% vs +13.4%, not significantly different.
- Dello Iacono A et al. 2023. Perception of bar velocity loss, bench press. *IJSPP* 18(5):488–494. https://doi.org/10.1123/ijspp.2022-0298
- Shaw MP et al. 2023. Perception of barbell velocity (deadlift). *Int J Strength Cond*. https://doi.org/10.47206/ijsc.v3i1.161
- Halperin I et al. 2022. Accuracy in predicting repetitions to failure. *Sports Med* 52:377–390. https://doi.org/10.1007/s40279-021-01559-x
- Robinson ZP et al. 2024. Proximity to failure: meta-regressions (spec-cited). https://pubmed.ncbi.nlm.nih.gov/38970765/ ; preprint summary checked at https://sportrxiv.org/index.php/server/preprint/view/295
- Pelland JC et al. 2026. Resistance training dose-response, volume and frequency. *Sports Med* 56(2):481–505. Record: https://sponet.de/sponet/Record/4097139?lng=en
  - The spec cites https://pubmed.ncbi.nlm.nih.gov/41343037/ for "dose-response meta-regressions." I did not confirm that this PubMed ID is the same paper.
- Latella C et al. 2020. Long-term strength adaptation in powerlifters. *JSCR* 34(9):2412–2418. https://pmc.ncbi.nlm.nih.gov/articles/PMC7448836/
- Coleman M et al. 2024. One-week training cessation RCT (spec-cited). https://pubmed.ncbi.nlm.nih.gov/38274324/