---
name: eval
description: Evaluate the current coding session across 11 dimensions. Spawns an independent Claude analysis of your session transcript for unbiased scoring.
user-invocable: true
argument-hint: [session-id]
---

Call `mcp__promptup__evaluate_session` with the session ID from `$ARGUMENTS` if provided, otherwise no arguments.

**CRITICAL: The tool returns a fully formatted markdown report. Output the ENTIRE tool response text verbatim in your reply — do NOT summarize, rephrase, or truncate any part of it. Include the full table, all progress bars, all decisions, and all recommendations exactly as returned. The user needs to see every line.**

If the evaluation fails, explain what happened and suggest running `/status`.
