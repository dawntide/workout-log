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
		if err := os.WriteFile(path, data, 0o600); err != nil {
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

// summarizeImport renders the import preview as "table N · table N" using the
// rows-to-insert count, skipping empty tables.
func summarizeImport(summary []api.ImportSummaryRow) string {
	parts := make([]string, 0, len(summary))
	for _, r := range summary {
		if r.WillInsert > 0 {
			parts = append(parts, fmt.Sprintf("%s %d", r.Table, r.WillInsert))
		}
	}
	if len(parts) == 0 {
		return "0건"
	}
	return strings.Join(parts, " · ")
}
