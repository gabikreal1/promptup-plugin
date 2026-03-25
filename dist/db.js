/**
 * SQLite database layer for the standalone PromptUp plugin.
 *
 * Fully self-contained — no imports from @promptup/shared or any workspace package.
 * Database lives at ${CLAUDE_PLUGIN_DATA}/promptup.db or ~/.promptup/promptup.db.
 * WAL mode enabled for concurrent reads.
 */
import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
// ─── Database Path ───────────────────────────────────────────────────────────
function resolveDbPath() {
    const envDir = process.env.CLAUDE_PLUGIN_DATA;
    const baseDir = envDir ?? join(homedir(), '.promptup');
    return join(baseDir, 'promptup.db');
}
// ─── Singleton ───────────────────────────────────────────────────────────────
let db = null;
export function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}
// ─── Initialization ──────────────────────────────────────────────────────────
export function initDatabase() {
    if (db)
        return;
    const dbPath = resolveDbPath();
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const instance = new Database(dbPath);
    instance.pragma('journal_mode = WAL');
    instance.pragma('foreign_keys = ON');
    instance.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_path TEXT,
      transcript_path TEXT,
      status TEXT DEFAULT 'active',
      message_count INTEGER DEFAULT 0,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      report_type TEXT DEFAULT 'checkpoint',
      composite_score REAL NOT NULL,
      dimension_scores TEXT NOT NULL,
      recommendations TEXT,
      trends TEXT,
      risk_flags TEXT,
      raw_evaluation TEXT,
      message_count INTEGER DEFAULT 0,
      message_range_from INTEGER DEFAULT 0,
      message_range_to INTEGER DEFAULT 0,
      weight_profile TEXT DEFAULT 'balanced',
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      message_index INTEGER NOT NULL,
      context TEXT NOT NULL,
      files_affected TEXT DEFAULT '[]',
      source TEXT NOT NULL,
      matched_rule TEXT,
      depth TEXT,
      opinionation TEXT,
      ai_action TEXT,
      signal TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tool_uses TEXT,
      sequence_number INTEGER NOT NULL DEFAULT 0,
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      model TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      UNIQUE(session_id, sequence_number)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, sequence_number);

    CREATE TABLE IF NOT EXISTS git_activities (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      branch TEXT,
      commit_hash TEXT,
      commit_message TEXT,
      remote TEXT,
      raw_command TEXT NOT NULL,
      message_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_git_activities_branch ON git_activities(branch);

    CREATE TABLE IF NOT EXISTS pr_reports (
      id TEXT PRIMARY KEY,
      branch TEXT NOT NULL,
      repo TEXT NOT NULL,
      pr_number INTEGER,
      pr_url TEXT,
      commits TEXT DEFAULT '[]',
      session_ids TEXT DEFAULT '[]',
      total_decisions INTEGER DEFAULT 0,
      decision_breakdown TEXT DEFAULT '{}',
      dqs REAL,
      markdown TEXT NOT NULL,
      posted_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pr_reports_branch ON pr_reports(branch, repo);
  `);
    db = instance;
}
export function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}
// ─── Sessions ────────────────────────────────────────────────────────────────
export function insertSession(session) {
    const d = getDb();
    d.prepare(`
    INSERT OR IGNORE INTO sessions (id, project_path, transcript_path, status,
      message_count, started_at, ended_at, created_at)
    VALUES (@id, @project_path, @transcript_path, @status,
      @message_count, @started_at, @ended_at, @created_at)
  `).run(session);
}
export function getSession(id) {
    const row = getDb()
        .prepare('SELECT * FROM sessions WHERE id = ?')
        .get(id);
    return row ?? null;
}
export function updateSession(id, updates) {
    const fields = Object.keys(updates).filter((k) => k !== 'id');
    if (fields.length === 0)
        return;
    const setClauses = fields.map((f) => `${f} = @${f}`).join(', ');
    getDb()
        .prepare(`UPDATE sessions SET ${setClauses} WHERE id = @id`)
        .run({ id, ...updates });
}
export function getRecentSessions(limit = 20) {
    return getDb()
        .prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?')
        .all(limit);
}
// ─── Messages ───────────────────────────────────────────────────────────
export function insertMessages(messages) {
    const d = getDb();
    const stmt = d.prepare(`
    INSERT OR IGNORE INTO messages (id, session_id, role, content, tool_uses,
      sequence_number, tokens_in, tokens_out, model, created_at)
    VALUES (@id, @session_id, @role, @content, @tool_uses,
      @sequence_number, @tokens_in, @tokens_out, @model, @created_at)
  `);
    const tx = d.transaction(() => {
        for (const m of messages) {
            stmt.run({
                ...m,
                tool_uses: m.tool_uses ?? null,
                model: m.model ?? null,
            });
        }
    });
    tx();
}
export function getMessagesBySession(sessionId, limit = 10000, offset = 0) {
    return getDb()
        .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY sequence_number ASC LIMIT ? OFFSET ?')
        .all(sessionId, limit, offset);
}
// ─── Evaluations ─────────────────────────────────────────────────────────────
export function insertEvaluation(evaluation) {
    getDb().prepare(`
    INSERT INTO evaluations (id, session_id, trigger_type, report_type,
      composite_score, dimension_scores, recommendations, trends, risk_flags,
      raw_evaluation, message_count, message_range_from, message_range_to,
      weight_profile, created_at)
    VALUES (@id, @session_id, @trigger_type, @report_type,
      @composite_score, @dimension_scores, @recommendations, @trends, @risk_flags,
      @raw_evaluation, @message_count, @message_range_from, @message_range_to,
      @weight_profile, @created_at)
  `).run(evaluation);
}
export function getLatestEvaluation(sessionId) {
    const d = getDb();
    let row;
    if (sessionId) {
        row = d
            .prepare('SELECT * FROM evaluations WHERE session_id = ? ORDER BY created_at DESC LIMIT 1')
            .get(sessionId);
    }
    else {
        row = d
            .prepare('SELECT * FROM evaluations ORDER BY created_at DESC LIMIT 1')
            .get();
    }
    return row ?? null;
}
export function getEvaluationsBySession(sessionId) {
    return getDb()
        .prepare('SELECT * FROM evaluations WHERE session_id = ? ORDER BY created_at ASC')
        .all(sessionId);
}
export function getRecentEvaluations(limit = 20) {
    return getDb()
        .prepare('SELECT * FROM evaluations ORDER BY created_at DESC LIMIT ?')
        .all(limit);
}
// ─── Decisions ───────────────────────────────────────────────────────────────
export function insertDecision(decision) {
    getDb().prepare(`
    INSERT OR IGNORE INTO decisions (id, session_id, type, message_index, context,
      files_affected, source, matched_rule, depth, opinionation, ai_action, signal, created_at)
    VALUES (@id, @session_id, @type, @message_index, @context,
      @files_affected, @source, @matched_rule, @depth, @opinionation,
      @ai_action, @signal, @created_at)
  `).run({
        ...decision,
        depth: decision.depth ?? null,
        opinionation: decision.opinionation ?? null,
        ai_action: decision.ai_action ?? null,
        signal: decision.signal ?? null,
        matched_rule: decision.matched_rule ?? null,
    });
}
export function getDecisionsBySession(sessionId) {
    return getDb()
        .prepare('SELECT * FROM decisions WHERE session_id = ? ORDER BY message_index')
        .all(sessionId);
}
export function getDecisionsBySessions(sessionIds) {
    if (sessionIds.length === 0)
        return [];
    const d = getDb();
    const placeholders = sessionIds.map(() => '?').join(',');
    return d
        .prepare(`SELECT * FROM decisions WHERE session_id IN (${placeholders}) ORDER BY created_at`)
        .all(...sessionIds);
}
// ─── Git Activities ──────────────────────────────────────────────────────────
export function insertGitActivity(activity) {
    getDb().prepare(`
    INSERT OR IGNORE INTO git_activities (id, session_id, type, branch, commit_hash,
      commit_message, remote, raw_command, message_index, created_at)
    VALUES (@id, @session_id, @type, @branch, @commit_hash,
      @commit_message, @remote, @raw_command, @message_index, @created_at)
  `).run({
        ...activity,
        branch: activity.branch ?? null,
        commit_hash: activity.commit_hash ?? null,
        commit_message: activity.commit_message ?? null,
        remote: activity.remote ?? null,
    });
}
export function getSessionsByBranch(branch) {
    const rows = getDb()
        .prepare('SELECT DISTINCT session_id FROM git_activities WHERE branch = ? ORDER BY created_at')
        .all(branch);
    return rows.map((r) => r.session_id);
}
// ─── Session matching ────────────────────────────────────────────────────────
export function getSessionsByTimeRange(from, to, projectPath) {
    const d = getDb();
    if (projectPath) {
        return d
            .prepare('SELECT * FROM sessions WHERE started_at <= ? AND (ended_at >= ? OR ended_at IS NULL) AND project_path LIKE ?')
            .all(to, from, `%${projectPath}%`);
    }
    return d
        .prepare('SELECT * FROM sessions WHERE started_at <= ? AND (ended_at >= ? OR ended_at IS NULL)')
        .all(to, from);
}
// ─── PR Reports ──────────────────────────────────────────────────────────────
export function insertPRReport(report) {
    getDb().prepare(`
    INSERT INTO pr_reports (id, branch, repo, pr_number, pr_url, commits, session_ids,
      total_decisions, decision_breakdown, dqs, markdown, posted_at, created_at)
    VALUES (@id, @branch, @repo, @pr_number, @pr_url, @commits, @session_ids,
      @total_decisions, @decision_breakdown, @dqs, @markdown, @posted_at, @created_at)
  `).run({
        ...report,
        pr_number: report.pr_number ?? null,
        pr_url: report.pr_url ?? null,
        dqs: report.dqs ?? null,
        posted_at: report.posted_at ?? null,
    });
}
export function getPRReportByBranch(branch, repo) {
    const row = getDb()
        .prepare('SELECT * FROM pr_reports WHERE branch = ? AND repo = ? ORDER BY created_at DESC LIMIT 1')
        .get(branch, repo);
    return row ?? null;
}
// ─── Stats ───────────────────────────────────────────────────────────────────
export function getStats() {
    const d = getDb();
    const sessions = d.prepare('SELECT COUNT(*) as c FROM sessions').get().c;
    const evaluations = d.prepare('SELECT COUNT(*) as c FROM evaluations').get().c;
    const decisions = d.prepare('SELECT COUNT(*) as c FROM decisions').get().c;
    return { sessions, evaluations, decisions };
}
