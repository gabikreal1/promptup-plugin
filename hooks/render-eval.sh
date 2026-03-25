#!/bin/bash
# PostToolUse hook: renders eval results as a formatted table directly to stderr
# Triggered after mcp__promptup__evaluate_session completes
# Reads hook JSON from stdin, extracts the tool output text, renders table

INPUT=$(cat)

# Extract the tool output text from the hook JSON
# The hook input has: { tool_name, tool_input, tool_output: { content: [{ text: "..." }] } }
TEXT=$(echo "$INPUT" | jq -r '.tool_output.content[0].text // empty' 2>/dev/null)

if [ -z "$TEXT" ]; then
  exit 0
fi

# Parse the markdown table from the eval output and render it with box drawing
# Extract lines between the table header and the next blank line
echo "$TEXT" | awk '
BEGIN {
  # Colors
  RED="\033[31m"
  YEL="\033[33m"
  GRN="\033[32m"
  BLD="\033[1m"
  DIM="\033[2m"
  RST="\033[0m"
  found_header=0
  found_table=0
}

# Hero composite score line
/^### Composite Score:/ {
  gsub(/^### /, "")
  gsub(/\*\*/, "")
  printf "\n" > "/dev/stderr"
  printf " %s%s%s\n", BLD, $0, RST > "/dev/stderr"
  next
}

# Progress bar line (emoji squares)
/^🟩|^🟨|^🟥/ {
  printf " %s\n", $0 > "/dev/stderr"
  printf "\n" > "/dev/stderr"
  next
}

# Table header
/^\| Dimension \| Score \| Why \|/ {
  printf " %s┌───────────────────────────┬──────────────────────────┬────────────────────────────────────────────────────────────────┐%s\n", DIM, RST > "/dev/stderr"
  printf " %s│ %-25s │ %-24s │ %-62s │%s\n", BLD, "Dimension", "Score", "Why", RST > "/dev/stderr"
  printf " %s├───────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────────────────┤%s\n", DIM, RST > "/dev/stderr"
  found_table=1
  next
}

# Table separator (skip)
/^\|---/ { next }

# Table rows
found_table && /^\|/ {
  # Split by |
  n = split($0, cols, "|")
  if (n >= 4) {
    dim = cols[2]
    score_col = cols[3]
    why = cols[4]

    # Trim whitespace
    gsub(/^[ \t]+|[ \t]+$/, "", dim)
    gsub(/^[ \t]+|[ \t]+$/, "", score_col)
    gsub(/^[ \t]+|[ \t]+$/, "", why)

    # Extract numeric score from score column
    match(score_col, /[0-9]+/)
    score = substr(score_col, RSTART, RLENGTH) + 0

    # Color based on score
    if (score >= 70) color = GRN
    else if (score >= 40) color = YEL
    else color = RED

    # Truncate why to fit
    if (length(why) > 62) why = substr(why, 1, 59) "..."

    printf " │ %-25s │ %s%-24s%s │ %s%-62s%s │\n", dim, color, score_col, RST, DIM, why, RST > "/dev/stderr"
  }
  next
}

# End of table (blank line after table)
found_table && /^$/ {
  printf " %s└───────────────────────────┴──────────────────────────┴────────────────────────────────────────────────────────────────┘%s\n", DIM, RST > "/dev/stderr"
  found_table=0
  next
}

# Developer prompts line
/^Developer prompts:/ {
  gsub(/\*\*/, "")
  printf "\n %s%s%s\n", DIM, $0, RST > "/dev/stderr"
  next
}

# Decisions header
/^### Decisions/ {
  printf "\n %s%sDecisions%s\n", BLD, "", RST > "/dev/stderr"
  next
}

# Decision lines (emoji + text)
/^🔀|^🚫|^✅|^✏️|^📐|^👍/ {
  gsub(/\*\*/, "\033[1m")
  printf " %s\n", $0 > "/dev/stderr"
  next
}

# Routine decisions note
/^\*\+/ {
  gsub(/\*/, "")
  printf " %s%s%s\n", DIM, $0, RST > "/dev/stderr"
  next
}

# Recommendations header
/^### Recommendations/ {
  printf "\n %s%sRecommendations%s\n", BLD, "", RST > "/dev/stderr"
  next
}

# Recommendation lines
/^🔴|^🟡|^🟢/ {
  printf " %s\n", $0 > "/dev/stderr"
  next
}
' 2>&1

exit 0
