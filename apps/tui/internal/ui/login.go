package ui

import (
	"strings"

	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

// Login is the email/password sign-in view. ctrl+t toggles to signup, so a new
// user can create an account without leaving the TUI.
type Login struct {
	email      textinput.Model
	password   textinput.Model
	client     *api.Client
	focus      int // 0 email, 1 password
	signup     bool
	submitting bool
	err        string
	notice     string // password-reset confirmation (non-error)
	w, h       int
}

// NewLogin builds the form. client may be nil in tests (submission is gated by
// the Enter key, which the tests do not exercise).
func NewLogin(client *api.Client) Login {
	// Input widths are set per-render in field() from the terminal width, so a
	// phone-narrow terminal shrinks the box instead of clipping it off-screen.
	email := textinput.New()
	email.Placeholder = "you@example.com"
	email.Prompt = ""
	email.SetVirtualCursor(true)
	email.Focus()

	pw := textinput.New()
	pw.Placeholder = "••••••••"
	pw.Prompt = ""
	pw.EchoMode = textinput.EchoPassword
	pw.EchoCharacter = '•'
	pw.SetVirtualCursor(true)

	return Login{email: email, password: pw, client: client}
}

// Init starts the focused field's cursor.
func (l Login) Init() tea.Cmd { return l.email.Focus() }

func (l Login) Update(msg tea.Msg) (Login, tea.Cmd) {
	switch m := msg.(type) {
	case tea.WindowSizeMsg:
		l.w, l.h = m.Width, m.Height
		return l, nil
	case forgotResultMsg:
		l.submitting = false
		if m.err != nil {
			l.notice, l.err = "", humanizeAuthErr(m.err)
			return l, nil
		}
		l.err, l.notice = "", "재설정 메일을 보냈습니다. 메일함을 확인하세요"
		return l, nil
	case tea.KeyPressMsg:
		switch m.String() {
		case "tab", "down", "shift+tab", "up":
			l.focus = (l.focus + 1) % 2
			return l, l.refocus()
		case "ctrl+t":
			l.signup = !l.signup
			l.err, l.notice = "", ""
			return l, nil
		case "ctrl+f":
			return l.requestReset()
		case "enter":
			return l.submit()
		}
	}

	var cmd tea.Cmd
	if l.focus == 0 {
		l.email, cmd = l.email.Update(msg)
	} else {
		l.password, cmd = l.password.Update(msg)
	}
	return l, cmd
}

func (l Login) submit() (Login, tea.Cmd) {
	if l.submitting {
		return l, nil
	}
	email := strings.TrimSpace(l.email.Value())
	pw := l.password.Value()
	if email == "" || pw == "" {
		l.err = "이메일과 비밀번호를 입력하세요"
		return l, nil
	}
	if l.signup && len(pw) < 8 {
		l.err = "비밀번호는 8자 이상이어야 합니다"
		return l, nil
	}
	l.submitting = true
	l.err, l.notice = "", ""
	if l.signup {
		return l, signupCmd(l.client, email, pw)
	}
	return l, loginCmd(l.client, email, pw)
}

// requestReset sends a password-reset email for the entered address. Only the
// email field is needed; the reset link itself is completed in a browser.
func (l Login) requestReset() (Login, tea.Cmd) {
	if l.submitting {
		return l, nil
	}
	email := strings.TrimSpace(l.email.Value())
	if email == "" {
		l.err, l.notice = "이메일을 입력하세요", ""
		return l, nil
	}
	l.submitting = true
	l.err, l.notice = "", ""
	return l, forgotCmd(l.client, email)
}

func (l *Login) refocus() tea.Cmd {
	if l.focus == 0 {
		l.password.Blur()
		return l.email.Focus()
	}
	l.email.Blur()
	return l.password.Focus()
}

// withError clears the in-flight state and shows a humanized message.
func (l Login) withError(err error) Login {
	l.submitting = false
	l.err = humanizeAuthErr(err)
	return l
}

// serverHost strips the scheme/path from a base URL for a compact display
// (e.g. "https://api.example.com/" → "api.example.com").
func serverHost(u string) string {
	u = strings.TrimPrefix(u, "https://")
	u = strings.TrimPrefix(u, "http://")
	if i := strings.IndexByte(u, '/'); i >= 0 {
		u = u[:i]
	}
	return u
}

func humanizeAuthErr(err error) string {
	switch {
	case err == nil:
		return ""
	case api.IsUnauthorized(err):
		return "이메일 또는 비밀번호가 올바르지 않습니다"
	case api.IsConflict(err):
		return "이미 가입된 이메일입니다"
	case api.IsRateLimited(err):
		return "요청이 너무 많습니다. 잠시 후 다시 시도하세요"
	default:
		return err.Error()
	}
}

func (l Login) View() tea.View {
	w, h := l.w, l.h
	if w <= 0 {
		w = 48
	}
	if h <= 0 {
		h = 18
	}
	inner := loginContentWidth(w)

	mode := "login"
	if l.signup {
		mode = "signup"
	}
	dim := lipgloss.NewStyle().Foreground(theme.Dim)
	rows := []string{
		lipgloss.NewStyle().Foreground(theme.Amber).Bold(true).Render("ironlog"),
		dim.Render("terminal · " + mode),
	}
	// Server host on its own line so a long URL truncates rather than pushing
	// the whole header off the right edge on a narrow terminal.
	if l.client != nil {
		if host := serverHost(l.client.BaseURL()); host != "" {
			rows = append(rows, dim.Render(fitLine(host, inner)))
		}
	}
	rows = append(rows,
		"",
		l.field("email", l.email, l.focus == 0, inner),
		l.field("password", l.password, l.focus == 1, inner),
		"",
		l.statusLine(inner),
	)

	form := lipgloss.JoinVertical(lipgloss.Left, rows...)
	box := lipgloss.NewStyle().Padding(1, 3).Render(form)
	centered := lipgloss.Place(w, h, lipgloss.Center, lipgloss.Center, box)

	v := tea.NewView(centered)
	v.BackgroundColor = theme.Bg
	v.AltScreen = true
	return v
}

// loginContentWidth returns the inner content width of the centered login card:
// the terminal width minus the box's horizontal padding (3+3) and a small
// margin, clamped so the card stays readable on a phone yet does not sprawl on
// a wide desktop terminal.
func loginContentWidth(w int) int {
	inner := w - 8
	if inner < 22 {
		inner = 22
	}
	if inner > 46 {
		inner = 46
	}
	return inner
}

func (l Login) field(label string, ti textinput.Model, focused bool, inner int) string {
	marker := "  "
	lblColor := theme.Dim
	if focused {
		marker = lipgloss.NewStyle().Foreground(theme.Amber).Render(theme.GlyphActive + " ")
		lblColor = theme.Fg
	}
	lbl := lipgloss.NewStyle().Foreground(lblColor).Width(10).Render(label)
	// Chrome around the input is marker(2) + label(10) + "[ "(2) + " ]"(2) = 16
	// columns; give the rest to the field, with a floor so it stays usable.
	tiW := inner - 16
	if tiW < 10 {
		tiW = 10
	}
	// textinput v2 does not scroll or clip an over-long value, so hard-cap the
	// rendered field to tiW and pad to a fixed width — this both stops a long
	// email from overflowing the card and keeps the closing bracket aligned
	// across the two rows.
	ti.SetWidth(tiW)
	field := lipgloss.NewStyle().Width(tiW).Render(fitLine(ti.View(), tiW))
	box := lipgloss.NewStyle().Foreground(theme.Cyan).Render("[ " + field + " ]")
	return marker + lbl + box
}

func (l Login) statusLine(inner int) string {
	action, toggle := "로그인", "가입"
	if l.signup {
		action, toggle = "가입", "로그인"
	}
	switch {
	case l.submitting:
		return lipgloss.NewStyle().Foreground(theme.Cyan).Render(fitLine(action+" 중…", inner))
	case l.err != "":
		return lipgloss.NewStyle().Foreground(theme.Red).Render(fitLine(theme.GlyphFail+" "+l.err, inner))
	case l.notice != "":
		return lipgloss.NewStyle().Foreground(theme.Green).Render(fitLine(theme.GlyphDone+" "+l.notice, inner))
	default:
		// Wrap the key hints onto extra lines on a narrow terminal so the last
		// chip ([ctrl+f] 비번찾기) stays on-screen instead of clipping.
		return lipgloss.NewStyle().Foreground(theme.Dim).Render(flowHints([]string{
			"[⏎] " + action,
			"[tab] 이동",
			"[ctrl+t] " + toggle,
			"[ctrl+f] 비번찾기",
		}, inner))
	}
}
