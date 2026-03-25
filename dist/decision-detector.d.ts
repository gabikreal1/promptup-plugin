/**
 * Decision Detector
 *
 * Scans sorted message pairs (assistant → user) to detect developer decisions
 * using the heuristic classifier. Each detected decision is tagged with depth,
 * opinionation, signal level, and the AI action that prompted it.
 *
 * STANDALONE port — no imports from @promptup/shared or workspace packages.
 */
import type { MessageRow, DecisionRow } from './shared/types.js';
export declare function detectDecisions(messages: MessageRow[], sessionId: string): DecisionRow[];
