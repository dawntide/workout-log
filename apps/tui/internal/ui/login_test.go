package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func renderLogin(l Login, w, h int) string {
	nl, _ := l.Update(tea.WindowSizeMsg{Width: w, Height: h})
	return nl.View().Content
}

func TestLoginRenders(t *testing.T) {
	out := ansi.Strip(renderLogin(NewLogin(nil), 60, 18))
	for _, want := range []string{"ironlog", "email", "password", "로그인"} {
		if !strings.Contains(out, want) {
			t.Errorf("login view missing %q", want)
		}
	}
}

func TestLoginValidatesEmpty(t *testing.T) {
	l2, cmd := NewLogin(nil).submit()
	if cmd != nil {
		t.Error("expected no command when fields are empty")
	}
	if l2.err == "" {
		t.Error("expected a validation error when fields are empty")
	}
}

func TestLoginToggleSignup(t *testing.T) {
	nl, _ := NewLogin(nil).Update(tea.KeyPressMsg{Code: 't', Mod: tea.ModCtrl})
	if !nl.signup {
		t.Fatal("ctrl+t should toggle to signup mode")
	}
	out := ansi.Strip(renderLogin(nl, 60, 18))
	for _, want := range []string{"signup", "가입"} {
		if !strings.Contains(out, want) {
			t.Errorf("signup view missing %q:\n%s", want, out)
		}
	}
}

func TestLoginSignupShortPassword(t *testing.T) {
	l := NewLogin(nil)
	l.signup = true
	l.email.SetValue("new@example.com")
	l.password.SetValue("short") // <8
	l2, cmd := l.submit()
	if cmd != nil {
		t.Error("a <8 char signup password should be rejected")
	}
	if !strings.Contains(l2.err, "8자") {
		t.Errorf("err = %q, want a length error", l2.err)
	}
}

func TestLoginSignupValidSubmits(t *testing.T) {
	l := NewLogin(nil)
	l.signup = true
	l.email.SetValue("new@example.com")
	l.password.SetValue("password123")
	l2, cmd := l.submit()
	if cmd == nil || !l2.submitting {
		t.Error("a valid signup should produce a submit command")
	}
}

func TestLoginForgotNeedsEmail(t *testing.T) {
	l2, cmd := NewLogin(nil).requestReset()
	if cmd != nil {
		t.Error("reset with no email should not send")
	}
	if !strings.Contains(l2.err, "이메일") {
		t.Errorf("err = %q, want email prompt", l2.err)
	}
}

func TestLoginForgotSubmits(t *testing.T) {
	l := NewLogin(nil)
	l.email.SetValue("me@example.com")
	l2, cmd := l.requestReset()
	if cmd == nil || !l2.submitting {
		t.Error("a valid email should request a reset")
	}
}

func TestServerHost(t *testing.T) {
	cases := map[string]string{
		"https://api.example.com/": "api.example.com",
		"http://localhost:3000":    "localhost:3000",
		"https://x.com/some/path":  "x.com",
		"https://h.io:8443/":       "h.io:8443",
		"":                         "",
	}
	for in, want := range cases {
		if got := serverHost(in); got != want {
			t.Errorf("serverHost(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestLoginNarrowFits guards against the regression in the bug report: on a
// phone-width SSH terminal (~46 cols) the form clipped off the right edge. No
// rendered line may exceed the terminal width, and the last key hint must stay
// visible.
func TestLoginNarrowFits(t *testing.T) {
	for _, w := range []int{38, 46, 52} {
		l := NewLogin(nil)
		l.email.SetValue("someone@example.com")
		out := ansi.Strip(renderLogin(l, w, 22))
		for _, line := range strings.Split(out, "\n") {
			if got := lipgloss.Width(line); got > w {
				t.Errorf("w=%d: line %d cols exceeds width: %q", w, got, line)
			}
		}
		if !strings.Contains(out, "비번찾기") {
			t.Errorf("w=%d: password-reset hint clipped:\n%s", w, out)
		}
		if w == 46 {
			t.Logf("w=46 render:\n%s", out)
		}
	}
}

// TestLoginNarrowFitsServerURL covers the exact symptom from the report: the
// production server URL ran off the right edge. On a phone-width terminal the
// host line must stay within bounds while still identifying the server.
func TestLoginNarrowFitsServerURL(t *testing.T) {
	c, err := api.New("https://workout-log-two-bice.vercel.app")
	if err != nil {
		t.Fatal(err)
	}
	const w = 38
	out := ansi.Strip(renderLogin(NewLogin(c), w, 22))
	for _, line := range strings.Split(out, "\n") {
		if got := lipgloss.Width(line); got > w {
			t.Errorf("line %d cols exceeds width %d: %q", got, w, line)
		}
	}
	if !strings.Contains(out, "workout-log") {
		t.Errorf("server host not identifiable:\n%s", out)
	}
}

func TestLoginForgotNotice(t *testing.T) {
	l := NewLogin(nil)
	l.submitting = true
	nl, _ := l.Update(forgotResultMsg{})
	if nl.submitting {
		t.Error("submitting should clear after the reset result")
	}
	out := ansi.Strip(renderLogin(nl, 60, 18))
	if !strings.Contains(out, "재설정 메일") {
		t.Errorf("reset notice not rendered:\n%s", out)
	}
}
