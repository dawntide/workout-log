package ui

// log_commands.go — 오늘 버퍼의 Tea 커맨드/메시지와 API 효과(저장·세션 로드·부트 오토로드·
// 세션 override·운동 picker). 순수 상태 변이/렌더링과 분리 — god-component 분해 3단계.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

type saveResultMsg struct {
	detail      *api.LogDetail
	err         error // write failure only; a successful write must never be retried as a new POST
	refreshErr  error // optional post-write detail/PR refresh failure
	savedID     string
	uncertain   bool // write may have committed but response was lost/undecodable
	retryReady  bool // reconciliation proved no matching commit; a new POST is safe
	edited      bool
	performedAt time.Time                // when the saved log is dated, for the edit banner
	feedback    *api.ProgressionFeedback // 서버 조립 판정 카드·배너(문구 그대로 표시)
}

func setMetaExtra(meta **api.SetMeta, key string, value any) {
	if *meta == nil {
		*meta = &api.SetMeta{}
	}
	if (*meta).Extra == nil {
		(*meta).Extra = make(map[string]json.RawMessage)
	}
	if raw, err := json.Marshal(value); err == nil {
		(*meta).Extra[key] = raw
	}
}

// saveCmd persists the done sets: PATCH when editID is set (editing a past
// session), POST otherwise. A zero performedAt means "now" (new log); editing
// preserves the original timestamp.
func saveCmd(c *api.Client, groups []exGroup, editID string, performedAt time.Time, planID, generatedSessionID, clientMutationID string, reconcileFirst ...bool) tea.Cmd {
	var sets []api.WorkoutSet
	for gi, g := range groups {
		name := strings.TrimSpace(g.name)
		for _, s := range g.sets {
			if !s.done {
				continue
			}
			rawWeight, _ := strconv.ParseFloat(s.weight, 64)
			w := round2(rawWeight)
			reps, _ := strconv.Atoi(s.reps)
			ws := api.WorkoutSet{
				ExerciseName: name, SortOrder: gi, SetNumber: s.setNumber,
				WeightKg: w, Reps: reps, IsExtra: s.isExtra,
				Meta: cloneSetMetaIfPresent(s.originalMeta),
			}
			if isBodyweightExercise(name) && s.total > 0 {
				// weightKg is the external added weight; attach bodyweight meta so
				// the total load survives (server stores meta as-is).
				if ws.Meta == nil {
					ws.Meta = &api.SetMeta{}
				}
				bodyweight := round2(s.total - rawWeight)
				ws.Meta.BodyweightKg = api.Float64(bodyweight)
				ws.Meta.TotalLoadKg = api.Float64(round2(bodyweight + w))
			} else if isBodyweightExercise(name) && ws.Meta != nil {
				// If bodyweight is unavailable, never pair a newly edited external
				// weight with stale bodyweight totals from the original log.
				ws.Meta.BodyweightKg = 0
				ws.Meta.TotalLoadKg = 0
			}
			if s.amrap {
				setMetaExtra(&ws.Meta, "amrap", true)
			}
			if !s.isExtra && isSlottedProgressionKey(g.progressionKey) {
				plannedRef := map[string]any{
					"progressionKey": g.progressionKey, "progressionLabel": name,
				}
				if g.progressionTarget != "" {
					plannedRef["progressionTarget"] = g.progressionTarget
				}
				if s.tgtReps > 0 {
					plannedRef["reps"] = s.tgtReps
				}
				if s.amrap {
					plannedRef["amrap"] = true
				}
				setMetaExtra(&ws.Meta, "plannedRef", plannedRef)
			} else if !s.isExtra && g.enforcePlannedReps && !s.amrap && s.tgtReps > 0 {
				plannedRef := map[string]any{"reps": s.tgtReps}
				if g.progressionTarget != "" {
					plannedRef["progressionTarget"] = g.progressionTarget
				}
				setMetaExtra(&ws.Meta, "plannedRef", plannedRef)
			}
			if rpe, err := strconv.Atoi(strings.TrimSpace(s.rpe)); err == nil && rpe > 0 {
				ws.RPE = &rpe
			}
			sets = append(sets, ws)
		}
	}
	return func() tea.Msg {
		at := performedAt
		if at.IsZero() {
			at = time.Now()
		}
		req := api.CreateLogRequest{
			PlanID: planID, GeneratedSessionID: generatedSessionID,
			ClientMutationID: clientMutationID, Sets: sets, PerformedAt: at,
		}
		if editID == "" && len(reconcileFirst) > 0 && reconcileFirst[0] {
			existing, reconcileErr := findMatchingSavedLog(c, req)
			if reconcileErr != nil {
				return saveResultMsg{
					err: fmt.Errorf("verify prior save: %w", reconcileErr), uncertain: true,
					performedAt: at,
				}
			}
			if existing != nil {
				detail, refreshErr := c.GetLog(context.Background(), existing.ID)
				return saveResultMsg{
					detail: detail, refreshErr: refreshErr, savedID: existing.ID, performedAt: at,
				}
			}
			return saveResultMsg{retryReady: true, performedAt: at}
		}
		id, err := editID, error(nil)
		var feedback *api.ProgressionFeedback
		if editID != "" {
			feedback, err = c.UpdateLog(context.Background(), editID, req)
		} else {
			id, feedback, err = c.CreateLog(context.Background(), req)
		}
		if err != nil {
			if editID == "" {
				existing, _ := findMatchingSavedLog(c, req)
				if existing != nil {
					detail, refreshErr := c.GetLog(context.Background(), existing.ID)
					return saveResultMsg{
						detail: detail, refreshErr: refreshErr, savedID: existing.ID, performedAt: at,
					}
				}
			}
			return saveResultMsg{
				err: err, edited: editID != "",
				uncertain: editID == "" && writeOutcomeUncertain(err), performedAt: at,
			}
		}
		detail, refreshErr := c.GetLog(context.Background(), id)
		return saveResultMsg{
			detail: detail, refreshErr: refreshErr, savedID: id,
			edited: editID != "", performedAt: at, feedback: feedback,
		}
	}
}

