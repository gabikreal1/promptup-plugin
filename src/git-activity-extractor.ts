/**
 * Git Activity Extractor
 *
 * Parses stored tool_uses from MessageRow records to extract git operations
 * (checkout, commit, push, branch_create, merge). Provides exact
 * session → branch → commit mappings without relying on timestamp heuristics.
 *
 * Bash commands from Claude Code may be:
 *   - Simple:   git checkout -b feature/auth
 *   - Chained:  cd /repo && git commit -m "fix"
 *   - Heredoc:  git commit -m "$(cat <<'EOF'\nFix bug\nEOF\n)"
 *
 * STANDALONE port — no imports from @promptup/shared or workspace packages.
 */

import { ulid } from 'ulid';
import type { MessageRow, GitActivityRow } from './shared/types.js';
import { insertGitActivity } from './db.js';

// ─── Internal types ──────────────────────────────────────────────────────────

interface ToolUse {
  name: string;
  input: Record<string, unknown>;
}

export interface ExtractedGitOp {
  type: 'checkout' | 'commit' | 'push' | 'branch_create' | 'merge';
  branch: string | null;
  commitHash: string | null;
  commitMessage: string | null;
  remote: string | null;
  rawCommand: string;
  messageIndex: number;
  createdAt: string;
}

// ─── Regex patterns ──────────────────────────────────────────────────────────

// git checkout [-b] <branch> — optional flags like --track before branch name
const RE_CHECKOUT = /\bgit\s+checkout\s+((?:-[^\s]+\s+)*?)(-b\s+)?([A-Za-z0-9_.\-/]+)\b/;

// git switch [-c] <branch>
const RE_SWITCH = /\bgit\s+switch\s+((?:-[^\s]+\s+)*?)(-c\s+)?([A-Za-z0-9_.\-/]+)\b/;

