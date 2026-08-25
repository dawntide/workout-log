package ui

// Go/TS 파리티 golden fixture 테스트 (Go 측).
// packages/core/fixtures/*.json 을 TS(packages/core/src/fixtures.test.ts)와 함께 읽어
// session-key 라벨·bodyweight 부하 변환의 두 언어 복제가 드리프트하면 CI에서 검출한다.

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func readFixture(t *testing.T, name string, out any) {
	t.Helper()
	path := filepath.Join("..", "..", "..", "..", "packages", "core", "fixtures", name)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("fixture %s 읽기 실패: %v", name, err)
	}
	if err := json.Unmarshal(data, out); err != nil {
		t.Fatalf("fixture %s 파싱 실패: %v", name, err)
	}
}

func TestGoldenSessionKeyLabels(t *testing.T) {
	var fx struct {
		Cases []struct {
			Key        string `json:"key"`
			CycleLabel string `json:"cycleLabel"`
		} `json:"cases"`
	}
	readFixture(t, "session-key.json", &fx)
	if len(fx.Cases) == 0 {
		t.Fatal("session-key fixture cases 비어 있음")
	}
	for _, c := range fx.Cases {
		if got := sessionLabel(c.Key); got != c.CycleLabel {
			t.Errorf("sessionLabel(%q) = %q, want %q", c.Key, got, c.CycleLabel)
		}
	}
}

func TestGoldenBodyweightLoad(t *testing.T) {
	var fx struct {
		IsBodyweight []struct {
			Name     string `json:"name"`
			Expected bool   `json:"expected"`
		} `json:"isBodyweight"`
		PrescriptionToExternal []struct {
			Name         string   `json:"name"`
			TotalKg      float64  `json:"totalKg"`
			BodyweightKg *float64 `json:"bodyweightKg"`
			Expected     float64  `json:"expected"`
		} `json:"prescriptionToExternal"`
		LoggedTotal []struct {
			Name            string   `json:"name"`
			WeightKg        float64  `json:"weightKg"`
			MetaTotalLoadKg *float64 `json:"metaTotalLoadKg"`
			Expected        float64  `json:"expected"`
		} `json:"loggedTotal"`
		AddedSuffix []struct {
			AddedKg    float64 `json:"addedKg"`
			ExpectedKo string  `json:"expectedKo"`
		} `json:"addedSuffix"`
	}
	readFixture(t, "bodyweight-load.json", &fx)
	if len(fx.IsBodyweight) == 0 {
		t.Fatal("bodyweight fixture 비어 있음")
	}

	for _, c := range fx.IsBodyweight {
		if got := isBodyweightExercise(c.Name); got != c.Expected {
			t.Errorf("isBodyweightExercise(%q) = %v, want %v", c.Name, got, c.Expected)
		}
	}

	for _, c := range fx.PrescriptionToExternal {
		// TS prescriptionToExternalLoadKg 동치: 비-맨몸이면 처방값 그대로, 맨몸이면 total-bw(체중 미설정 → 0).
		var got float64
		if !isBodyweightExercise(c.Name) {
			got = c.TotalKg
		} else {
			bw := 0.0
			if c.BodyweightKg != nil {
				bw = *c.BodyweightKg
			}
			got = bwExternalFromTotal(c.TotalKg, bw)
		}
		if got != c.Expected {
			t.Errorf("prescriptionToExternal(%q, %v, %v) = %v, want %v", c.Name, c.TotalKg, c.BodyweightKg, got, c.Expected)
		}
	}

	for _, c := range fx.LoggedTotal {
		var meta *api.SetMeta
		if c.MetaTotalLoadKg != nil {
			meta = &api.SetMeta{TotalLoadKg: api.Float64(*c.MetaTotalLoadKg)}
		}
		if got := loggedTotalLoad(c.Name, c.WeightKg, meta); got != c.Expected {
			t.Errorf("loggedTotalLoad(%q, %v, %v) = %v, want %v", c.Name, c.WeightKg, c.MetaTotalLoadKg, got, c.Expected)
		}
	}

	for _, c := range fx.AddedSuffix {
		if got := addedSuffix(c.AddedKg); got != c.ExpectedKo {
			t.Errorf("addedSuffix(%v) = %q, want %q", c.AddedKg, got, c.ExpectedKo)
		}
	}
}

func TestGoldenE1rm(t *testing.T) {
	var fx struct {
		Cases []struct {
			WeightKg float64 `json:"weightKg"`
			Reps     int     `json:"reps"`
			Expected float64 `json:"expected"`
		} `json:"cases"`
	}
	readFixture(t, "e1rm.json", &fx)
	if len(fx.Cases) == 0 {
		t.Fatal("e1rm fixture cases 비어 있음")
	}
	for _, c := range fx.Cases {
		got := math.Round(estimateE1rmKg(c.WeightKg, c.Reps)*10) / 10
		if got != c.Expected {
			t.Errorf("estimateE1rmKg(%v, %d) = %v, want %v", c.WeightKg, c.Reps, got, c.Expected)
		}
	}
}

func TestGoldenIntensityConversion(t *testing.T) {
	var fx struct {
		RirCases []struct {
			Shown  float64 `json:"shown"`
			Stored float64 `json:"stored"`
		} `json:"rirCases"`
		RpeCases []struct {
			Shown  float64 `json:"shown"`
			Stored float64 `json:"stored"`
		} `json:"rpeCases"`
	}
	readFixture(t, "intensity.json", &fx)
	if len(fx.RirCases) == 0 {
		t.Fatal("intensity fixture rirCases 비어 있음")
	}
	for _, c := range fx.RirCases {
		if got := intensityToStored(c.Shown, true); got != c.Stored {
			t.Errorf("intensityToStored(%v, RIR) = %v, want %v", c.Shown, got, c.Stored)
		}
		// 저장값이 5..10을 벗어나면 REF5의 rpe:0 센티널과 충돌할 수 있다.
		if c.Stored < 5 || c.Stored > 10 {
			t.Errorf("RIR 저장값 %v 가 5..10 밖 — 센티널 충돌 위험", c.Stored)
		}
	}
	for _, c := range fx.RpeCases {
		if got := intensityToStored(c.Shown, false); got != c.Stored {
			t.Errorf("intensityToStored(%v, RPE) = %v, want %v", c.Shown, got, c.Stored)
		}
	}
}
