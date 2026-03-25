/**
 * MCP tool handlers for the standalone PromptUp plugin.
 *
 * Three tools:
 *   - evaluate_session  — evaluate a coding session across 11 skill dimensions
 *   - generate_pr_report — generate a DQS report for a git branch
 *   - get_status         — show tracking status and recent activity
 *
 * STANDALONE — no imports from @promptup/shared or workspace packages.
 */
import { evaluateSession } from './evaluator.js';
import { generatePRReport } from './pr-report-generator.js';
import { parseTranscript, findLatestTranscript } from './transcript-parser.js';
import { extractAndStoreGitActivity } from './git-activity-extractor.js';
import * as db from './db.js';
import { ulid } from 'ulid';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
function detectBranch() {
    try {
        return execSync('git branch --show-current', { encoding: 'utf-8', timeout: 5000 }).trim() || null;
    }
    catch { return null; }
}
import { loadConfig, updateConfig } from './config.js';
function textResponse(text, isError = false) {
    return { content: [{ type: 'text', text }], ...(isError ? { isError } : {}) };
}
function progressBar(score, width = 20) {
    const filled = Math.round((score / 100) * width);
    const block = score >= 70 ? '🟩' : score >= 40 ? '🟨' : '🟥';
    return block.repeat(filled) + '⬜'.repeat(width - filled);
}
/** Truncate reasoning to fit in a table cell */
function truncReasoning(reasoning, max = 60) {
    if (!reasoning)
        return '';
    // Take first sentence or truncate
    const firstSentence = reasoning.split(/\.\s/)[0];
    const text = firstSentence.length <= max ? firstSentence : firstSentence.slice(0, max - 1) + '…';
    return text.replace(/\|/g, '/'); // escape pipe for markdown tables
}
const DECISION_ICONS = {
    steer: '🔀', reject: '🚫', validate: '✅',
    modify: '✏️', scope: '📐', accept: '👍',
};
/**
 * Try to locate the session-end.json file that Claude Code writes when a
 * session completes. Contains transcript_path and session metadata.
 */
function readSessionEndJson() {
    try {
        const candidates = [
            join(homedir(), '.claude', 'session-end.json'),
            join(process.cwd(), '.claude', 'session-end.json'),
        ];
        for (const p of candidates) {
            if (existsSync(p)) {
                return JSON.parse(readFileSync(p, 'utf-8'));
            }
        }
    }
    catch {
        // Ignore read/parse errors
    }
    return null;
}
/**
 * Parse tool-events.jsonl to extract Bash tool events containing git commands.
 * This captures git activity from the current MCP session context.
 */
