package ui

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"
)

func TestSettingsRenders(t *testing.T) {
	st := NewSettings(nil)
	st.loaded = true
	st.values = map[string]json.RawMessage{
		"prefs.locale":        json.RawMessage(`"en"`),
		"prefs.bodyweight.kg": json.RawMessage(`82.5`),
	}
	out := ansi.Strip(st.Body(50, 12))
	for _, want := range []string{"언어", "English", "체중", "82.5kg"} {
		if !strings.Contains(out, want) {
			t.Errorf("settings body missing %q:\n%s", want, out)
		}
	}
}

func TestSettingsCycle(t *testing.T) {
	st := NewSettings(nil)
	st.values = map[string]json.RawMessage{"prefs.locale": json.RawMessage(`"ko"`)}
	next, cmd := st.cycle(settingDefs[0]) // locale ko → en
	if s2 := next.(Settings); s2.rawString("prefs.locale") != "en" {
		t.Errorf("expected en after cycle, got %q", s2.rawString("prefs.locale"))
	}
	if cmd == nil {
		t.Error("expected a PATCH command after cycle")
	}
}

func TestSettingsLoadingMode(t *testing.T) {
	if NewSettings(nil).Mode().Label != "LOADING" {
		t.Error("expected LOADING before data is loaded")
	}
}
