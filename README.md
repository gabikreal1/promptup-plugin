# promptup-plugin

AI coding skill evaluator for Claude Code — 11-dimension scoring, decision intelligence, PR reports.

Zero infrastructure. Just SQLite at `~/.promptup/`.

## Install

```bash
npx promptup-plugin
```

This installs everything: MCP server, skills, hooks, statusline, and default config. Restart Claude Code to activate.

## What it does

**4 MCP Tools:**

| Tool | What |
|------|------|
| `evaluate_session` | Score a coding session across 11 skill dimensions |
| `generate_pr_report` | Decision Quality Score (DQS) report for a git branch |
| `get_status` | Sessions tracked, evaluations, decision counts |
| `configure` | View/modify all PromptUp settings |

**3 Skills:**
- `/eval` — Run an evaluation
- `/pr-report` — Generate PR report (optionally post to GitHub)
- `/status` — Check tracking status

**Statusline:** `pupmeter` shows your latest score in the Claude Code status bar.

**Hooks:** Passive tracking via PostToolUse + session capture on Stop. Auto-eval on prompt count (configurable). Update check on SessionStart.

## Requirements

- Node.js >= 20
- Claude Code

## Manual setup (alternative)

If you prefer not to use the installer:

```json
{
  "mcpServers": {
    "promptup": {
      "command": "node",
      "args": ["~/.promptup/plugin/dist/index.js"]
    }
  }
}
```

## Configuration

Run `configure` with no args to see all settings:

```
evaluation.auto_trigger    off | prompt_count | session_end
evaluation.interval        prompts between auto-evals (default: 10)
evaluation.weight_profile  balanced | greenfield | bugfix | refactor | security_review
evaluation.feedback_detail brief | standard | detailed
decisions.signal_filter    high | high+medium | all
pr_report.auto_post        true | false
```

Config file: `~/.promptup/config.json`

## Uninstall

```bash
npx promptup-plugin --uninstall
```

## License

MIT
