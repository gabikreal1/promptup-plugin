
# /status — PromptUp Status

Show the current state of PromptUp tracking.

## Instructions

1. Call the `mcp__promptup__get_status` tool.

2. Present the results as a clean summary:

   **PromptUp Status**
   - Sessions tracked: N
   - Evaluations completed: N
   - Decisions captured: N
   - Latest session: [id] (started X ago)
   - Latest eval score: X/100
   - Tool events logged: N

3. If no data exists yet, explain:
   - PromptUp tracks sessions passively via hooks
   - Run `/eval` after a coding session to generate scores
   - Run `/pr-report` on a branch with commits to see decision analysis
