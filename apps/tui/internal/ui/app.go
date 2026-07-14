package ui

import (
	"context"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/config"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

type appState int

const (
	stateLoading appState = iota
	stateLogin
	stateFrame
)

type authCheckedMsg struct{ user *api.User }

type loginResultMsg struct {
	user *api.User
	err  error
}

// loggedOutMsg returns to the login gate only after the server confirmed the
// logout (also emitted after successful account deletion).
type loggedOutMsg struct {
	err            error
	accountDeleted bool
}

// frameScopedMsg prevents a command launched under account A from mutating a
// freshly-created account B frame if its HTTP result arrives late.
type frameScopedMsg struct {
	generation uint64
	msg        tea.Msg
}

type legacyDraftDecisionMsg struct {
	path      string
	userID    string
	recovered bool
	discarded bool
	deferred  bool
	err       error
}

func recoverLegacyDraftCmd(cfg config.Config, path, userID string) tea.Cmd {
	return func() tea.Msg {
		err := cfg.RecoverQuarantinedDraft(path, userID)
		return legacyDraftDecisionMsg{path: path, userID: userID, recovered: err == nil, err: err}
	}
}

func discardLegacyDraftCmd(cfg config.Config, path, userID string) tea.Cmd {
	return func() tea.Msg {
		err := cfg.DiscardQuarantinedDraft(path, userID)
		return legacyDraftDecisionMsg{path: path, userID: userID, discarded: err == nil, err: err}
	}
}

func deferLegacyDraftCmd(path, userID string) tea.Cmd {
	return func() tea.Msg {
		return legacyDraftDecisionMsg{path: path, userID: userID, deferred: true}
	}
}

func scopeFrameCmd(generation uint64, cmd tea.Cmd) tea.Cmd {
	if cmd == nil {
		return nil
	}
	return func() tea.Msg {
		msg := cmd()
		if msg == nil {
			return nil
		}
		if batch, ok := msg.(tea.BatchMsg); ok {
			wrapped := make(tea.BatchMsg, len(batch))
			for i, child := range batch {
				wrapped[i] = scopeFrameCmd(generation, child)
			}
			return wrapped
		}
		switch msg.(type) {
		case tea.QuitMsg, tea.SuspendMsg:
			return msg
		}
		return frameScopedMsg{generation: generation, msg: msg}
	}
}

// isolatedClient carries only the current authenticated token into a new jar.
// Commands retained by an older frame keep their old client pointer, so even a
// late password rotation/account deletion cannot mutate the next account.
func isolatedClient(current *api.Client, token string) *api.Client {
	if current == nil {
		return nil
	}
	next, err := api.New(current.BaseURL())
	if err != nil {
		return current // BaseURL was already parsed by api.New; defensive fallback
	}
	if token != "" {
		next.SetSessionToken(token)
	}
	return next
}

func authCheckCmd(c *api.Client) tea.Cmd {
	return func() tea.Msg {
		u, _ := c.Me(context.Background())
		return authCheckedMsg{user: u}
	}
}

func loginCmd(c *api.Client, email, password string) tea.Cmd {
	return func() tea.Msg {
		u, err := c.Login(context.Background(), email, password)
		return loginResultMsg{user: u, err: err}
	}
}

func signupCmd(c *api.Client, email, password string) tea.Cmd {
	return func() tea.Msg {
		u, err := c.Signup(context.Background(), api.SignupRequest{Email: email, Password: password})
		return loginResultMsg{user: u, err: err}
	}
}

// forgotResultMsg reports a password-reset request result (err set on failure).
type forgotResultMsg struct{ err error }

func forgotCmd(c *api.Client, email string) tea.Cmd {
	return func() tea.Msg {
		return forgotResultMsg{err: c.RequestPasswordReset(context.Background(), email)}
	}
}

// App is the root model: it gates on auth (login) and then hands off to the
// Frame (the workout buffer chrome).
type App struct {
	cfg             config.Config
	client          *api.Client
	state           appState
	login           Login
	frame           Frame
	user            *api.User
	authGeneration  uint64
	legacyDraftPath string
	w, h            int
}

// NewApp wires login + frame. A persisted session token is verified on startup.
func NewApp(cfg config.Config, client *api.Client) App {
	quarantined, _ := cfg.QuarantineLegacyDraftPath()
	if quarantined == "" {
		quarantined = cfg.LatestQuarantinedDraft()
	}
	a := App{
		cfg: cfg, client: client, login: NewLogin(client), frame: NewFrame(client, cfg),
		legacyDraftPath: quarantined,
	}
	if tok := cfg.SessionToken(); tok != "" {
		client.SetSessionToken(tok)
		a.state = stateLoading
	} else {
		a.state = stateLogin
	}
	return a
}

func (a *App) offerLegacyDraftRecovery(userID string) bool {
	if userID == "" {
		return false
	}
	path := a.legacyDraftPath
	if path != "" && !a.cfg.CanRecoverQuarantinedDraft(path, userID) {
		path = ""
	}
	if path == "" {
		path = a.cfg.LatestQuarantinedDraftFor(userID)
	}
	if path == "" {
		return false
	}
	a.legacyDraftPath = path
	a.frame.confirmPrompt = "이전 버전의 소유자 미확인 초안을 이 계정으로 복구할까요?"
	a.frame.confirmCmd = recoverLegacyDraftCmd(a.cfg, path, userID)
	a.frame.confirmNoCmd = discardLegacyDraftCmd(a.cfg, path, userID)
	a.frame.confirmCancelCmd = deferLegacyDraftCmd(path, userID)
	a.frame.confirmYesLabel = "복구"
	a.frame.confirmNoLabel = "영구 폐기"
	a.frame.confirmCancelLabel = "보존"
	a.frame.overlay = overlayConfirm
	return true
}

func (a App) Init() tea.Cmd {
	switch a.state {
	case stateLoading:
		return authCheckCmd(a.client)
	case stateLogin:
		return a.login.Init()
	case stateFrame:
		return scopeFrameCmd(a.authGeneration, a.frame.Init())
	}
	return nil
}

func (a App) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	if scoped, ok := msg.(frameScopedMsg); ok {
		if a.state != stateFrame || scoped.generation != a.authGeneration {
			return a, nil
		}
		msg = scoped.msg
	}
	if action, ok := msg.(accountActionMsg); ok && action.err == nil && action.tokenRotated {
		if a.client != nil {
			if tok := a.client.SessionToken(); tok != "" {
				_ = a.cfg.SaveSessionToken(tok)
			}
		}
	}
	switch m := msg.(type) {
	case tea.KeyPressMsg:
		if m.String() == "ctrl+c" {
			if a.state == stateFrame && (a.frame.deletingAccount || a.frame.loggingOut) {
				return a, nil
			}
			return a, tea.Quit
		}
	case tea.WindowSizeMsg:
		a.w, a.h = m.Width, m.Height
		a.login, _ = a.login.Update(msg)
		fm, _ := a.frame.Update(msg)
		a.frame = fm.(Frame)
		return a, nil
	case authCheckedMsg:
		if m.user != nil {
			token := ""
			if a.client != nil {
				token = a.client.SessionToken()
			}
			a.client = isolatedClient(a.client, token)
			a.user = m.user
			a.state = stateFrame
			a.authGeneration++
			a.frame = NewFrame(a.client, a.cfg.WithDraftOwner(m.user.ID), m.user.ID)
			if a.w > 0 && a.h > 0 {
				fm, _ := a.frame.Update(tea.WindowSizeMsg{Width: a.w, Height: a.h})
				a.frame = fm.(Frame)
			}
			if a.offerLegacyDraftRecovery(m.user.ID) {
				return a, nil
			}
			return a, scopeFrameCmd(a.authGeneration, a.frame.Init())
		}
		a.state = stateLogin
		return a, a.login.Init()
	case loginResultMsg:
		if m.err == nil && m.user != nil {
			a.user = m.user
			if a.client != nil {
				if tok := a.client.SessionToken(); tok != "" {
					_ = a.cfg.SaveSessionToken(tok)
				}
			}
			token := ""
			if a.client != nil {
				token = a.client.SessionToken()
			}
			a.client = isolatedClient(a.client, token)
			a.state = stateFrame
			a.authGeneration++
			a.frame = NewFrame(a.client, a.cfg.WithDraftOwner(m.user.ID), m.user.ID)
			if a.w > 0 && a.h > 0 {
				fm, _ := a.frame.Update(tea.WindowSizeMsg{Width: a.w, Height: a.h})
				a.frame = fm.(Frame)
			}
			if a.offerLegacyDraftRecovery(m.user.ID) {
				return a, nil
			}
			return a, scopeFrameCmd(a.authGeneration, a.frame.Init())
		}
		a.login = a.login.withError(m.err)
		return a, nil
	case loggedOutMsg:
		if m.err != nil {
			a.frame.loggingOut = false
			a.frame.flash = "로그아웃 실패: " + humanizeAuthErr(m.err)
			return a, nil
		}
		_ = a.cfg.ClearSession()
		if m.accountDeleted && a.user != nil {
			_ = a.cfg.WithDraftOwner(a.user.ID).ClearDraft()
		}
		a.client = isolatedClient(a.client, "")
		a.user = nil
		a.authGeneration++
		a.state = stateLogin
		a.login = NewLogin(a.client)
		if a.w > 0 && a.h > 0 {
			a.login, _ = a.login.Update(tea.WindowSizeMsg{Width: a.w, Height: a.h})
		}
		a.frame = NewFrame(a.client, a.cfg)
		return a, a.login.Init()
	case legacyDraftDecisionMsg:
		if m.err != nil {
			a.frame.flash = "이전 초안 처리 실패: " + m.err.Error()
			return a, scopeFrameCmd(a.authGeneration, a.frame.Init())
		}
		if m.deferred {
			a.frame.flash = "이전 버전 초안을 보존했습니다 · 다음 실행에서 다시 확인합니다"
			return a, scopeFrameCmd(a.authGeneration, a.frame.Init())
		}
		a.legacyDraftPath = ""
		if m.recovered && a.user != nil && m.userID == a.user.ID {
			a.authGeneration++
			a.frame = NewFrame(a.client, a.cfg.WithDraftOwner(a.user.ID), a.user.ID)
			if a.w > 0 && a.h > 0 {
				fm, _ := a.frame.Update(tea.WindowSizeMsg{Width: a.w, Height: a.h})
				a.frame = fm.(Frame)
			}
			a.frame.flash = "이전 버전 초안을 이 계정으로 복구했습니다"
			return a, scopeFrameCmd(a.authGeneration, a.frame.Init())
		}
		if m.discarded {
			a.frame.flash = "이전 버전 초안을 폐기했습니다"
			return a, scopeFrameCmd(a.authGeneration, a.frame.Init())
		}
		return a, nil
	}

	switch a.state {
	case stateLogin:
		var cmd tea.Cmd
		a.login, cmd = a.login.Update(msg)
		return a, cmd
	case stateFrame:
		fm, cmd := a.frame.Update(msg)
		a.frame = fm.(Frame)
		return a, scopeFrameCmd(a.authGeneration, cmd)
	}
	return a, nil
}

func (a App) View() tea.View {
	switch a.state {
	case stateLogin:
		return a.login.View()
	case stateFrame:
		return a.frame.View()
	default:
		v := tea.NewView(lipgloss.NewStyle().Foreground(theme.Dim).Render("  authenticating…"))
		v.BackgroundColor = theme.Bg
		v.AltScreen = true
		return v
	}
}
