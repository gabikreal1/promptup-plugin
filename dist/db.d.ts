/**
 * SQLite database layer for the standalone PromptUp plugin.
 *
 * Fully self-contained — no imports from @promptup/shared or any workspace package.
 * Database lives at ${CLAUDE_PLUGIN_DATA}/promptup.db or ~/.promptup/promptup.db.
 * WAL mode enabled for concurrent reads.
 */
import Database from 'better-sqlite3';
import type { SessionRow, EvaluationRow, DecisionRow, GitActivityRow, PRReportRow, MessageRow } from './shared/types.js';
export declare function getDb(): Database.Database;
export declare function initDatabase(): void;
export declare function closeDatabase(): void;
export declare function insertSession(session: SessionRow): void;
export declare function getSession(id: string): SessionRow | null;
export declare function updateSession(id: string, updates: Partial<SessionRow>): void;
export declare function getRecentSessions(limit?: number): SessionRow[];
export declare function insertMessages(messages: MessageRow[]): void;
export declare function getMessagesBySession(sessionId: string, limit?: number, offset?: number): MessageRow[];
export declare function insertEvaluation(evaluation: EvaluationRow): void;
export declare function getLatestEvaluation(sessionId?: string): EvaluationRow | null;
export declare function getEvaluationsBySession(sessionId: string): EvaluationRow[];
export declare function getRecentEvaluations(limit?: number): EvaluationRow[];
export declare function insertDecision(decision: DecisionRow): void;
export declare function getDecisionsBySession(sessionId: string): DecisionRow[];
export declare function getDecisionsBySessions(sessionIds: string[]): DecisionRow[];
export declare function insertGitActivity(activity: GitActivityRow): void;
export declare function getSessionsByBranch(branch: string): string[];
export declare function getSessionsByTimeRange(from: string, to: string, projectPath?: string): SessionRow[];
export declare function insertPRReport(report: PRReportRow): void;
export declare function getPRReportByBranch(branch: string, repo: string): PRReportRow | null;
export declare function getStats(): {
    sessions: number;
    evaluations: number;
    decisions: number;
};