func requestSetFingerprints(sets []api.WorkoutSet) []string {
	out := make([]string, 0, len(sets))
	for _, set := range sets {
		rpe := 0
		if set.RPE != nil {
			rpe = *set.RPE
		}
		out = append(out, fmt.Sprintf("%s|%.6f|%d|%d|%t",
			strings.TrimSpace(set.ExerciseName), set.WeightKg, set.Reps, rpe, set.IsExtra))
	}
	sort.Strings(out)
	return out
}

func loggedSetFingerprints(sets []api.LoggedSet) []string {
	out := make([]string, 0, len(sets))
	for _, set := range sets {
		rpe := 0
		if set.RPE != nil {
			rpe = *set.RPE
		}
		out = append(out, fmt.Sprintf("%s|%.6f|%d|%d|%t",
			strings.TrimSpace(set.ExerciseName), float64(set.WeightKg), set.Reps, rpe, set.IsExtra))
	}
	sort.Strings(out)
	return out
}

func sameStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func findMatchingSavedLog(c *api.Client, req api.CreateLogRequest) (*api.LogItem, error) {
	logs, err := c.ListLogs(context.Background(), api.ListLogsParams{Limit: 100})
	if err != nil {
		return nil, err
	}
	wantSets := requestSetFingerprints(req.Sets)
	for i := range logs {
		logged := &logs[i]
		if !logged.PerformedAt.Equal(req.PerformedAt) || strOr(logged.PlanID) != req.PlanID ||
			strOr(logged.GeneratedSessionID) != req.GeneratedSessionID ||
			!sameStrings(loggedSetFingerprints(logged.Sets), wantSets) {
			continue
		}
		return logged, nil
	}
	return nil, nil
}

func writeOutcomeUncertain(err error) bool {
	var apiErr *api.APIError
	if !errors.As(err, &apiErr) {
		return true
	}
	return apiErr.Status == http.StatusRequestTimeout || apiErr.Status == http.StatusTooManyRequests ||
		apiErr.Status >= http.StatusInternalServerError
}

func draftSetFingerprints(draft todayDraft) []string {
	sets := make([]api.WorkoutSet, 0)
	for _, group := range draft.Groups {
		for _, set := range group.Sets {
			if !set.Done {
				continue
			}
			weight, weightErr := strconv.ParseFloat(strings.TrimSpace(set.Weight), 64)
			reps, repsErr := strconv.Atoi(strings.TrimSpace(set.Reps))
			if weightErr != nil || repsErr != nil {
				return nil
			}
			workoutSet := api.WorkoutSet{
				ExerciseName: strings.TrimSpace(group.Name), WeightKg: round2(weight),
				Reps: reps, IsExtra: set.IsExtra,
			}
			if raw := strings.TrimSpace(set.RPE); raw != "" {
				rpe, err := strconv.Atoi(raw)
				if err != nil {
					return nil
				}
				workoutSet.RPE = &rpe
			}
			sets = append(sets, workoutSet)
		}
	}
	return requestSetFingerprints(sets)
}

