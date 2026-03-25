#!/bin/bash
DB="${CLAUDE_PLUGIN_DATA:-$HOME/.promptup}/promptup.db"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.promptup}"
CONFIG_FILE="$DATA_DIR/config.json"
UPDATE_FILE="$DATA_DIR/update-available"

if [ ! -f "$DB" ]; then
  echo "pupmeter: --"
  exit 0
fi

SCORE=$(sqlite3 "$DB" "SELECT composite_score FROM evaluations ORDER BY created_at DESC LIMIT 1" 2>/dev/null)
SCORE_INT=$(printf "%.0f" "${SCORE:-0}")

FILLED=$((SCORE_INT / 10))
EMPTY=$((10 - FILLED))
BAR=""
for i in $(seq 1 $FILLED 2>/dev/null); do BAR="${BAR}█"; done
for i in $(seq 1 $EMPTY 2>/dev/null); do BAR="${BAR}░"; done

# Check for update
UPDATE=""
if [ -f "$UPDATE_FILE" ]; then
  NEW_VER=$(cat "$UPDATE_FILE")
  UPDATE=" │ ⬆ ${NEW_VER}"
fi

echo "pupmeter ${BAR} ${SCORE_INT}%${UPDATE}"

# Show recommendation if enabled
SHOW_REC=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('statusline',{}).get('show_recommendation',True))" 2>/dev/null || echo "True")
if [ "$SHOW_REC" = "True" ]; then
  REC=$(sqlite3 "$DB" "SELECT recommendations FROM evaluations WHERE recommendations IS NOT NULL ORDER BY created_at DESC LIMIT 1" 2>/dev/null)
  if [ -n "$REC" ]; then
    TIP=$(echo "$REC" | python3 -c "
import sys,json
try:
  r=json.load(sys.stdin)
  if r: print(r[0].get('recommendation','')[:60])
except: pass
" 2>/dev/null)
    if [ -n "$TIP" ]; then
      echo "💡 ${TIP}"
    fi
  fi
fi
