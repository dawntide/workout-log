# REF5 completeness critique: what is missing or under-supported

## A. Fix these before synthesis (consistency and process)

1. **There is no "session RPE ~7–8" rule.** The spec contains none. §3.2 (line 77) bans RPE input, line 87 says the schema's `rpe: 0` is only a placeholder, and §11.1 (line 473) says no RPE or RIR is entered. The brief, C11 lens A and C24 lens B still state it. Strike it everywhere; C2 lens B was right.

2. **The claims use different facts. One reconciled fact table is needed.**
   - Sessions: 28 vs 29. The DB checks in C4-B, C8-B and C11 show a 10/14 session exists.
   - OAP arm-exposures: 10 vs 12. The 12 includes 10/14.
   - Hard SQ per week: anywhere from 1.27 to 1.80 (C3, C7-B, C13).
   - SQ window length: 3.5 to 4.7 weeks.
   - "Three 8-day gaps" counts all of REF5 since 7/19. Plan B had only one (C24-B).
   - C14-B, C16-A, C17-A and C19 used stale data.

3. **C17 and C18 call one question "unchecked", but other verdicts already answer it.** The question is whether the demoting OAP FAILs came right after heavy pulling. They did not:
   - The 9/07 OAP came about 52 h after the 9/05 PULL-focus start (timestamps 9/05 09:13Z and 9/07 13:10Z, from C3 and C13-B).
   - The 9/12 OAP came about 21 h after a bodyweight micro PULL 1x6, which is not heavy (C16-B).
   - Only the 9/24 left-arm HOLD sat about 24 h after a heavy PULL.

4. **Six protocol candidates are on the table with no ranking and no cost attached.** They are:
   - C3: a 168 h lookback tolerance (≥166 h)
   - C4 / §23.1: +1 set
   - C6: OHP 2x6 → 2x8
   - C16: move OAP to slot 2
   - C18: change the OAP rung contact definitions
   - C20: an engine PULL→OAP gate

   The missing cost:
   - Under §26.2 every one of these is a protocol change, and past version bumps rejected old state (§24.3).
   - That means a new plan and a full reset. The last cutover lost 13 exposures, erased the stagnation history, and bypassed the 168 h gate, which produced 3 hard SQ starts in about 6 days despite the knee pain (C13).
   - The synthesis should put these into one ranked queue and attach that reset cost to each.
   - It should hold all changes until the §21.1 three-window review. §24.3 does allow an explicit state-carrying decoder, which is an engineering mitigation, not a protocol change.

5. **There is no program-level success criterion.**
   - §21 is an exposure gate, §21.1 says how to interpret results, and §23 lists mostly stall or implementation falsifiers.
   - Nothing pre-registers a positive benchmark or time horizon for judging REF5 as a whole, even though the athlete has abandoned four earlier programs.
   - C7 and C8 contain pieces of one. Merge them into a single documentation-only pre-registration. This is logic, not evidence.

6. **The cut can now start, but bodyweight is still not measured.**
   - §20 holds bodyweight only until the first evaluation gate (line 790). v1.4 has passed that gate.
   - So the cut is now permitted while bodyweight is unmeasured (C11) and while SQ nears the informative zone (C8).
   - Log real bodyweight for at least 4 weeks (the §23.1 look-back) before any cut.
   - Do not start the cut in the same window as a protocol change. This is logic, not evidence.

## B. Evidence dimensions no claim covers (gaps filled where I could verify)

1. **Periodization and undulation.**
   - Source: Moesgaard 2022, Sports Med 52(7):1647-1666, volume-equated.
   - Periodized beat non-periodized for 1RM (ES 0.31). Undulating beat linear (ES 0.31), with ES 0.61 in trained people and 0.06 in beginners.
   - REF5's H3/H2/V and focus/volume split is a form of within-week undulation, so it probably already captures this. It has no multi-week phases, by C11.
   - I verified this only through a secondary summary, because PubMed showed a CAPTCHA: https://sci-sport.com/en/effects-intensity-volume-periodization-strength-hypertrophy-238/. PubMed 35044672 came up as a search hit but I could not confirm it.

2. **Squat depth (ROM) is undefined.**
   - §11.1 (line 467) refers to "the prescribed ROM", but the spec never defines squat depth.
   - The knee is being managed with depth control, and stance changed twice. If depth drifts shallower, the standard and REF rise without a real 1RM gain.
   - Pallarés 2021, Scand J Med Sci Sports 31(10):1866-1881, https://doi.org/10.1111/sms.14006: full ROM beat partial ROM for strength (ES 0.56) and lower-limb hypertrophy (ES 0.88).
   - Operational fix: a written depth and stance standard plus occasional video, kept outside the app.
   - On knee load versus depth, the relevant review is Hartmann 2013, Sports Med 43(10):993-1008, https://doi.org/10.1007/s40279-013-0073-6. I did not re-read its conclusions.

