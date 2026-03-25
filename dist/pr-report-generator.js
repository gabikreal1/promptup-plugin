/**
 * PR Report Generator
 *
 * Orchestrates generating a Decision Quality Score (DQS) report for a pull request.
 * Uses git + gh CLI to gather branch/PR/commit data, then matches commits to sessions
 * via timestamp and project_path. Falls back to heuristic detection if no plugin
 * decisions are captured.
 *
 * STANDALONE port — no imports from @promptup/shared or workspace packages.
 */
import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ulid } from 'ulid';
import { computeDQS } from './shared/decision-score.js';
import { getDecisionsBySessions, getSessionsByTimeRange, getMessagesBySession, getLatestEvaluation, getEvaluationsBySession, insertPRReport, getPRReportByBranch, insertDecision, insertMessages, getSessionsByBranch, getSession, } from './db.js';
import { detectDecisions } from './decision-detector.js';
import { extractAndStoreGitActivity } from './git-activity-extractor.js';
import { evaluateSession } from './evaluator.js';
import { parseTranscript } from './transcript-parser.js';
const execFile = promisify(_execFile);
// ─── Shell helpers ───────────────────────────────────────────────────────────
async function run(cmd, args, cwd) {
    const { stdout } = await execFile(cmd, args, { cwd, timeout: 15_000 });
    return stdout.trim();
}
async function runSafe(cmd, args, cwd) {
    try {
        return await run(cmd, args, cwd);
    }
    catch {
        return null;
    }
}
// ─── Git / GH helpers ────────────────────────────────────────────────────────
async function getCurrentBranch(cwd) {
    const branch = await run('git', ['branch', '--show-current'], cwd);
    if (!branch)
        throw new Error('Unable to determine current git branch');
    return branch;
}
async function getRepo(cwd) {
    const repo = await runSafe('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], cwd);
    return repo ?? '';
}
async function detectBaseBranch(branch, cwd) {
    // Primary: get the base branch from the PR itself via gh
    const prBase = await runSafe('gh', ['pr', 'view', '--json', 'baseRefName', '-q', '.baseRefName'], cwd);
    if (prBase)
        return prBase;
    // Fallback: try common base branch names
    for (const candidate of ['main', 'master', 'develop']) {
        const exists = await runSafe('git', ['rev-parse', '--verify', candidate], cwd);
        if (exists !== null)
            return candidate;
    }
    return 'main';
}
async function getCommits(cwd, baseBranch) {
    const base = baseBranch ?? 'main';
    const raw = await runSafe('git', ['log', `${base}..HEAD`, '--format=%H|%s|%aI'], cwd);
    if (!raw)
        return [];
    return raw
        .split('\n')
        .filter(Boolean)
        .map(line => {
        const [hash, subject, date] = line.split('|');
        return { hash: hash ?? '', subject: subject ?? '', date: date ?? '' };
    });
}
async function getPR(branch, cwd) {
    const raw = await runSafe('gh', [
        'pr', 'list',
        `--head=${branch}`,
        '--state', 'all',
        '--json', 'number,url,title,state',
        '--jq', 'sort_by(.state == "OPEN" | not) | .[0]',
    ], cwd);
    if (!raw || raw === 'null')
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
async function checkGhAvailable() {
    const result = await runSafe('gh', ['auth', 'status']);
    return result !== null;
}
async function postPRComment(prNumber, body, cwd) {
    await run('gh', ['pr', 'comment', String(prNumber), '--body', body], cwd);
}
// ─── Session matching ─────────────────────────────────────────────────────────
function windowAroundCommit(isoDate) {
    const ms = new Date(isoDate).getTime();
    const HOUR = 60 * 60 * 1000;
    return {
        from: new Date(ms - HOUR).toISOString(),
        to: new Date(ms + HOUR).toISOString(),
    };
}
/**
 * Match sessions to a branch using exact git activity data where available.
 * Falls back to the timestamp heuristic for sessions without extracted git data.
 */
function matchSessionsToBranch(branch, commits, projectPath) {
    // Primary: use sessions that actually checked out / committed / pushed to this branch
    const exactIds = getSessionsByBranch(branch);
    if (exactIds.length > 0) {
        return exactIds;
    }
    // Fallback: timestamp window around each commit (legacy behaviour for old sessions)
    const sessionIds = new Set();
    for (const commit of commits) {
        const { from, to } = windowAroundCommit(commit.date);
        const sessions = getSessionsByTimeRange(from, to, projectPath);
        for (const s of sessions) {
            sessionIds.add(s.id);
        }
    }
    // Opportunistically extract and store git activity from these sessions
    // so future calls can use the exact path.
    for (const sessionId of sessionIds) {
        const messages = getMessagesBySession(sessionId, 10000, 0);
        extractAndStoreGitActivity(messages, sessionId);
    }
    return [...sessionIds];
}
// ─── Decision gathering ───────────────────────────────────────────────────────
function gatherDecisions(sessionIds) {
    // First try plugin/daemon-captured decisions
    const existing = getDecisionsBySessions(sessionIds);
    if (existing.length > 0)
        return existing;
    // Fall back to heuristic detection from messages
    const heuristic = [];
    for (const sid of sessionIds) {
        const messages = getMessagesBySession(sid, 10000, 0);
        const detected = detectDecisions(messages, sid);
        // Persist detected decisions so they're available in future queries
        for (const d of detected) {
            insertDecision(d);
        }
        heuristic.push(...detected);
    }
    return heuristic;
}
function getSignal(d) {
    return d.signal ?? 'low';
}
function formatDecisionLine(d) {
    const row = d;
    const depth = row.depth ?? '';
    const meta = depth ? ` [${depth}]` : '';
    return `- ${d.context.slice(0, 120)}${meta}`;
}
function buildProgressBar(score, width = 20) {
    const filled = Math.round((score / 100) * width);
    const empty = width - filled;
    const block = score >= 70 ? '🟩' : score >= 40 ? '🟨' : '🟥';
    return block.repeat(filled) + '⬜'.repeat(empty);
}
/** Truncate reasoning to fit in a table cell */
function truncReasoning(reasoning, max = 60) {
    if (!reasoning)
        return '';
    const firstSentence = reasoning.split(/\.\s/)[0];
    const text = firstSentence.length <= max ? firstSentence : firstSentence.slice(0, max - 1) + '…';
    return text.replace(/\|/g, '/');
}
function buildMarkdown(opts) {
    const { compositeScore, dqs, sessionCount, decisions, commits, breakdown, dimensionScores, userMessages, assistantMessages, evalCount } = opts;
    const dqsDisplay = dqs !== null ? `${dqs}/100` : 'N/A';
    // ── Hero: Composite Score ──────────────────────────────────────────────
    const lines = [
        '## PromptUP Report',
        '',
    ];
    if (compositeScore !== null) {
        const heroBar = buildProgressBar(compositeScore, 20);
        const classification = compositeScore <= 40 ? 'Junior' : compositeScore <= 70 ? 'Middle' : 'Senior';
        lines.push(`### Composite Score: ${compositeScore}/100 — **${classification}**`, '', heroBar, '');
        // 3-column dimension table: Dimension | Score + Bar | Why
        if (dimensionScores && dimensionScores.length > 0) {
            lines.push('| Dimension | Score | Why |', '|-----------|-------|-----|');
            for (const d of dimensionScores) {
                const label = d.key.replace(/_/g, ' ');
                const dimBar = buildProgressBar(d.score, 8);
                const why = truncReasoning(d.reasoning);
                lines.push(`| ${label} | ${dimBar} ${d.score} | ${why} |`);
            }
            lines.push('');
        }
        if (evalCount && evalCount > 1) {
            lines.push(`*Score averaged across ${evalCount} evaluations*`, '');
        }
    }
    // ── Stats line ─────────────────────────────────────────────────────────
    const statParts = [];
    if (userMessages !== undefined)
        statParts.push(`Developer prompts: **${userMessages}**`);
    if (assistantMessages !== undefined)
        statParts.push(`Claude responses: **${assistantMessages}**`);
    statParts.push(`Sessions: ${sessionCount}`);
    statParts.push(`DQS: ${dqsDisplay}`);
    statParts.push(`Decisions: ${decisions.length}`);
    lines.push(statParts.join(' | '), '');
    // ── Decisions ──────────────────────────────────────────────────────────
    const highSignal = decisions.filter(d => getSignal(d) === 'high');
    const mediumSignal = decisions.filter(d => getSignal(d) === 'medium');
    const lowSignal = decisions.filter(d => getSignal(d) === 'low');
    const TYPE_ICONS = {
        steer: '🔀', reject: '🚫', validate: '✅',
        modify: '✏️', scope: '📐', accept: '👍',
    };
    if (highSignal.length > 0 || mediumSignal.length > 0) {
        lines.push('### Decisions', '');
        // Show high-signal decisions prominently
        for (const d of highSignal) {
            const icon = TYPE_ICONS[d.type] ?? '•';
            lines.push(`${icon} **${d.context.slice(0, 120)}**`);
        }
        // Show medium-signal decisions normally
        for (const d of mediumSignal) {
            const icon = TYPE_ICONS[d.type] ?? '•';
            lines.push(`${icon} ${d.context.slice(0, 120)}`);
        }
        if (lowSignal.length > 0) {
            lines.push('', `*+ ${lowSignal.length} routine decision${lowSignal.length > 1 ? 's' : ''} not shown*`);
        }
        lines.push('');
    }
    else if (decisions.length > 0) {
        lines.push(`### Decisions`, '', `*${decisions.length} routine decisions (no high-signal choices detected)*`, '');
    }
    else {
        lines.push('### Decisions', '', '*No decisions captured. Run /eval first to extract decisions from the session.*', '');
    }
    // Commits block
    const commitLines = commits
        .map(c => `- \`${c.hash.slice(0, 7)}\` ${c.subject}`)
        .join('\n');
    lines.push('', `<details><summary>Commits (${commits.length})</summary>`, '', commitLines || '_No commits found._', '', '</details>', '', '---', '*Generated by [PromptUP](https://github.com/alex-muradov/ClawWork)*');
    return lines.join('\n');
}
// ─── Main export ──────────────────────────────────────────────────────────────
export async function generatePRReport(options) {
    const { post = false, projectPath } = options;
    // 1. Resolve branch
    const branch = options.branch ?? (await getCurrentBranch(projectPath));
    // 2. Check cache
    // We need the repo for the cache key — get it first
    const ghAvailable = await checkGhAvailable();
    const repo = ghAvailable ? await getRepo(projectPath) : '';
    const cached = getPRReportByBranch(branch, repo);
    if (cached) {
        return { report: cached, isNew: false };
    }
    // 3. Get PR info
    let prInfo = null;
    if (ghAvailable) {
        prInfo = await getPR(branch, projectPath);
    }
    // 4. Get commits (base branch from PR via gh, or fallback detection)
    const baseBranch = await detectBaseBranch(branch, projectPath);
    const commits = await getCommits(projectPath, baseBranch);
    // 5. Match sessions — prefer exact git activity data, fall back to timestamps
    let sessionIds = matchSessionsToBranch(branch, commits, projectPath);
    // 5b. If no sessions matched (plugin not installed yet, no hooks), find the latest transcript
    if (sessionIds.length === 0) {
        const { findLatestTranscript } = await import('./transcript-parser.js');
        const latestTranscript = findLatestTranscript();
        if (latestTranscript) {
            const msgs = parseTranscript(latestTranscript);
            if (msgs.length >= 3) {
                const sid = ulid();
                const now = new Date().toISOString();
                const { insertSession } = await import('./db.js');
                insertSession({
                    id: sid,
                    project_path: projectPath ?? process.cwd(),
                    transcript_path: latestTranscript,
                    status: 'completed',
                    message_count: msgs.length,
                    started_at: msgs[0].created_at,
                    ended_at: msgs[msgs.length - 1].created_at,
                    created_at: now,
                });
                for (const m of msgs)
                    m.session_id = sid;
                insertMessages(msgs);
                sessionIds = [sid];
            }
        }
    }
    // 6. Gather decisions
    const decisions = gatherDecisions(sessionIds);
    // 7. Compute DQS — use validate decisions as proxy for validation rate
    const validateCount = decisions.filter(d => d.type === 'validate').length;
    const validationRate = decisions.length > 0 ? validateCount / decisions.length : 0;
    const dqs = computeDQS(decisions, validationRate);
    // 8. Build decision breakdown
    const breakdown = {};
    for (const d of decisions) {
        const t = d.type;
        breakdown[t] = (breakdown[t] ?? 0) + 1;
    }
    // 9. Auto-eval sessions that haven't been evaluated yet
    //    This makes /pr-report self-contained — no need to run /eval first
    for (const sid of sessionIds) {
        const existingEval = getLatestEvaluation(sid);
        if (!existingEval) {
            // Try to find and parse the transcript for this session
            const session = getSession(sid);
            if (session?.transcript_path) {
                try {
                    const msgs = parseTranscript(session.transcript_path);
                    if (msgs.length >= 3) {
                        // Store messages if not already stored
                        for (const m of msgs)
                            m.session_id = sid;
                        insertMessages(msgs);
                        // Run eval (extracts decisions + scores in one shot)
                        console.log(`[pr-report] Auto-evaluating session ${sid.slice(0, 8)}...`);
                        await evaluateSession(sid, msgs, 'manual');
                    }
                }
                catch (err) {
                    console.log(`[pr-report] Could not auto-eval session ${sid.slice(0, 8)}: ${err}`);
                }
            }
        }
    }
    // 10. Fetch evaluations (averaged across all evals) + message counts
    let compositeScore = null;
    let dimensionScores;
    let userMessages = 0;
    let assistantMessages = 0;
    // Collect reasoning from the most recent eval (reasoning doesn't average)
    let latestReasoning = {};
    const allEvals = [];
    for (const sid of sessionIds) {
        const evals = getEvaluationsBySession(sid);
        for (const evalRow of evals) {
            try {
                const dims = JSON.parse(evalRow.dimension_scores).map((d) => ({ key: d.key, score: d.score }));
                allEvals.push({ composite: evalRow.composite_score, dims });
                // Capture reasoning from latest eval (last one wins)
                const fullDims = JSON.parse(evalRow.dimension_scores);
                for (const d of fullDims) {
                    if (d.reasoning)
                        latestReasoning[d.key] = d.reasoning;
                }
            }
            catch { /* skip malformed */ }
        }
        // Message counts by role
        const messages = getMessagesBySession(sid, 10000, 0);
        userMessages += messages.filter(m => m.role === 'user').length;
        assistantMessages += messages.filter(m => m.role === 'assistant').length;
    }
    // Average across all evaluations to reduce variance
    if (allEvals.length > 0) {
        compositeScore = Math.round(allEvals.reduce((sum, e) => sum + e.composite, 0) / allEvals.length);
        // Average each dimension across evals
        const dimSums = {};
        for (const e of allEvals) {
            for (const d of e.dims) {
                if (!dimSums[d.key])
                    dimSums[d.key] = { total: 0, count: 0 };
                dimSums[d.key].total += d.score;
                dimSums[d.key].count += 1;
            }
        }
        dimensionScores = Object.entries(dimSums).map(([key, v]) => ({
            key,
            reasoning: latestReasoning[key],
            score: Math.round(v.total / v.count),
        }));
    }
    // 11. Generate markdown
    const markdown = buildMarkdown({
        compositeScore,
        dqs,
        sessionCount: sessionIds.length,
        decisions,
        commits,
        breakdown,
        dimensionScores,
        userMessages: userMessages || undefined,
        assistantMessages: assistantMessages || undefined,
        evalCount: allEvals.length > 1 ? allEvals.length : undefined,
    });
    // 10. Build report row
    const now = new Date().toISOString();
    const report = {
        id: ulid(),
        branch,
        repo,
        pr_number: prInfo?.number ?? null,
        pr_url: prInfo?.url ?? null,
        commits: JSON.stringify(commits),
        session_ids: JSON.stringify(sessionIds),
        total_decisions: decisions.length,
        decision_breakdown: JSON.stringify(breakdown),
        dqs,
        markdown,
        posted_at: null,
        created_at: now,
    };
    // 11. Persist
    insertPRReport(report);
    // 12. Optionally post as PR comment
    if (post && prInfo && ghAvailable) {
        await postPRComment(prInfo.number, markdown, projectPath);
        report.posted_at = new Date().toISOString();
    }
    return { report, isNew: true };
}
