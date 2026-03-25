
Parse `$ARGUMENTS`:
- No args → call `mcp__promptup__configure` with no parameters to show all settings
- A dot-path like `evaluation.interval` → call with `get: "evaluation.interval"`
- Key=value pairs like `evaluation.interval=5 evaluation.auto_trigger=prompt_count` → parse into an object and call with `set: {"evaluation.interval": 5, "evaluation.auto_trigger": "prompt_count"}`

Output the ENTIRE tool response verbatim — it contains a formatted settings table.