3. **High-bar is a knee cost that G3 fixes in place.**
   - Glassbrook 2017, JSCR 31(9):2618-2634, https://doi.org/10.1519/JSC.0000000000002007: high-bar means more knee flexion and more quadriceps activity than low-bar.
   - C21 should list this as a cost for a quadriceps-tendon presentation. Applying it to tendon load is an extrapolation.

4. **REF5 never practises 1RM expression.**
   - Nothing is trained at about 90% or above, and there are no singles.
   - Mattocks 2017, MSSE 49(9):1945-1954, https://doi.org/10.1249/MSS.0000000000001300: in untrained people, practising 1RMs alone matched high-volume training for 1RM gains.
   - This is a cost of C9 and C11. Any future max attempt will probably be under-expressed. This is a description of cost only.

5. **The H2 offset is a fixed +5 kg, and nobody evaluated it.**
   - The engine sets `sqH2Kg = sqH3Kg + 5` (ref5.ts:331).
   - At H3 85, H2 is about 5.9% heavier, roughly one rep less in reserve than H3. The gap closes to parity only near H3 ≈ 175.
   - So H2 is the binding hard stream for now, and the first SQ HOLDs will probably come in H2. This is arithmetic, not a study.

6. **Individual response is not part of the pre-registered reading.**
   - Hubal 2005, MSSE 37(6):964-972: 585 untrained people, 1RM gains ranged from 0% to +250%.
   - §21.1 reads low success as either too little stimulus or too little recovery. A third possibility, low individual responsiveness or nearing a ceiling, is never stated.
   - This is not a reason to relax the criteria, but the C7 and C22 timelines should carry it.

7. **Rest intervals were not evaluated.** The spec already cites a rest-interval review: https://pubmed.ncbi.nlm.nih.gov/28933024/. The engine's 240 s is consistent with it. Low priority.

8. **Alcohol is missing from the recovery audit.**
   - C2 names "social" as a recovery limiter, yet §23.1 and the C12 log never mention alcohol.
   - Parr 2014, PLoS ONE 9(2):e88384, https://doi.org/10.1371/journal.pone.0088384: in 8 men, 1.5 g/kg of alcohol cut muscle protein synthesis even with protein. That was an acute, high-dose test, so applying it to strength gains is an extrapolation.
   - Add it to the off-app recovery log.

9. **Low energy availability was not screened.**
   - Poor nutrition plus climbing plus a deficit is the relevant combination.
   - Mountjoy 2023 IOC REDs consensus, BJSM 57(17):1073-1097, https://doi.org/10.1136/bjsports-2023-106994: the syndrome applies to male athletes too.
   - Risk is low at 0.25%/wk. Treat it as a screening item.

10. **Creatine was never considered.**
    - ISSN position stand, Kreider 2017, JISSN 14:18, https://doi.org/10.1186/s12970-017-0173-z.
    - It is outside the protocol, so this is the user's call.
    - If used, it raises body mass early. That confounds the C11 bodyweight trend, the G1 KPI denominator and the PULL total, so log the start date.

## C. Program not compared

- **Easy Strength (Dan John and Pavel Tsatsouline)** is coaching-level, from a secondary summary: https://www.liftosaur.com/programs/easy-strength.
  - It is REF5's closest philosophical relative, closer than SBS "time-poor": 5 lifts, 2x5, never miss a rep, add load when the bar moves fast.
  - Two principles differ:
    - It runs about 5 sessions a week at 55–80%.
    - It runs in fixed 40-workout cycles that end in heavy singles and a change of variation.
  - REF5 has no such cycle boundary. That also means it has no natural point to make changes without resetting state, which ties back to A4.
- The H3/H2/V structure should be framed as daily undulating periodization, with B1 as the evidence for it.

## D. Rejected or weak sources still in claim texts

**Drop or reframe:**
- Räntilä 2026 in C5 and C6: it compares about 40 vs 60 sets a week, so it says nothing about REF5's range.
- Halonen 2024 in C8: there was no detraining, since TB Operator ran until 7/17.
- Murphy & Koehler 2022 in C5, C11, C12 and C13: its main analysis had a mean age of about 60 and mostly sedentary or novice subjects.
- Saeterbakken 2025, Munn and Manca in C17: misapplied.
- Branscheidt 2019 and Lopez-Rivera in C16: neither models SQ/BP fatigue carrying into OAP.
  - Better sources are Behm 2021 and Zhang/Weakley 2025, which I verified: https://doi.org/10.1007/s40279-025-02176-8. Agonist-antagonist pairing gave more reps (SMD 0.68), with no chronic difference in maximal strength (SMD 0.10, not significant).
- Hybrid Calisthenics and leverage.fit in C18: misattributed.
- Grønhaug 2018 in C19: it is climbing epidemiology, not OAP tissue load.
- Krypteia in C24: which 5/3/1 variant the athlete ran is unrecorded.
- Coleman 2024 in spec §22.2: the "열위" (inferior) and "지지한다" (supports) wording overstates it.
- The 5–10%/yr in C22 and the "3–10%/yr long-run" in C7: both are contradicted by Latella 2024 and Nuckols 2018.

