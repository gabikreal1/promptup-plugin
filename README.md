# promptup-plugin

AI coding skill evaluator for Claude Code — 11-dimension scoring, decision intelligence, PR reports.

Zero infrastructure. Just SQLite at `~/.promptup/`.

## Install

```bash
npx promptup-plugin
```

Installs MCP server, commands, hooks, statusline, and default config. Restart Claude Code to activate.

## How it works

### Session tracking
Every Claude Code session is passively tracked via hooks. On session creation, the current git branch is recorded. This links sessions to PRs automatically.

### Evaluation
`/pup:eval` spawns an independent `claude -p` to analyze your session transcript across 11 dimensions. It extracts developer decisions (steers, rejects, validates, scopes) and generates coaching recommendations with before/after examples from your actual prompts. Falls back to heuristic scoring if Claude is unavailable.

### PR reports
`/pup:pr-report` matches sessions to the current branch, auto-evaluates unscored sessions, gathers all decisions, and computes a Decision Quality Score (DQS). The session-to-PR link uses `sessions.branch` — set when the session was created. Optionally posts as a GitHub PR comment.

### DQS formula
```
DQS = autonomy * 25% + discipline * 25% + validation * 30% + diversity * 20%
```
- **Autonomy**: How often you steer, reject, or modify AI output vs accepting
- **Discipline**: Ratio of modifications to blind accepts
- **Validation**: How often you verify/test output
- **Diversity**: How many decision types you use (steer, reject, validate, modify, scope, accept)

## Commands

| Command | What |
|---------|------|
| `/pup:eval` | Evaluate session across 11 skill dimensions |
| `/pup:pr-report` | DQS report for current branch (add `--post` to comment on PR) |
| `/pup:status` | Sessions tracked, evaluations, decision counts |
| `/pup:config` | View/modify settings (`/pup:config evaluation.auto_trigger=prompt_count`) |
| `/pup:update` | Check for and install updates |

## MCP Tools

| Tool | What |
|------|------|
| `evaluate_session` | Score session, extract decisions, coaching recommendations |
| `generate_pr_report` | Match sessions to branch, compute DQS, optionally post to GitHub |
| `get_status` | Tracking status and recent activity |
| `configure` | Show/modify config (dot-path keys) |

## Statusline

`pupmeter` shows your latest composite score in the Claude Code status bar with a recommendation tip.

## Hooks

| Hook | What | Async |
|------|------|-------|
| `PostToolUse` | Logs tool events to `~/.promptup/tool-events.jsonl` | Yes |
| `Stop` | Captures session end to `~/.promptup/session-end.json` | Yes |
| `SessionStart` | Background update check against npm | Yes |
| `UserPromptSubmit` | Auto-eval every N prompts (off by default) | Yes |

## Configuration

```bash
/pup:config                                        # show all settings
/pup:config evaluation.auto_trigger=prompt_count   # enable auto-eval
/pup:config evaluation.interval=5                  # eval every 5 prompts
/pup:config evaluation.weight_profile=bugfix       # scoring profile
/pup:config decisions.signal_filter=all            # show all decisions
```

Config file: `~/.promptup/config.json`

## 11 Dimensions

**Base (interaction quality):**
task decomposition, prompt specificity, output validation, iteration quality, strategic tool usage, context management

**Domain (depth of understanding):**
architectural awareness, error anticipation, technical vocabulary, dependency reasoning, tradeoff articulation

## Requirements

- Node.js >= 20
- Claude Code

## Manual setup

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

## Uninstall

```bash
npx promptup-plugin --uninstall
```

## License

MIT
