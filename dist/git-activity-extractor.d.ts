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
import type { MessageRow, GitActivityRow } from './shared/types.js';
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
/**
 * Parse tool_uses from a list of MessageRows and extract git operations.
 * Only inspects assistant messages with Bash tool uses.
 */
export declare function extractGitOps(messages: MessageRow[]): ExtractedGitOp[];
/**
 * Extract git operations from messages and persist them to the git_activities table.
 * Returns the list of stored rows.
 */
export declare function extractAndStoreGitActivity(messages: MessageRow[], sessionId: string): GitActivityRow[];
