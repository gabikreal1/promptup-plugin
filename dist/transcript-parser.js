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
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { ulid } from 'ulid';
// ─── Helpers ─────────────────────────────────────────────────────────────────
function isTextBlock(block) {
    return block.type === 'text' && typeof block.text === 'string';
}
function isToolUseBlock(block) {
    return block.type === 'tool_use' && typeof block.name === 'string';
}
/**
 * Extract human-readable text from a message's content field.
 */
function extractText(content) {
    if (typeof content === 'string')
        return content;
    if (!Array.isArray(content))
        return '';
    const parts = [];
    for (const block of content) {
        if (isTextBlock(block)) {
            parts.push(block.text);
        }
        else if (block.type === 'tool_result') {
            const tr = block;
            if (typeof tr.content === 'string') {
                parts.push(`[tool_result] ${tr.content}`);
            }
        }
    }
    return parts.join('\n');
}
/**
 * Extract tool_use blocks from content, returning a JSON-serializable array.
 */
function extractToolUses(content) {
    if (!Array.isArray(content))
        return null;
    const tools = [];
    for (const block of content) {
        if (isToolUseBlock(block)) {
            tools.push({ name: block.name, input: block.input });
        }
    }
    return tools.length > 0 ? JSON.stringify(tools) : null;
}
// ─── Main parser ─────────────────────────────────────────────────────────────
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
export function parseTranscript(filePath) {
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n');
    const messages = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        try {
            const parsed = JSON.parse(trimmed);
            const type = parsed.type;
            if (type !== 'user' && type !== 'assistant')
                continue;
            if (!parsed.message || typeof parsed.message !== 'object')
                continue;
            messages.push(parsed);
        }
        catch {
            // Skip malformed lines
        }
    }
    // Derive a session ID from the filename (strip .jsonl extension)
    const sessionId = basename(filePath, '.jsonl');
    const rows = [];
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const id = ulid();
        let role = msg.type;
        const timestamp = msg.timestamp ?? new Date().toISOString();
        let content;
        let toolUses = null;
        let tokensIn = 0;
        let tokensOut = 0;
        let model = null;
        if (msg.type === 'user') {
            content = extractText(msg.message.content);
            // Tool result messages have content blocks that are all tool_result type.
            // Keep them (they're useful for decision detection) but mark role as 'tool_result'
            // so the report can distinguish developer prompts from tool outputs.
            const msgContent = msg.message.content;
            if (Array.isArray(msgContent) && msgContent.length > 0 && msgContent.every(b => b.type === 'tool_result')) {
                role = 'tool_result';
            }
        }
        else {
            // assistant
            const assistantContent = msg.message.content;
            content = extractText(assistantContent);
            toolUses = extractToolUses(assistantContent);
            if (msg.message.usage) {
                tokensIn = msg.message.usage.input_tokens ?? 0;
                tokensOut = msg.message.usage.output_tokens ?? 0;
            }
            model = msg.message.model ?? null;
        }
        rows.push({
            id,
            session_id: sessionId,
            role,
            content,
            tool_uses: toolUses,
            sequence_number: i,
            tokens_in: tokensIn,
            tokens_out: tokensOut,
            model,
            created_at: timestamp,
        });
    }
    return rows;
}
// ─── Find latest transcript ──────────────────────────────────────────────────
/**
 * Find the most recent JSONL transcript file from Claude Code's project directory.
 * Looks in ~/.claude/projects/ for the most recently modified .jsonl file.
 *
 * Walks the directory tree up to 3 levels deep:
 *   ~/.claude/projects/<project-hash>/sessions/<session-id>.jsonl
 *
 * Returns the absolute path to the most recently modified file, or null if none found.
 */
export function findLatestTranscript() {
    const projectsDir = join(homedir(), '.claude', 'projects');
    if (!existsSync(projectsDir))
        return null;
    let latestPath = null;
    let latestMtime = 0;
    try {
        const projectDirs = readdirSync(projectsDir, { withFileTypes: true });
        for (const projectEntry of projectDirs) {
            if (!projectEntry.isDirectory())
                continue;
            const projectPath = join(projectsDir, projectEntry.name);
            // Look for .jsonl files directly in the project dir
            scanForJsonl(projectPath);
            // Look in a sessions/ subdirectory
            const sessionsDir = join(projectPath, 'sessions');
            if (existsSync(sessionsDir)) {
                scanForJsonl(sessionsDir);
            }
        }
    }
    catch {
        // Permissions error or similar — return what we have
    }
    function scanForJsonl(dir) {
        try {
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isFile() || !entry.name.endsWith('.jsonl'))
                    continue;
                const fullPath = join(dir, entry.name);
                try {
                    const stat = statSync(fullPath);
                    if (stat.mtimeMs > latestMtime) {
                        latestMtime = stat.mtimeMs;
                        latestPath = fullPath;
                    }
                }
                catch {
                    // Skip files we can't stat
                }
            }
        }
        catch {
            // Skip directories we can't read
        }
    }
    return latestPath;
}