**Load-bearing but never re-verified:**
- Pareja-Blanco 2026 (C1, C2).
- Pelland's published numbers (only the preprint was checked).
- Enes 2024 IJSM.
- Schoenfeld 2019's accessory-to-failure detail ("from recollection").
- Loenneke 2019 and Taber 2019.
- Borba 2024.
- Kozin 2022 exists (Physiotherapy Quarterly 2022;30(2):90-99, RCT, 84 climbers), but the page shows no authors and its conclusion mentions shoulders, so it is weak.

**Verified here:**
- Dello Stritto 2025, Appl Sci 15(13):7252, https://doi.org/10.3390/app15137252: 15 trained lifters, self-perceived velocity loss in the back squat.
- Pancar 2026, Sci Rep 16:10299: 19 untrained men, single-joint lifts, 10RM endpoint. Verified through a secondary summary.

## E. Risks to the athlete not addressed

- **Self-judging bias.** The lifter is also the judge and wants steady increases. On 10/04, "strength wasn't coming", so he narrowed his stance and logged PASS. That is a technique change inside the session, and §11 does not define stance or depth. C9 covers only perceptual bias. The fix is the same as B2.
- **Shoulder load.** OAP, OHP, BP, weighted pull-ups and climbing all load the shoulder, and §19.5 names the rotator cuff. Yet the ledger tracks only the elbow. Add the shoulder to the same pain log.
- **Version churn on top of program hopping.** REF5 has had two cutovers in 87 days, on top of four abandoned programs (A4, A5).
- **Age is unrecorded.** It changes the percentile placement in C22 and the recovery assumptions.

## F. Recommendations the verdicts rejected; do not carry them forward as written

- **C18 (both lenses):** "open palm, no gripping" contradicts rung 1's "wrap" definition, so it is a protocol change.
- **C19 (both lenses):** add the elbow risk alongside §22.4.9; do not replace it.
- **C9 lens B:** a graded slowdown tag is banned by §3.2.
- **C11 lens B:** feeding a 7-day bodyweight mean into PULL is a protocol change.
- **C8 lens B:** the "re-acquisition" label is wrong, and DL/OHP must be excluded.
- **C12:** the recovery note must stay outside the app.
- **C16 lens A:** slot order is the least supported cause.
- **C20:** the gate covers only 1 of the 3 cases.
- **C23:** status is contested. Comparing the 3x3 working load against 1RM heuristics is a category error.

Sources:
- [Moesgaard 2022 summary (sci-sport)](https://sci-sport.com/en/effects-intensity-volume-periodization-strength-hypertrophy-238/)
- [Pallarés 2021 record (LIDA)](https://lida.sport-iat.de/ta/Record/4070734?lng=de)
- [Glassbrook 2017 (Aston)](https://research.aston.ac.uk/en/publications/a-review-of-the-biomechanical-differences-between-the-high-bar-an/)
- [Hartmann 2013 (FHWN)](https://fis.fhwn.ac.at/en/publications/analysis-of-the-load-on-the-knee-joint-and-vertebral-column-with-/)
- [Mattocks 2017 (Rowan)](https://www.researchwithrowan.com/en/publications/practicing-the-test-produces-strength-equivalent-to-higher-volume/)
- [Hubal 2005 (SPONET)](https://www.sponet.de/sponet/Record/4010522?lng=en)
- [Parr 2014 (DOAJ)](https://doaj.org/article/e5e5089372d145b28d9322cb13bd4b25)
- [Mountjoy 2023 (Amsterdam UMC)](https://pure.amsterdamumc.nl/en/publications/2023-international-olympic-committees-ioc-consensus-statement-on-/)
- [ISSN creatine position stand (JISSN)](https://jissn.biomedcentral.com/articles/10.1186/s12970-017-0173-z)
- [Easy Strength (Liftosaur)](https://www.liftosaur.com/programs/easy-strength)
- [Dello Stritto 2025 (MDPI)](https://www.mdpi.com/2076-3417/15/13/7252)
- [Pancar 2026 summary (sci-sport)](https://sci-sport.com/en/active-deload-in-strength-training-does-temporarily-reducing-volume-hinder-progress-270/)
- [Zhang/Weakley 2025 (Leeds Beckett)](https://eprints.leedsbeckett.ac.uk/id/eprint/11908)
- [Kozin 2022 (Physiotherapy Quarterly)](https://physioquart.awf.wroc.pl/Use-of-closed-chain-exercises-eccentric-exercises-and-proprioceptive-muscle-facilitation,143832,0,2.html)

Spec checked: /home/claude/workout-log/docs/ref5-program-spec.md (lines 77, 87, 467, 473, 790, 799-826, 879-899, 950-964, 1025-1041). Engine checked: /home/claude/workout-log/packages/core/src/program-engine/ref5.ts:331.