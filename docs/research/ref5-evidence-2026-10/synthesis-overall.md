# 종합 개요 3종

> 스포츠과학 종합, 코칭 종합, 병합 종합의 `overall` 원문(영어). 개별 주장은 claims.md(병합본)와 아래 두 종합의 claims(JSON, synthesis-claims.json)에 있다.

## 스포츠과학 종합

REF5 v1.4 is a conservative, low-input strength program. Its core design matches the best current evidence for short-term 1RM strength:
- squat first in every session;
- squat at least 2 times a week;
- heavy 2-3 rep sets at about 80-88% of estimated 1RM (H3 ~82-83%, H2 ~87%, BP and PULL focus ~82-85%);
- no training to failure;
- about 3-6 hard sets per main lift per week;
- no scheduled deloads, which is consistent with weak deload evidence.
The session queue and density valves handle the athlete's irregular schedule well, and the 2.5 kg windows filter out noise. The squat cadence ceiling (about 34-43 kg/yr of H3) is above even the best competitive squat gains (about 20-25 kg/yr), so cadence is not what limits long-term progress.

The main weaknesses are about measurement, not about the training stimulus:
- **Bodyweight is not measured.** It is logged as 75 kg in 28 of 29 sessions, so the G1 KPI, the PULL total load and the planned cut cannot be observed.
- **REF has drifted above known capacity.** SQ, BP and PULL REFs are already higher than the last demonstrated maxima, and nothing ties REF back to true 1RM.
- **The 106/106 PASS record does not yet show adaptation.** Working loads are still below the athlete's June 2026 3x3 loads, so the program has so far been re-climbing to known capacity. The record also cannot yet separate 'loads inside capacity' from 'slowdown detector not sensitive enough'. The first informative zone is H3 around 90-92.5 kg, about 2-3 squat increments away.

Some costs are deliberate prices of the user's own constraints:
- little hypertrophy stimulus during a deficit;
- DL and OHP held at maintenance-or-lower doses by the caps;
- no maximal reality check (no tests, AMRAP or RIR).
These should be read as costs, not as defects.

Internal inconsistencies:
- Spec §7.3 says 48 h between heavy PULL and OAP is 'structurally guaranteed'. It is not: 3 of 11 adjacencies were under 48 h.
- The 168 h hard-squat boundary has no tolerance and dropped 2 hard exposures, each by less than 15 minutes.
- Plan cutovers erase window, stagnation and hard-start history.
- The §19.5c '2 weeks per rung' rule cannot be enforced.
- The volume vetoes are effectively inert at current loads.
- The spec's §22.2 description of Coleman 2024 overstates it.

Goals:
- **G1 (175 kg high-bar at about 70 kg).** This is a rare, upper-percentile outcome. It needs about +70% from the ~103 kg reference, so it is defensible as a long-horizon direction but cannot be credibly dated.
- **G6 (one-arm chin-up).** The likely limiter is bilateral weighted-pull strength (+35 kg, about 47% of bodyweight, against practitioner heuristics of +60-67%), not the speed of the ladder.

Corrections to the brief:
- The DB now holds 29 sessions (one added on 10/14), and 10/14 logged bodyweight 76.
- Not every window ended INCREASE: DL (8/11) and OHP (9/24) each had one MAINTAIN forced by their caps.

Evidence caveats:
- Nearly all trials ran 5-12 weeks in young men.
- No study validates REF5's specific instrument: the binary slowdown judgment, the 6/4-exposure windows, or the 48 h/168 h gates.
- No trial covers weighted or one-arm pull-ups, climbing combined with heavy pulling, or quadriceps-tendon pain under high-bar loading.
- Every recommendation below keeps the fixed principles and changes at most one protocol element. Most are operational or documentation changes only.

## 코칭 종합

For this athlete's strength goal, REF5 v1.4 is a coherent, conservative program whose core prescriptions match the strongest evidence. Its known weaknesses are in measurement and observability rather than in the training stimulus.

