#!/bin/bash
# UserPromptSubmit hook: counts prompts, triggers background eval per config
PLUGIN_DIR="${CLAUDE_PLUGIN_ROOT:-$HOME/.promptup/plugin}"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.promptup}"
COUNT_FILE="$DATA_DIR/prompt-count"
CONFIG_FILE="$DATA_DIR/config.json"

mkdir -p "$DATA_DIR"

# Read config — check if auto_trigger is enabled
TRIGGER=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('evaluation',{}).get('auto_trigger','off'))" 2>/dev/null || echo "off")
if [ "$TRIGGER" = "off" ]; then
  exit 0
fi

INTERVAL=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('evaluation',{}).get('interval',10))" 2>/dev/null || echo "10")

COUNT=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
COUNT=$((COUNT + 1))
echo $COUNT > "$COUNT_FILE"

if [ "$TRIGGER" = "prompt_count" ] && [ "$COUNT" -ge "$INTERVAL" ]; then
  echo 0 > "$COUNT_FILE"
  nohup node -e "
    import { initDatabase, insertSession, insertMessages, getSession } from '$PLUGIN_DIR/dist/db.js';
    import { parseTranscript, findLatestTranscript } from '$PLUGIN_DIR/dist/transcript-parser.js';
    import { evaluateSession } from '$PLUGIN_DIR/dist/evaluator.js';
    import { ulid } from 'ulid';
    initDatabase();
    const tp = findLatestTranscript();
    if (!tp) process.exit(0);
    const msgs = parseTranscript(tp);
    if (msgs.length < 3) process.exit(0);
    const sid = msgs[0]?.session_id || ulid();
    if (!getSession(sid)) {
      insertSession({ id: sid, project_path: process.cwd(), transcript_path: tp, status: 'active', message_count: msgs.length, started_at: msgs[0].created_at, ended_at: msgs[msgs.length-1].created_at, created_at: new Date().toISOString() });
    }
    for (const m of msgs) m.session_id = sid;
    insertMessages(msgs);
    await evaluateSession(sid, msgs, 'prompt_count');
  " > /dev/null 2>&1 &
fi

exit 0
