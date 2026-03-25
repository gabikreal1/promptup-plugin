/**
 * Decision Detector
 *
 * Scans sorted message pairs (assistant → user) to detect developer decisions
 * using the heuristic classifier. Each detected decision is tagged with depth,
 * opinionation, signal level, and the AI action that prompted it.
 *
 * STANDALONE port — no imports from @promptup/shared or workspace packages.
 */
import { ulid } from 'ulid';
import { classifyDecision } from './shared/decision-classifier.js';
export function detectDecisions(messages, sessionId) {
    const decisions = [];
    const sorted = [...messages].sort((a, b) => a.sequence_number - b.sequence_number);
    let prevAssistant = null;
    for (const msg of sorted) {
        if (msg.role === 'assistant') {
            prevAssistant = msg;
            continue;
        }
        if (msg.role !== 'user')
            continue;
        const toolUses = prevAssistant?.tool_uses
            ? JSON.parse(prevAssistant.tool_uses)
            : null;
        const result = classifyDecision(msg.content, prevAssistant?.content ?? null, toolUses);
        if (result) {
            decisions.push({
                id: ulid(),
                session_id: sessionId,
                type: result.type,
                message_index: msg.sequence_number,
                context: result.context,
                files_affected: JSON.stringify(result.filesAffected),
                source: 'plugin',
                matched_rule: result.matchedRule,
                depth: result.depth,
                opinionation: result.opinionation,
                ai_action: result.aiAction,
                signal: result.signal,
                created_at: msg.created_at,
            });
        }
        prevAssistant = null;
    }
    return decisions;
}
