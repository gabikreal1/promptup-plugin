/**
 * Evaluation engine for the standalone PromptUp plugin.
 *
 * Primary: spawns `claude -p` to get real LLM analysis of the session.
 * Fallback: heuristic pattern matching if Claude Code is unavailable.
 *
 * STANDALONE copy — no imports from @promptup/shared or session-watcher.
 */
import type { EvalTriggerType, EvaluationRow, MessageRow, WeightProfileKey } from './shared/types.js';
export declare function evaluateSession(sessionId: string, messages: MessageRow[], triggerType: EvalTriggerType, weightProfile?: WeightProfileKey): Promise<EvaluationRow | null>;