Main strengths:
- Squat comes first in every session.
- Hard squats are capped at about 2 exposures a week at roughly 82–88% of the estimated max, with 2–3 sets per lift.
- Sets stop short of failure, with session RPE around 7–8.
- The decrease logic tolerates normal day-to-day noise.
- The session queue suits an irregular 2–4/week schedule.
- These features directly fix the failure modes the athlete reported on 5/3/1, nSuns and Tactical Barbell.

Main weaknesses:
- **Measurement:** bodyweight has been a default value (75.00 kg in 28 of 29 sessions). The slowdown judge is low-resolution and probably biased toward PASS at current loads. With no max check, the control reference value (REF) is already above the last-known maxima.
- **Unenforced OAP spacing:** the spec says heavy-pull/OAP separation is "structurally guaranteed", but it is not. 3 of 11 adjacencies were under 48 h.
- **OAP measurement:** the assistance ladder has uncontrolled assisting-hand force and a start rung that was too hard. After 5.7 weeks the net rung change is −1 left, 0 right.
- **Costs of the fixed constraints:** hypertrophy is under-dosed, and the caps hold DL and OHP at maintenance-level intensity.

The 87-day record cannot yet show whether the program works. All 106 kg-lift exposures were PASS, but every working load is still below the athlete's June 2026 3×3 loads. The first informative windows are about 7–11 weeks away.

Cadence will not limit long-run progress: the squat ceiling of about 34–43 kg/yr exceeds even competitive powerlifters' best yearly squat gains. The limiter will be window outcome quality, which will hit squat first because it has the longest window.

G1 is a rare, multi-year outcome (about +70% on a ~103 kg 1RM, roughly 6–11 years at 5–10%/yr), and REF cannot confirm it. G6 is limited by pulling strength relative to bodyweight, not by ladder speed.

Highest-value actions, none of which change the protocol:
1. Measure bodyweight.
2. Correct spec §7.3 (the 48 h claim) and §22.2 (the Coleman wording).
3. Log climbing, elbow pain and knee pain outside the program.
4. Do not judge efficacy until standards exceed the June loads.

Evidence used: meta-analyses, RCTs and position stands where they exist, and the internal DB and engine records. Coaching and practitioner sources were used only for program comparison and the OAP ladder. No trial validates REF5's specific windows, gates or slowdown judge, so judgments about those are extrapolation.

## 병합 종합

Two independent evaluations were merged into 24 claims. Before merging, three spec facts were checked read-only in docs/ref5-program-spec.md:
- line 302: the 48 h claim reads "구조적으로 보장된다" ("structurally guaranteed");
- line 842: Coleman 2024 is described as "열위" ("inferior");
- line 792: the protein range is 1.6–2.2 g/kg; line 904: the audit criterion is days below 1.6 g/kg.

Both evaluations agree that REF5 v1.4 is a coherent, conservative, low-input strength program. Its core stimulus matches the strongest current evidence for 1RM strength:
- squat comes first in every session;
- hard squat runs about 2 times a week, at least 48 h apart;
- heavy 2–3-rep sets at about 82–88% of estimated 1RM;
- 2–3 work sets per lift per session, about 3–6 hard sets per main lift per week;
- no sets to failure;
- no scheduled deloads (the deload evidence is too weak to require them).

The session queue, density valve and noise-tolerant 2.5 kg windows suit an irregular 2–4/week schedule. The squat cadence ceiling (about 34–43 kg/yr of H3) is above even the best competitive yearly squat gains, so cadence will not limit long-run progress. Window outcome quality will, and it will bite squat first because squat has the longest window.

