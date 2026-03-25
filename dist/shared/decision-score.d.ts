/**
 * Decision Quality Score (DQS) computation for PromptUp.
 *
 * STANDALONE copy — no imports from @promptup/shared.
 */
import type { DecisionRow } from './types.js';
export declare function computeDQS(decisions: DecisionRow[], validationRate: number): number | null;