func draftMatchesLogged(draft todayDraft, logged api.LogItem) bool {
	if draft.PerformedAt.IsZero() || !logged.PerformedAt.Equal(draft.PerformedAt) ||
		strOr(logged.PlanID) != draft.PlanID ||
		strOr(logged.GeneratedSessionID) != draft.GeneratedSessionID {
		return false
	}
	want := draftSetFingerprints(draft)
	return want != nil && sameStrings(want, loggedSetFingerprints(logged.Sets))
}

type sessionLoadedMsg struct {
	snapshot           *api.SessionSnapshot
	prev               map[string]string // exerciseName(lower) → "weight×reps" last performance
	planName           string            // plan/program name for the today header
	sessionKey         string            // generated-session key for the header label
	planID             string            // active plan id, for session overrides
	generatedSessionID string            // saved generated-session row id
	bodyweight         float64           // user bodyweight for bodyweight-exercise load math
	noPlan             bool              // auto-load found no active plan
	err                error
}

// generatedSessionMsg generates a plan's session and pairs it with the prev-map
// from recent logs. Shared by the manual plan-activation path and the boot-time
// auto-load.
func generatedSessionMsg(c *api.Client, planID string) sessionLoadedMsg {
	s, err := c.GenerateSession(context.Background(), planID)
	if err != nil {
		return sessionLoadedMsg{planID: planID, err: err}
	}
	logs, _ := c.ListLogs(context.Background(), api.ListLogsParams{Limit: 50})
	return sessionLoadedMsg{
		snapshot:           &s.Snapshot,
		prev:               buildPrevMap(logs),
		planName:           s.Snapshot.Plan.Name,
		sessionKey:         s.SessionKey,
		planID:             planID,
		generatedSessionID: s.ID,
		bodyweight:         fetchBodyweight(c),
	}
}

// fetchBodyweight reads the user's bodyweight (kg) from settings
// (prefs.bodyweight.kg). 0 when unset/unavailable — bodyweight load math then
// falls back to showing the raw prescribed total (no breakdown).
func fetchBodyweight(c *api.Client) float64 {
	vals, err := c.Settings(context.Background())
	if err != nil {
		return 0
	}
	raw, ok := vals["prefs.bodyweight.kg"]
	if !ok {
		return 0
	}
	var f float64
	if json.Unmarshal(raw, &f) == nil {
		return f
	}
	var str string
	if json.Unmarshal(raw, &str) == nil {
		if v, err := strconv.ParseFloat(strings.TrimSpace(str), 64); err == nil {
			return v
		}
	}
	return 0
}

func loadSessionCmd(c *api.Client, planID string) tea.Cmd {
	return func() tea.Msg { return generatedSessionMsg(c, planID) }
}

// overrideDoneMsg reports the result of a session override (보강/교체); on success
// the today buffer regenerates so the change appears.
type overrideDoneMsg struct {
	err    error
	planID string
	desc   string
}

func addAccessoryCmd(c *api.Client, planID, sessionKey, name string, sets []api.OverrideSet) tea.Cmd {
	return func() tea.Msg {
		err := c.AddAccessory(context.Background(), planID, sessionKey, name, sets)
		return overrideDoneMsg{err: err, planID: planID, desc: "보강 " + name}
	}
}

func replaceExerciseCmd(c *api.Client, planID, sessionKey, blockTarget, name string) tea.Cmd {
	return func() tea.Msg {
		err := c.ReplaceExercise(context.Background(), planID, sessionKey, blockTarget, name)
		return overrideDoneMsg{err: err, planID: planID, desc: "교체 → " + name}
	}
}

