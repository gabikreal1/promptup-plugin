Generate a Decision Quality Score report for the current branch

Parse the user's arguments (`$ARGUMENTS`):
   - If `--post` is present, set `post: true`
   - If `--branch <name>` is present, set `branch` to that value
   - Otherwise use defaults (current branch, no posting)

2. Call the `mcp__promptup__generate_pr_report` tool with the parsed options.

3. Display the returned **markdown report** directly — it contains:
   - DQS score (Decision Quality Score, 0-100)
   - Key decisions grouped by category (Architecture & Direction, Quality Gates, Scope Adjustments, Overrides)
   - Summary table of decisions by type and signal level
   - Commits list

4. If `--post` was used and the report was posted to GitHub:
   - Confirm: "Posted to PR #N"
   - Show the PR URL

5. If `--post` was used but posting failed:
   - Explain why (no PR found, gh CLI not available, etc.)
   - Suggest: install `gh` CLI, push branch first, create PR first

6. If no sessions or decisions were found for the branch:
   - Explain that PromptUp needs active session data
   - Suggest running `/status` to check what's been tracked
