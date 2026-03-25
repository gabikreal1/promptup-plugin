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
import type { PRReportRow } from './shared/types.js';
export interface GeneratedPRReport {
    report: PRReportRow;
    isNew: boolean;
}
export declare function generatePRReport(options: {
    branch?: string;
    post?: boolean;
    projectPath?: string;
}): Promise<GeneratedPRReport>;