// autoloadCmd boots today's buffer: resolve the active plan and generate its
// session, mirroring the web bootstrap so today is never a blank canvas. With
// no active plan it returns noPlan so the buffer prompts for a program instead.
// A crash-recovery draft from today takes precedence per classifyBootDraft.
func autoloadCmd(c *api.Client, drafts draftStore, ownerIDs ...string) tea.Cmd {
	return func() tea.Msg {
		ownerID := ""
		if len(ownerIDs) > 0 {
			ownerID = ownerIDs[0]
		}
		draft, hasDraft := loadTodayDraft(drafts, time.Now(), ownerID)
		// Resolve plans up front so both branches can name the session: the
		// restore branch maps a log's planId → name, the generate branch picks
		// the active plan.
		plans, plansErr := c.Plans(context.Background())
		// An existing log dated today (local) → restore it for editing (web
		// parity), so a re-open shows what was already done. Filter client-side
		// on each log's local date instead of a server date= query, so the day
		// boundary follows the user's timezone rather than the server's UTC
		// interpretation (an evening log won't slip to "yesterday").
		logs, logsErr := c.ListLogs(context.Background(), api.ListLogsParams{Limit: 100})
		var todayLog *api.LogItem
		if logsErr == nil {
			if lg, ok := todaysLog(logs, time.Now()); ok {
				todayLog = &lg
			}
		}
		// A started REF5 draft is session-bound, not day-bound. Verify that the
		// immutable generated session still exists. If another client already
		// saved that same session, the server log wins unless this is explicitly
		// an edit draft for that log.
		if hasDraft && draft.Ref5 != nil && draft.Ref5.Session != nil {
			var linkedLog *api.LogItem
			if logsErr == nil {
				for i := range logs {
					if logs[i].GeneratedSessionID != nil && *logs[i].GeneratedSessionID == draft.Ref5.Session.ID {
						linkedLog = &logs[i]
						break
					}
				}
			}
			// An edit draft can outlive the log it was patching (deleted in the
			// web app or another terminal). Verify that exact identity instead of
			// relying on the recent-log window; a 404 means resume the immutable
			// session but save it as a new POST, never PATCH a dangling id.
			if draft.EditID != "" {
				detail, err := c.GetLog(context.Background(), draft.EditID)
				if err == nil {
					if detail.GeneratedSessionID == nil || *detail.GeneratedSessionID != draft.Ref5.Session.ID {
						hasDraft = false
						if drafts != nil {
							_ = drafts.ClearDraft()
						}
					} else if linkedLog == nil {
						linkedLog = &api.LogItem{ID: detail.ID, GeneratedSessionID: detail.GeneratedSessionID}
					}
				} else {
					var apiErr *api.APIError
					if errors.As(err, &apiErr) && apiErr.Status == http.StatusNotFound {
						draft.EditID = ""
					} else {
						// Offline/transient verification failures preserve the draft and
						// its PATCH identity; guessing POST could create a duplicate.
						return draftRestoredMsg{draft: draft}
					}
				}
			}
			if !hasDraft {
				// Corrupt/mismatched edit ownership was already cleared above.
				// Continue normal boot without touching the referenced session.
			} else if linkedLog != nil && draft.EditID != linkedLog.ID {
				hasDraft = false
				if drafts != nil {
					_ = drafts.ClearDraft()
				}
			} else {
				planID := draft.Ref5.Session.PlanID
				if planID == "" {
					planID = draft.Ref5.Plan.ID
				}
				resumed, err := c.ResumeGeneratedSession(context.Background(), planID, draft.Ref5.Session.ID)
				if err == nil {
					draft.Ref5.Session = resumed
					return draftRestoredMsg{draft: draft}
				}
				var apiErr *api.APIError
				if errors.As(err, &apiErr) && apiErr.Status == http.StatusNotFound {
					hasDraft = false
					if drafts != nil {
						_ = drafts.ClearDraft()
					}
				} else {
					// Offline/transient failures must not destroy entered reps.
					return draftRestoredMsg{draft: draft}
				}
			}
		}

		// A generic history-edit draft belongs to its exact log, not merely to
		// whichever log happens to be first on today's list. Verify the PATCH
		// target directly so yesterday's/today's second session is neither
		// dropped nor silently converted into a duplicate POST.
		if hasDraft && (draft.Ref5 == nil || draft.Ref5.Session == nil) && draft.EditID != "" {
			detail, err := c.GetLog(context.Background(), draft.EditID)
			if err == nil {
				if detail.PlanID != nil {
					draft.PlanID = *detail.PlanID
				} else {
					draft.PlanID = ""
				}
				if detail.GeneratedSessionID != nil {
					draft.GeneratedSessionID = *detail.GeneratedSessionID
				} else {
					draft.GeneratedSessionID = ""
				}
				return draftRestoredMsg{draft: draft}
			}
			var apiErr *api.APIError
			if errors.As(err, &apiErr) && apiErr.Status == http.StatusNotFound {
				draft.EditID = ""
				return draftRestoredMsg{draft: draft}
			}
			// On a transient error, preserving the PATCH id is safer than guessing
			// POST and duplicating a progression-bearing workout.
			return draftRestoredMsg{draft: draft}
		}

		// New generic drafts are first-class same-day sessions. A different log
		// from today must not delete them. Drop only when the server proves this
		// exact pre-persisted POST identity and set payload already committed;
		// otherwise restore (including list/transient errors). Generated-session
		// IDs are reusable for generic plans and therefore are not unique enough.
		if hasDraft && (draft.Ref5 == nil || draft.Ref5.Session == nil) && draft.EditID == "" {
			committed := false
			if logsErr == nil {
				for _, logged := range logs {
					if draftMatchesLogged(draft, logged) {
						committed = true
						break
					}
				}
			}
			if !committed {
				return draftRestoredMsg{draft: draft}
			}
			hasDraft = false
			if drafts != nil {
				_ = drafts.ClearDraft()
			}
		}

		if plansErr != nil {
			switch classifyBootDraft(hasDraft, draft.EditID, todayLog, logsErr == nil) {
			case draftRestore:
				return draftRestoredMsg{draft: draft}
			case draftRestoreAsNew:
				draft.EditID = ""
				return draftRestoredMsg{draft: draft}
			case draftDrop:
				if drafts != nil {
					_ = drafts.ClearDraft()
				}
			}
			if todayLog != nil {
				return editLogMsg{
					id: todayLog.ID, performedAt: todayLog.PerformedAt, sets: todayLog.Sets,
					sessionKey: sessionKeyOf(*todayLog), planID: strOr(todayLog.PlanID),
					generatedSessionID: strOr(todayLog.GeneratedSessionID), bodyweight: fetchBodyweight(c),
				}
			}
			return sessionLoadedMsg{err: plansErr}
		}
		activePlan, hasActivePlan := api.ActivePlan(plans)
		if hasActivePlan && activePlan.IsRef5() {
			// A same-day generic draft still wins to prevent data loss, but existing
			// completed logs never auto-open for REF5: same-day multi-session is a
			// first-class flow.
			if hasDraft {
				return draftRestoredMsg{draft: draft}
			}
			sessions, err := c.ListGeneratedSessions(context.Background(), activePlan.ID)
			if err != nil {
				return ref5PlanPreparedMsg{plan: activePlan, bodyweight: fetchBodyweight(c), err: err}
			}
			planLogs, err := c.ListLogs(context.Background(), api.ListLogsParams{PlanID: activePlan.ID, Limit: 100})
			if err != nil {
				return ref5PlanPreparedMsg{plan: activePlan, bodyweight: fetchBodyweight(c), err: err}
			}
			return ref5PlanPreparedMsg{
				plan: activePlan, bodyweight: fetchBodyweight(c),
				sessions: ref5UnfinishedSessions(sessions, planLogs),
			}
		}

		switch classifyBootDraft(hasDraft, draft.EditID, todayLog, logsErr == nil) {
		case draftRestore:
			return draftRestoredMsg{draft: draft}
		case draftRestoreAsNew:
			draft.EditID = ""
			return draftRestoredMsg{draft: draft}
		case draftDrop:
			if drafts != nil {
				_ = drafts.ClearDraft()
			}
		}
		if todayLog != nil {
			return editLogMsg{
				id: todayLog.ID, performedAt: todayLog.PerformedAt, sets: todayLog.Sets,
				planName: planNameByID(plans, todayLog.PlanID), sessionKey: sessionKeyOf(*todayLog),
				planID: strOr(todayLog.PlanID), generatedSessionID: strOr(todayLog.GeneratedSessionID),
				bodyweight: fetchBodyweight(c),
			}
		}
		if !hasActivePlan {
			return sessionLoadedMsg{noPlan: true}
		}
		return generatedSessionMsg(c, activePlan.ID)
	}
}

// openExercisePickerCmd fetches the exercise dictionary and asks the frame to
// open a fuzzy picker tagged "exercise".
func openExercisePickerCmd(c *api.Client) tea.Cmd { return exercisePickerCmd(c, "운동 ", "exercise") }

func openStatsExercisePickerCmd(c *api.Client) tea.Cmd {
	return exercisePickerCmdOwned(c, "운동 ", "exercise", vStats)
}

// exercisePickerCmd opens an exercise picker with a custom prompt and routing
// tag (exercise add, accessory override, replace override).
func exercisePickerCmd(c *api.Client, prompt, tag string) tea.Cmd {
	return exercisePickerCmdOwned(c, prompt, tag, vToday)
}

func exercisePickerCmdOwned(c *api.Client, prompt, tag string, owner ViewKind) tea.Cmd {
	return func() tea.Msg {
		exs, _ := c.Exercises(context.Background(), "")
		items := make([]pickerItem, len(exs))
		for i, e := range exs {
			items[i] = pickerItem{label: e.Name, value: e.Name}
		}
		return openPickerMsg{prompt: prompt, tag: tag, items: items, owner: owner, owned: true}
	}
}
