/**
 * Heuristic decision classifier for PromptUp.
 *
 * Classifies a user message (in context of the previous assistant turn and
 * tool uses) into one of six decision types using ordered pattern rules.
 * First matching rule wins.
 *
 * STANDALONE copy — no imports from @promptup/shared.
 */
import type { DecisionType, DecisionDepth, DecisionOpinionation, DecisionSignal } from './types.js';
export type { DecisionType, DecisionSignal };
export interface ClassifiedDecision {
    type: DecisionType;
    /** Combined AI->Dev summary (<=120 chars). */
    context: string;
    /** What Claude did/proposed (<=80 chars). */
    aiAction: string;
    /** What the developer decided (<=80 chars). */
    devReaction: string;
    /** Identifier of the rule that matched. */
    matchedRule: string;
    /** File paths extracted from Edit/Write tool uses. */
    filesAffected: string[];
    depth: DecisionDepth;
    opinionation: DecisionOpinionation;
    /** Signal level — high/medium/low for filtering. */
    signal: DecisionSignal;
}
type ToolUse = {
    name: string;
    input: Record<string, unknown>;
};
/**
 * Extract a concise description of what the AI did from the previous assistant
 * message and its tool uses (<=80 chars).
 */
export declare function extractAiAction(prevAssistantMessage: string | null, prevToolUses: ToolUse[] | null): string;
/**
 * Classify signal level: high/medium/low.
 * - high: architectural depth, OR high opinionation, OR reject, OR steer+tactical+
 * - medium: tactical+medium-opinionation, OR validate, OR scope
 * - low: surface depth, OR low-opinionation accept, OR trivial
 */
export declare function classifySignal(type: DecisionType, depth: DecisionDepth, opinionation: DecisionOpinionation, devReaction: string): DecisionSignal;
export declare function classifyDepth(msg: string): DecisionDepth;
export declare function classifyOpinionation(msg: string): DecisionOpinionation;
/**
 * Convert a raw user message into a clean decision summary (<=80 chars).
 * Not a quote — a reworded description of what the decision was.
 */
export declare function summarizeContext(userMessage: string, type: DecisionType): string;
/**
 * Classify a user message into a decision type using heuristic rules.
 *
 * @param userMessage        The incoming user message to classify.
 * @param prevAssistantMessage  The preceding assistant message (or null).
 * @param prevToolUses       Tool uses from the preceding assistant turn (or null).
 * @returns ClassifiedDecision if a rule matched, otherwise null.
 */
export declare function classifyDecision(userMessage: string, prevAssistantMessage: string | null, prevToolUses: ToolUse[] | null): ClassifiedDecision | null;