// git commit — captures quoted message (including heredoc first-line)
const RE_COMMIT = /\bgit\s+commit\b[^"']*?(?:-m\s*(?:"([^"]*?)"|'([^']*?)'))/s;

// git commit with heredoc: -m "$(cat <<'EOF'\nFirst line\n..."
const RE_COMMIT_HEREDOC = /\bgit\s+commit\b.*?-m\s*"\$\(cat\s*<<'?EOF'?\s*\\?n([^\n\\]+)/s;

// git push [flags] [remote] [branch]
const RE_PUSH = /\bgit\s+push\b((?:\s+(?:--force|-f|--set-upstream|-u))*)\s+([A-Za-z0-9_.\-/]+)\s+([A-Za-z0-9_.\-/]+)/;

// git push with just remote and branch (no flags)
const RE_PUSH_SIMPLE = /\bgit\s+push\s+([A-Za-z0-9_.\-/]+)\s+([A-Za-z0-9_.\-/]+)/;

// git merge <branch>
const RE_MERGE = /\bgit\s+merge\s+([A-Za-z0-9_.\-/]+)/;

// Read-only operations to ignore
const RE_READONLY = /\bgit\s+(?:log|status|diff|show|blame|fetch|clone|remote|branch\s+-[lav]|stash\s+list|tag\b)/;

// ─── Segment-level parser ────────────────────────────────────────────────────

function parseSegment(segment: string): Omit<ExtractedGitOp, 'rawCommand' | 'messageIndex' | 'createdAt'> | null {
  const s = segment.trim();

  // Skip read-only git operations early
  if (RE_READONLY.test(s)) return null;

  // Skip if no git command at all
  if (!/\bgit\b/.test(s)) return null;

  // git commit (heredoc form takes priority — matches $(...) syntax)
  const heredocMatch = RE_COMMIT_HEREDOC.exec(s);
  if (heredocMatch) {
    const firstLine = (heredocMatch[1] ?? '').trim();
    return { type: 'commit', branch: null, commitHash: null, commitMessage: firstLine || null, remote: null };
  }

  // git commit (quoted -m form)
  const commitMatch = RE_COMMIT.exec(s);
  if (commitMatch) {
    const msg = (commitMatch[1] ?? commitMatch[2] ?? '').split('\n')[0].trim();
    return { type: 'commit', branch: null, commitHash: null, commitMessage: msg || null, remote: null };
  }

  // git push (with flags — try full form first)
  const pushMatch = RE_PUSH.exec(s);
  if (pushMatch) {
    const remote = pushMatch[2] ?? null;
    const branch = pushMatch[3] ?? null;
    return { type: 'push', branch, commitHash: null, commitMessage: null, remote };
  }

  // git push simple (no flags)
  const pushSimple = RE_PUSH_SIMPLE.exec(s);
  if (pushSimple) {
    const remote = pushSimple[1] ?? null;
    const branch = pushSimple[2] ?? null;
    return { type: 'push', branch, commitHash: null, commitMessage: null, remote };
  }

  // git switch [-c] <branch>
  const switchMatch = RE_SWITCH.exec(s);
  if (switchMatch) {
    const isCreate = !!switchMatch[2];
    const branch = switchMatch[3] ?? null;
    return { type: isCreate ? 'branch_create' : 'checkout', branch, commitHash: null, commitMessage: null, remote: null };
  }

  // git checkout [-b] <branch>
  const checkoutMatch = RE_CHECKOUT.exec(s);
  if (checkoutMatch) {
    const isCreate = !!checkoutMatch[2];
    const branch = checkoutMatch[3] ?? null;
    // Skip if this looks like a file path restore (git checkout -- file.ts)
    if (branch === '--') return null;
    return { type: isCreate ? 'branch_create' : 'checkout', branch, commitHash: null, commitMessage: null, remote: null };
  }

  // git merge <branch>
  const mergeMatch = RE_MERGE.exec(s);
  if (mergeMatch) {
    const branch = mergeMatch[1] ?? null;
    return { type: 'merge', branch, commitHash: null, commitMessage: null, remote: null };
  }

  return null;
}

// ─── Command-level parser (handles chaining with &&) ────────────────────────

function parseCommand(rawCommand: string, messageIndex: number, createdAt: string): ExtractedGitOp[] {
  const ops: ExtractedGitOp[] = [];

  // Split on && — each segment may independently contain a git operation
  const segments = rawCommand.split('&&');

  for (const segment of segments) {
    const result = parseSegment(segment);
    if (result) {
      ops.push({ ...result, rawCommand: rawCommand.trim(), messageIndex, createdAt });
    }
  }

  return ops;
}

// ─── Main extraction function ────────────────────────────────────────────────

/**
 * Parse tool_uses from a list of MessageRows and extract git operations.
 * Only inspects assistant messages with Bash tool uses.
 */
export function extractGitOps(messages: MessageRow[]): ExtractedGitOp[] {
  const allOps: ExtractedGitOp[] = [];

  for (const message of messages) {
    // Only assistant messages contain tool_uses
    if (message.role !== 'assistant') continue;
    if (!message.tool_uses) continue;

    let toolUses: ToolUse[];
    try {
      toolUses = JSON.parse(message.tool_uses) as ToolUse[];
    } catch {
      continue;
    }

    if (!Array.isArray(toolUses)) continue;

    for (const tool of toolUses) {
      // Only Bash tool calls contain shell commands
      if (tool.name !== 'Bash') continue;
      const command = tool.input?.command;
      if (typeof command !== 'string') continue;

      const ops = parseCommand(command, message.sequence_number, message.created_at);
      allOps.push(...ops);
    }
  }

  return allOps;
}

// ─── Store extracted git activity ─────────────────────────────────────────────

/**
 * Extract git operations from messages and persist them to the git_activities table.
 * Returns the list of stored rows.
 */
export function extractAndStoreGitActivity(messages: MessageRow[], sessionId: string): GitActivityRow[] {
  const ops = extractGitOps(messages);
  const rows: GitActivityRow[] = [];

  for (const op of ops) {
    const row: GitActivityRow = {
      id: ulid(),
      session_id: sessionId,
      type: op.type,
      branch: op.branch,
      commit_hash: op.commitHash,
      commit_message: op.commitMessage,
      remote: op.remote,
      raw_command: op.rawCommand,
      message_index: op.messageIndex,
      created_at: op.createdAt,
    };
    insertGitActivity(row);
    rows.push(row);
  }

  return rows;
}
