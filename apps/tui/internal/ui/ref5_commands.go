package ui

import (
	"context"

	tea "charm.land/bubbletea/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

type ref5PlanPreparedMsg struct {
	plan       api.Plan
	bodyweight float64
	sessions   []api.GeneratedSession
	err        error
}

func prepareRef5PlanCmd(c *api.Client, plan api.Plan) tea.Cmd {
	return func() tea.Msg {
		sessions, err := c.ListGeneratedSessions(context.Background(), plan.ID)
		if err != nil {
			return ref5PlanPreparedMsg{plan: plan, bodyweight: fetchBodyweight(c), err: err}
		}
		logs, err := c.ListLogs(context.Background(), api.ListLogsParams{PlanID: plan.ID, Limit: 100})
		if err != nil {
			return ref5PlanPreparedMsg{plan: plan, bodyweight: fetchBodyweight(c), err: err}
		}
		return ref5PlanPreparedMsg{
			plan: plan, bodyweight: fetchBodyweight(c),
			sessions: ref5UnfinishedSessions(sessions, logs),
		}
	}
}

type ref5PreviewResultMsg struct {
	session   *api.GeneratedSession
	planID    string
	signature string
	err       error
}

func ref5GenerateInput(values ref5StartValues) api.Ref5GenerateInput {
	return api.Ref5GenerateInput{
		ActualStartAt: values.ActualStartAt, TodayBodyweightKg: values.BodyweightKg,
		ManualMicro: values.ManualMicro, ClimbingWithin48h: values.ClimbingWithin48h,
		StartEventID: values.StartEventID, OmitPullVolume: values.OmitPullVolume,
	}
}

func previewRef5Cmd(c *api.Client, planID string, values ref5StartValues) tea.Cmd {
	signature := values.signature()
	return func() tea.Msg {
		session, err := c.PreviewRef5Session(context.Background(), planID, ref5GenerateInput(values))
		return ref5PreviewResultMsg{session: session, planID: planID, signature: signature, err: err}
	}
}

type ref5StartResultMsg struct {
	session   *api.GeneratedSession
	planID    string
	signature string
	values    ref5StartValues
	err       error
}

func startRef5Cmd(c *api.Client, planID string, values ref5StartValues) tea.Cmd {
	signature := values.signature()
	return func() tea.Msg {
		session, err := c.StartRef5Session(context.Background(), planID, ref5GenerateInput(values))
		return ref5StartResultMsg{session: session, planID: planID, signature: signature, values: values, err: err}
	}
}

type ref5ResumeResultMsg struct {
	session   *api.GeneratedSession
	planID    string
	sessionID string
	err       error
}

func resumeRef5Cmd(c *api.Client, planID, sessionID string) tea.Cmd {
	return func() tea.Msg {
		session, err := c.ResumeGeneratedSession(context.Background(), planID, sessionID)
		return ref5ResumeResultMsg{session: session, planID: planID, sessionID: sessionID, err: err}
	}
}
