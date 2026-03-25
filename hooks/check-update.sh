#!/bin/bash
# SessionStart hook: checks for plugin update in background
PLUGIN_DIR="${CLAUDE_PLUGIN_ROOT:-$HOME/.promptup/plugin}"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.promptup}"
UPDATE_FILE="$DATA_DIR/update-available"

mkdir -p "$DATA_DIR"

# Get local version
LOCAL_VER=$(node -e "console.log(require('$PLUGIN_DIR/package.json').version)" 2>/dev/null || echo "0.0.0")

# Check remote version (npm registry)
REMOTE_VER=$(npm view @promptup/plugin version 2>/dev/null || echo "")

if [ -z "$REMOTE_VER" ]; then
  # Not published yet or no network — try GitHub
  REMOTE_VER=$(curl -sf "https://raw.githubusercontent.com/promptup/claude-plugin/main/package.json" 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).version)}catch{}})" 2>/dev/null || echo "")
fi

if [ -n "$REMOTE_VER" ] && [ "$REMOTE_VER" != "$LOCAL_VER" ]; then
  echo "$REMOTE_VER" > "$UPDATE_FILE"
else
  rm -f "$UPDATE_FILE"
fi

exit 0
