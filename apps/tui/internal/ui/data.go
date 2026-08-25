package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/securefile"
)

// exportDoneMsg / importDryRunMsg / importDoneMsg carry export-import results
// back to the frame, which shows them on the status line (and a confirm for the
// destructive replace step).
type exportDoneMsg struct {
	path string
	err  error
}

type importDryRunMsg struct {
	requestID uint64
	data      json.RawMessage
	summary   []api.ImportSummaryRow
	err       error
}

type importDoneMsg struct {
	requestID uint64
	summary   []api.ImportSummaryRow
	err       error
}

// exportCmd downloads the JSON export and writes it to ~/ironlog-export-<ts>.json.
func exportCmd(c *api.Client) tea.Cmd {
	return func() tea.Msg {
		data, err := c.ExportData(context.Background(), "json")
		if err != nil {
			return exportDoneMsg{err: err}
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return exportDoneMsg{err: err}
		}
		path := filepath.Join(home, fmt.Sprintf("ironlog-export-%s.json", time.Now().Format("20060102-150405")))
		if err := securefile.WriteFile(path, data); err != nil {
			return exportDoneMsg{err: err}
		}
		return exportDoneMsg{path: path}
	}
}

// importDryRunCmd reads the file and validates it server-side without applying.
func importDryRunCmd(c *api.Client, path string, requestID uint64) tea.Cmd {
	return func() tea.Msg {
		data, err := os.ReadFile(expandPath(path))
		if err != nil {
			return importDryRunMsg{requestID: requestID, err: err}
		}
		res, err := c.ImportData(context.Background(), json.RawMessage(data), false)
		if err != nil {
			return importDryRunMsg{requestID: requestID, err: err}
		}
		return importDryRunMsg{
			requestID: requestID, data: append(json.RawMessage(nil), data...), summary: res.Summary,
		}
	}
}

// importReplaceCmd applies the exact bytes that passed dry-run validation. It
// never re-reads the path after the user confirms the displayed summary.
func importReplaceCmd(c *api.Client, data json.RawMessage, requestID uint64) tea.Cmd {
	return func() tea.Msg {
		res, err := c.ImportData(context.Background(), data, true)
		if err != nil {
			return importDoneMsg{requestID: requestID, err: err}
		}
		return importDoneMsg{requestID: requestID, summary: res.Summary}
	}
}

func humanizeImportErr(err error) string {
	switch {
	case err == nil:
		return ""
	case api.IsRateLimited(err):
		return "요청이 너무 많습니다. 잠시 후 다시 시도하세요"
	default:
		return err.Error()
	}
}

func expandPath(p string) string {
	p = strings.TrimSpace(p)
	if p == "~" || strings.HasPrefix(p, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, strings.TrimPrefix(p, "~"))
		}
	}
	return p
}

// recomputeTag는 파일이 담지 않고 import가 로그에서 다시 만드는 테이블을 알린다.
//
// 테이블명을 쓰지 않는 이유는 폭이다. 이 문자열은 파괴적 확인 프롬프트 **한 줄**에
// y/n 힌트와 함께 들어가고, 넘치면 말줄임 없이 잘린다(fitLine). 실측으로
// "planRuntimeState [재계산]"은 26칸, 이 라벨은 17칸이다 — 좁은 터미널에서 뜻을
// 더 오래 살린다. 현재 재계산 대상은 plan_runtime_state 하나이며, 새 대상이 생기면
// packages/core/src/data/export-import-coverage.test.ts의 recomputed 분류에서
// 먼저 걸린다.
const recomputeTag = "[자동진행 재계산]"

// summarizeImport renders the import preview as "table N · table N" using the
// rows-to-insert count, skipping empty tables.
//
// 재계산 테이블은 개수가 아니라 태그로 **맨 뒤에** 붙는다. willInsert가 늘 0이라
// 개수로 적으면 "지워지고 끝"으로 읽히는데, 실제로는 로그에서 다시 만들어진다.
// 맨 뒤인 이유: 프롬프트가 잘릴 때 먼저 지켜야 하는 것은 개수다(파일이 내 백업이
// 맞는지 판단하는 근거). 태그는 안심 정보라 뒤에 둔다.
func summarizeImport(summary []api.ImportSummaryRow) string {
	parts := make([]string, 0, len(summary)+1)
	recompute := false
	for _, r := range summary {
		if r.WillRecompute {
			recompute = true
			continue
		}
		if r.WillInsert > 0 {
			parts = append(parts, fmt.Sprintf("%s %d", r.Table, r.WillInsert))
		}
	}
	if len(parts) == 0 {
		// 아무것도 안 바뀌는 import에 재계산 태그만 남기면 없는 일을 알리는 셈이다.
		return "0건"
	}
	if recompute {
		parts = append(parts, recomputeTag)
	}
	return strings.Join(parts, " · ")
}
