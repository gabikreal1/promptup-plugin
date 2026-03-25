/**
 * Parser for Claude Code JSONL transcript files.
 *
 * Fully self-contained — no imports from @promptup/shared or any workspace package.
 * Reads Claude Code JSONL files and produces MessageRow[] arrays.
 *
 * Claude Code JSONL format: each line is a JSON object with a `type` field:
 *   - "user"     — user prompt  (message.content: string | ContentBlock[])
 *   - "assistant" — model reply  (message.content: ContentBlock[], message.usage, message.model)
 *   - "progress" — tool progress (filtered out)
 *   - "system"   — system event  (filtered out)
 *   - "result"   — final result  (filtered out)
 *   - "file_history_snapshot" — file state (filtered out)
 */
import type { MessageRow } from './shared/types.js';
/**
 * Parse a Claude Code JSONL transcript file into MessageRow[].
 *
 * Reads the file, splits by newlines, parses each JSON line, filters to
 * 'user' and 'assistant' types, extracts text content, tool uses, token
 * usage, and model name. Assigns 0-indexed sequence numbers and generates
 * ULID-based IDs.
 *
 * Malformed lines are silently skipped.
 */
export declare function parseTranscript(filePath: string): MessageRow[];
/**
 * Find the most recent JSONL transcript file from Claude Code's project directory.
 * Looks in ~/.claude/projects/ for the most recently modified .jsonl file.
 *
 * Walks the directory tree up to 3 levels deep:
 *   ~/.claude/projects/<project-hash>/sessions/<session-id>.jsonl
 *
 * Returns the absolute path to the most recently modified file, or null if none found.
 */
export declare function findLatestTranscript(): string | null;