function parseToolEventsForGit(sessionId) {
    const candidates = [
        join(homedir(), '.claude', 'tool-events.jsonl'),
        join(process.cwd(), '.claude', 'tool-events.jsonl'),
    ];
    for (const eventsPath of candidates) {
        if (!existsSync(eventsPath))
            continue;
        try {
            const raw = readFileSync(eventsPath, 'utf-8');
            const lines = raw.split('\n').filter(Boolean);
            const messages = [];
            for (let i = 0; i < lines.length; i++) {
                try {
                    const event = JSON.parse(lines[i]);
                    if (event.type !== 'tool_use' && event.type !== 'assistant')
                        continue;
                    // Build a minimal MessageRow with tool_uses to feed into the git extractor
                    const toolUses = [];
                    if (event.name === 'Bash' && event.input && typeof event.input === 'object') {
                        toolUses.push({ name: 'Bash', input: event.input });
                    }
                    else if (event.content && Array.isArray(event.content)) {
                        for (const block of event.content) {
                            if (block.type === 'tool_use' && block.name === 'Bash' && block.input) {
                                toolUses.push({ name: 'Bash', input: block.input });
                            }
                        }
                    }
                    if (toolUses.length > 0) {
                        messages.push({
                            id: ulid(),
                            session_id: sessionId,
                            role: 'assistant',
                            content: '',
                            tool_uses: JSON.stringify(toolUses),
                            sequence_number: i,
                            tokens_in: 0,
                            tokens_out: 0,
                            model: null,
                            created_at: event.timestamp ?? new Date().toISOString(),
                        });
                    }
                }
                catch {
                    // Skip malformed lines
                }
            }
            if (messages.length > 0) {
                extractAndStoreGitActivity(messages, sessionId);
            }
        }
        catch {
            // Ignore file-level errors
        }
    }
}
// ─── evaluate_session ────────────────────────────────────────────────────────
export async function handleEvaluateSession(args) {
    try {
        let transcriptPath = null;
        let sessionId = args.session_id ?? null;
        let messages = null;
        // Strategy 1: Check session-end.json for transcript_path
        const sessionEnd = readSessionEndJson();
        if (sessionEnd?.transcript_path && typeof sessionEnd.transcript_path === 'string') {
            transcriptPath = sessionEnd.transcript_path;
        }
        // Strategy 2: Find the latest transcript file
        if (!transcriptPath) {
            transcriptPath = findLatestTranscript();
        }
        // Strategy 3: If we have a session_id, check if messages are already in DB
        if (!transcriptPath && sessionId) {
            const session = db.getSession(sessionId);
            if (session?.transcript_path && existsSync(session.transcript_path)) {
                transcriptPath = session.transcript_path;
            }
        }
        if (!transcriptPath) {
            return textResponse('No transcript found. Ensure Claude Code is running and has an active session, ' +
                'or provide a session_id for a previously tracked session.\n\n' +
                'Transcripts are expected at ~/.claude/projects/<hash>/<session>.jsonl', true);
        }
        // Parse transcript
        messages = parseTranscript(transcriptPath);
        if (messages.length === 0) {
            return textResponse(`Transcript at ${transcriptPath} contains no user/assistant messages.`, true);
        }
        // Derive session ID from transcript if not provided
        if (!sessionId) {
            sessionId = messages[0].session_id;
        }
        // Create or find session in DB
        let session = db.getSession(sessionId);
        if (!session) {
            const now = new Date().toISOString();
            const firstMsg = messages[0];
            const lastMsg = messages[messages.length - 1];
            db.insertSession({
                id: sessionId,
                project_path: process.cwd(),
                transcript_path: transcriptPath,
                branch: detectBranch(),
                status: 'completed',
                message_count: messages.length,
                started_at: firstMsg.created_at,
                ended_at: lastMsg.created_at,
                created_at: now,
            });
            session = db.getSession(sessionId);
        }
        // Persist messages so decision detection + PR reports can access them
        db.insertMessages(messages);
        // Run evaluation
        const evaluation = await evaluateSession(sessionId, messages, 'manual');
        if (!evaluation) {
            return textResponse('Evaluation failed. Claude Code CLI may not be available, or the session is too short ' +
                '(minimum 3 messages required).', true);
        }
        // Parse eval data
        const dimScores = JSON.parse(evaluation.dimension_scores);
        const recommendations = evaluation.recommendations
            ? JSON.parse(evaluation.recommendations)
            : [];
        const trends = evaluation.trends
            ? JSON.parse(evaluation.trends)
            : [];
        const decisions = db.getDecisionsBySession(sessionId);
        // Count real developer prompts vs Claude responses
        const userCount = messages.filter(m => m.role === 'user').length;
        const assistantCount = messages.filter(m => m.role === 'assistant').length;
        const cls = evaluation.composite_score <= 40 ? 'Junior' : evaluation.composite_score <= 70 ? 'Middle' : 'Senior';
        // Build trend map for dimension arrows
        const trendMap = new Map();
        for (const t of trends) {
            if (t.direction === 'improving')
                trendMap.set(t.dimension_key, ` ▲+${Math.abs(t.delta)}`);
            else if (t.direction === 'declining')
                trendMap.set(t.dimension_key, ` ▼${t.delta}`);
        }
        // ── Build markdown ──
        const lines = [
            '## Session Evaluation',
            '',
            `### Composite Score: ${evaluation.composite_score}/100 — **${cls}**`,
            '',
            progressBar(evaluation.composite_score, 20),
            '',
            '| Dimension | Score | Why |',
            '|-----------|-------|-----|',
        ];
        for (const dim of dimScores) {
            const label = dim.key.replace(/_/g, ' ');
            const bar = progressBar(dim.score, 8);
            const trend = trendMap.get(dim.key) ?? '';
            const why = truncReasoning(dim.reasoning);
            lines.push(`| ${label} | ${bar} ${dim.score}${trend} | ${why} |`);
        }
        lines.push('', `Developer prompts: **${userCount}** | Claude responses: **${assistantCount}**`);
        // Decisions
        if (decisions.length > 0) {
            const high = decisions.filter(d => d.signal === 'high');
            const medium = decisions.filter(d => d.signal === 'medium');
            const low = decisions.filter(d => d.signal === 'low');
            lines.push('', '### Decisions', '');
            for (const d of high) {
                lines.push(`${DECISION_ICONS[d.type] ?? '•'} **${d.context}**`);
            }
            for (const d of medium) {
                lines.push(`${DECISION_ICONS[d.type] ?? '•'} ${d.context}`);
            }
            if (low.length > 0) {
                lines.push('', `*+ ${low.length} routine decision${low.length > 1 ? 's' : ''} not shown*`);
            }
        }
        // Recommendations
        if (recommendations.length > 0) {
            lines.push('', '### Recommendations', '');
            for (const rec of recommendations) {
                const badge = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
                lines.push(`${badge} **${rec.recommendation}**`);
                if (rec.suggestions && rec.suggestions.length > 0) {
                    for (const s of rec.suggestions) {
                        lines.push(`  - ${s}`);
                    }
                }
            }
        }
        return textResponse(lines.join('\n'));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResponse(`Evaluation error: ${msg}`, true);
    }
}
// ─── generate_pr_report ──────────────────────────────────────────────────────
export async function handleGeneratePRReport(args) {
    try {
        // Extract git activity from tool-events.jsonl if available
        const tempSessionId = ulid();
        parseToolEventsForGit(tempSessionId);
        // Backfill messages for sessions that have transcript_path but no stored messages
        // (e.g. sessions created by eval before this fix, or daemon-created sessions)
        const recentSessions = db.getRecentSessions(20);
        for (const s of recentSessions) {
            if (s.transcript_path) {
                const existing = db.getMessagesBySession(s.id, 1, 0);
                if (existing.length === 0) {
                    try {
                        const msgs = parseTranscript(s.transcript_path);
                        if (msgs.length > 0) {
                            // Rewrite session_id to match the DB session
                            for (const m of msgs)
                                m.session_id = s.id;
                            db.insertMessages(msgs);
                        }
                    }
                    catch { /* transcript may no longer exist */ }
                }
            }
        }
        // Generate the report
        const result = await generatePRReport({
            branch: args.branch,
            post: args.post,
            projectPath: process.cwd(),
        });
        const { report, isNew } = result;
        let text = '';
        if (!isNew) {
            text += `*Cached report found (generated ${report.created_at})*\n\n`;
        }
        text += report.markdown;
        text += '\n\n---\n';
        text += `**Report ID:** ${report.id}\n`;
        text += `**Branch:** ${report.branch}\n`;
        if (report.repo)
            text += `**Repo:** ${report.repo}\n`;
        if (report.pr_url)
            text += `**PR:** ${report.pr_url}\n`;
        text += `**DQS:** ${report.dqs !== null ? `${report.dqs}/100` : 'N/A'}\n`;
        text += `**Decisions:** ${report.total_decisions}\n`;
        if (report.posted_at)
            text += `**Posted to PR:** ${report.posted_at}\n`;
        return textResponse(text);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResponse(`PR report error: ${msg}`, true);
    }
}
// ─── get_status ──────────────────────────────────────────────────────────────
export async function handleGetStatus(_args) {
    try {
        const stats = db.getStats();
        const sessionEnd = readSessionEndJson();
        const latestEval = db.getLatestEvaluation();
        const recentSessions = db.getRecentSessions(5);
        let text = `## PromptUp Status\n\n`;
        // Overall stats
        text += `### Database\n`;
        text += `- **Sessions tracked:** ${stats.sessions}\n`;
        text += `- **Evaluations:** ${stats.evaluations}\n`;
        text += `- **Decisions captured:** ${stats.decisions}\n\n`;
        // Current session info from session-end.json
        if (sessionEnd) {
            text += `### Current Session\n`;
            if (sessionEnd.session_id)
                text += `- **Session ID:** ${sessionEnd.session_id}\n`;
            if (sessionEnd.transcript_path)
                text += `- **Transcript:** ${sessionEnd.transcript_path}\n`;
            if (sessionEnd.project_path)
                text += `- **Project:** ${sessionEnd.project_path}\n`;
            text += '\n';
        }
        // Latest evaluation
        if (latestEval) {
            const dimScores = JSON.parse(latestEval.dimension_scores);
            text += `### Latest Evaluation\n`;
            text += `- **Session:** ${latestEval.session_id}\n`;
            text += `- **Composite Score:** ${latestEval.composite_score}/100\n`;
            text += `- **Type:** ${latestEval.trigger_type} (${latestEval.report_type})\n`;
            text += `- **Date:** ${latestEval.created_at}\n`;
            text += `- **Dimensions:** ${dimScores.map(d => `${d.key}=${d.score}`).join(', ')}\n\n`;
        }
        // Recent sessions
        if (recentSessions.length > 0) {
            text += `### Recent Sessions\n`;
            for (const s of recentSessions) {
                const status = s.status === 'active' ? '[ACTIVE]' : '[DONE]';
                text += `- ${status} ${s.id} | ${s.message_count} msgs | ${s.started_at}\n`;
            }
            text += '\n';
        }
        if (stats.sessions === 0) {
            text += `*No sessions tracked yet. Use \`evaluate_session\` after completing a coding session, `;
            text += `or \`generate_pr_report\` to analyze decisions on a branch.*\n`;
        }
        return textResponse(text);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResponse(`Status error: ${msg}`, true);
    }
}
// ─── configure ──────────────────────────────────────────────────────────────
export async function handleConfigure(args) {
    try {
        // If setting values, apply them first
        if (args.set && Object.keys(args.set).length > 0) {
            const updated = updateConfig(args.set);
            const lines = ['## PromptUp Config Updated', ''];
            for (const [key, value] of Object.entries(args.set)) {
                lines.push(`**${key}** → \`${JSON.stringify(value)}\``);
            }
            lines.push('', '---', '');
            lines.push(formatConfig(updated));
            return textResponse(lines.join('\n'));
        }
        // If getting a specific value
        if (args.get) {
            const config = loadConfig();
            const value = getNestedFromConfig(config, args.get);
            return textResponse(`**${args.get}** = \`${JSON.stringify(value, null, 2)}\``);
        }
        // Default: show full config
        const config = loadConfig();
        return textResponse(formatConfig(config));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResponse(`Config error: ${msg}`, true);
    }
}
function formatConfig(config) {
    const lines = [
        '## PromptUp Configuration',
        '',
        '### Evaluation',
        `| Setting | Value | Options |`,
        `|---------|-------|---------|`,
        `| auto_trigger | \`${config.evaluation.auto_trigger}\` | off, prompt_count, session_end |`,
        `| interval | \`${config.evaluation.interval}\` | prompts between auto-evals |`,
        `| weight_profile | \`${config.evaluation.weight_profile}\` | balanced, greenfield, bugfix, refactor, security_review |`,
        `| timeout_seconds | \`${config.evaluation.timeout_seconds}\` | seconds |`,
        `| feedback_detail | \`${config.evaluation.feedback_detail}\` | brief, standard, detailed |`,
        '',
        '### Dimensions',
        `| Setting | Value |`,
        `|---------|-------|`,
        `| enabled | \`${JSON.stringify(config.dimensions.enabled)}\` |`,
        `| custom_weights | \`${config.dimensions.custom_weights ? 'set' : 'null (using profile)'}\` |`,
        '',
        '### Decisions',
        `| Setting | Value | Options |`,
        `|---------|-------|---------|`,
        `| signal_filter | \`${config.decisions.signal_filter}\` | high, high+medium, all |`,
        `| show_routine_count | \`${config.decisions.show_routine_count}\` | true/false |`,
        '',
        '### PR Report',
        `| Setting | Value |`,
        `|---------|-------|`,
        `| auto_post | \`${config.pr_report.auto_post}\` |`,
        `| base_branch | \`${config.pr_report.base_branch}\` |`,
        '',
        '### Classification',
        `| Band | Range |`,
        `|------|-------|`,
        ...Object.entries(config.classification.bands).map(([name, [min, max]]) => `| ${name} | ${min}-${max} |`),
        '',
        '### Status Line',
        `| Setting | Value |`,
        `|---------|-------|`,
        `| enabled | \`${config.statusline.enabled}\` |`,
        `| show_recommendation | \`${config.statusline.show_recommendation}\` |`,
        '',
        `*Config file: ~/.promptup/config.json*`,
    ];
    return lines.join('\n');
}
function getNestedFromConfig(obj, path) {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
        if (current === undefined || current === null)
            return undefined;
        current = current[part];
    }
    return current;
}
