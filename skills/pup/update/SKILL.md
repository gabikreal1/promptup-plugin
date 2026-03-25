---
name: update
description: Check for and install PromptUp plugin updates from npm.
user-invocable: true
---

1. Check the current installed version:
   ```bash
   cat ~/.promptup/plugin/package.json | grep '"version"'
   ```

2. Check the latest version on npm:
   ```bash
   npm view promptup-plugin version
   ```

3. If a newer version is available, tell the user and run:
   ```bash
   npx promptup-plugin@latest
   ```
   This re-runs the installer which overwrites files and updates everything.

4. If already on latest, say "PromptUp is up to date (vX.Y.Z)".

5. Remind the user to restart Claude Code after updating.