**Main weaknesses (both lenses).** These sit in measurement and documentation, not in the stimulus:
1. **Bodyweight is a default value.** It is 75.00 kg in 28 of 29 sessions, so the G1 KPI, PULL totals and the §23.1 recovery audit cannot be computed. Sleep, protein, climbing and pain are not recorded either.
2. **The 106/106 PASS record cannot yet test efficacy.** It is re-acquisition below the June 2026 3×3 loads. The first informative zone (H3 about 90–92.5 kg) is about 7–11 weeks away.
3. **Nothing re-anchors REF to true capacity.** The binary slowdown judgment is low-resolution at current loads. REF (107.2/104.1/111.1) is already above the last demonstrated maxima.
4. **Two spec errors.** §7.3's "structurally guaranteed" 48 h heavy-pull/OAP separation does not hold: 3 of 11 adjacencies were under 48 h. §22.2 calls the Coleman 2024 result "inferior", which overstates it.
5. **Implementation frictions:**
   - the zero-tolerance 168 h boundary cost 2 hard exposures, each by minutes;
   - plan cutovers erase window, stagnation and structureReview history;
   - the OAP rung dwell rule cannot be enforced;
   - the OAP rungs measure assisting-hand placement as much as strength.

**Costs of the user's own constraints.** These are reported as costs, not defects: little hypertrophy stimulus during a deficit; DL and OHP held at maintenance intensity by the C7/C8 caps; no maximal reality check.

**Where the lenses disagree:**
- **Verdict labels:**
  - frequency cap: tradeoff vs strength;
  - weekly volume: tradeoff vs strength;
  - window cadence: strength vs tradeoff;
  - hypertrophy: weakness vs tradeoff;
  - climbing: tradeoff vs risk.
- **Slowdown judgment bias:** B thinks the tie-break biases it toward PASS. A thinks the net direction is uncertain, because people also underpredict reps to failure.
- **Whether to put protocol candidates on the table now:**
  - A offers a ≥166 h lookback tolerance; B calls it unnecessary.
  - B offers OHP rep progression and moving OAP ahead of BP focus as §26 proposals; A says no change for the first and keeps the second conditional.
- **Confidence:** on intensity and proximity, A high, B medium; on G1, A medium, B low.

**One recommendation narrowed.** B suggested reading MAINTAIN windows at a 3–10%/yr benchmark as "predicted, not a signal to restructure". That would conflict with the §21.1 pre-registration that low acquisition is first read as insufficient stimulus or recovery. It was narrowed to a context-only note.

**Goals:**
- **G1 (175 kg high-bar at about 70 kg).** It needs about +70% on a ~103 kg reference. It is a rare, upper-percentile, multi-year direction that cannot be credibly dated or confirmed by REF.
- **G6 (one-arm chin-up).** The limit is bilateral weighted-pull strength relative to bodyweight, not ladder speed: about +47% of bodyweight now against +60–67% in practitioner heuristics.

**Highest-value actions.** None of these changes the protocol:
1. Measure bodyweight.
2. Fix spec §7.3 and §22.2.
3. Log climbing, elbow pain, knee pain and three recovery items, outside the judgment.
4. Standardize the OAP assisting-hand contact.
5. Add a "first slowed rep" field that the judgment does not read.
6. Do not judge adaptation rate until each lift's standard exceeds its June 2026 load.

Every protocol candidate in the claims is optional, changes a single element, and is conditional on the §21.1/§23.1 path. None relaxes FAIL 0, HOLD ≤1 or the volume veto, and none adds accessories, tests, RIR, AMRAP or scheduled deloads.

**Corrections to the brief:**
- The DB holds 29 REF5 sessions; the 10/14 session was added and logged bodyweight 76.
- DL (8/11) and OHP (9/24) each had one MAINTAIN window forced by their caps.

**Evidence caveats:**
- Nearly all trials ran 5–12 weeks, mostly in young and often less-trained men.
- No study validates REF5's binary slowdown judgment, its 6/4-exposure windows, or its 48 h/168 h gates.
- No trial covers weighted or one-arm pull-ups, climbing combined with heavy pulling, or quadriceps-tendon pain under high-bar loading.
- Program comparisons rest on program documents and secondary summaries.
