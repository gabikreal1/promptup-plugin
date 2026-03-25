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

type ToolUse = { name: string; input: Record<string, unknown> };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lower(s: string): string {
  return s.toLowerCase();
}

function extractFiles(toolUses: ToolUse[] | null): string[] {
  if (!toolUses) return [];
  const files: string[] = [];
  for (const tu of toolUses) {
    if ((tu.name === 'Edit' || tu.name === 'Write') && typeof tu.input.file_path === 'string') {
      files.push(tu.input.file_path);
    }
  }
  return files;
}

function hadToolUse(toolUses: ToolUse[] | null): boolean {
  return toolUses !== null && toolUses.length > 0;
}

/** Extract a short basename from a file path. */
function basename(filePath: string): string {
  return filePath.split('/').pop() ?? filePath;
}

/**
 * Extract a concise description of what the AI did from the previous assistant
 * message and its tool uses (<=80 chars).
 */
export function extractAiAction(
  prevAssistantMessage: string | null,
  prevToolUses: ToolUse[] | null,
): string {
  const editWriteTools = prevToolUses?.filter(tu => tu.name === 'Edit' || tu.name === 'Write') ?? [];
  const bashGitTools = prevToolUses?.filter(
    tu => tu.name === 'Bash' && typeof tu.input.command === 'string' && /\bgit\b/.test(tu.input.command as string)
  ) ?? [];

  if (editWriteTools.length === 1) {
    const tu = editWriteTools[0];
    const filePath = typeof tu.input.file_path === 'string' ? tu.input.file_path : '';
    const verb = tu.name === 'Write' ? 'Created' : 'Edited';
    return `${verb} ${basename(filePath)}`.slice(0, 80);
  }

  if (editWriteTools.length > 1) {
    const names = editWriteTools.map(tu =>
      typeof tu.input.file_path === 'string' ? basename(tu.input.file_path) : '?'
    );
    return `Modified ${editWriteTools.length} files: ${names.join(', ')}`.slice(0, 80);
  }

  if (bashGitTools.length > 0) {
    const cmd = bashGitTools[0].input.command as string;
    const gitMatch = cmd.match(/git\s+(\w+)/);
    const subCmd = gitMatch?.[1] ?? 'command';
    return `Ran git ${subCmd}`.slice(0, 80);
  }

  // Fallback to first sentence of assistant message
  if (prevAssistantMessage) {
    const stripped = prevAssistantMessage.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const first = stripped.split(/[.!?]/)[0]?.trim() ?? '';
    if (first.length >= 5) {
      return first.slice(0, 80);
    }
  }

  return 'Proposed approach';
}

/**
 * Classify signal level: high/medium/low.
 * - high: architectural depth, OR high opinionation, OR reject, OR steer+tactical+
 * - medium: tactical+medium-opinionation, OR validate, OR scope
 * - low: surface depth, OR low-opinionation accept, OR trivial
 */
export function classifySignal(
  type: DecisionType,
  depth: DecisionDepth,
  opinionation: DecisionOpinionation,
  devReaction: string,
): DecisionSignal {
  const trivial = /^(looks?\s+good|lgtm|yes|ok|okay|perfect|great|awesome|nice|approved?|sounds?\s+good)\.?$/i.test(devReaction.trim());

  // Trivial responses are always low
  if (trivial) return 'low';

  // Reject is always high (developer overriding AI)
  if (type === 'reject') return 'high';

  // Architectural depth -> high
  if (depth === 'architectural') return 'high';

  // High opinionation -> high
  if (opinionation === 'high') return 'high';

  // Steer with tactical or deeper -> high
  if (type === 'steer' && depth !== 'surface') return 'high';

  // Validate, scope -> medium (even if surface/low — these types are inherently meaningful)
  if (type === 'validate' || type === 'scope') return 'medium';

  // Surface depth with low opinionation -> low
  if (depth === 'surface' && opinionation === 'low') return 'low';

  // Tactical + medium opinionation -> medium
  if (depth === 'tactical' && opinionation === 'medium') return 'medium';

  // Accepts with low opinionation -> low
  if (type === 'accept' && opinionation === 'low') return 'low';

  // Modify -> medium
  if (type === 'modify') return 'medium';

  // Default
  return 'medium';
}

/**
 * Build the combined AI->Dev context string (<=120 chars).
 */
function buildContext(
  type: DecisionType,
  aiAction: string,
  devReaction: string,
): string {
  let ctx: string;

  switch (type) {
    case 'steer':
      ctx = `AI ${aiAction} → Dev redirected: ${devReaction}`;
      break;
    case 'reject':
      ctx = `AI ${aiAction} → Dev rejected: ${devReaction}`;
      break;
    case 'validate':
      ctx = `After ${aiAction} → Dev verified: ${devReaction}`;
      break;
    case 'accept':
      ctx = `AI ${aiAction} → Approved`;
      break;
    case 'modify':
      ctx = `AI ${aiAction} → Dev modified: ${devReaction}`;
      break;
    case 'scope':
      ctx = `Dev ${devReaction}`;
      break;
    default:
      ctx = `AI ${aiAction} → ${devReaction}`;
  }

  if (ctx.length <= 120) return ctx;
  return ctx.slice(0, 117) + '...';
}

// ─── Rule Patterns ───────────────────────────────────────────────────────────

// Rule 1: steer — negation + alternative in the same message
const STEER_NEGATION = /\b(no|don'?t|do not|never|not)\b/i;
const STEER_ALTERNATIVE =
  /\b(instead|use\s+\w+|switch\s+to|let'?s\s+(?:use|do|try)|actually\s+(?:let'?s|use|do))\b/i;

// Rule 2: reject — negation without alternative, only when previous had tool use
const REJECT_PATTERNS =
  /\b(won'?t\s+work|that'?s\s+wrong|this\s+is\s+wrong|try\s+again|doesn'?t\s+work|not\s+right|incorrect|wrong|broken|failing|fails|this\s+is\s+broken|doesn'?t\s+make\s+sense)\b/i;

// Rule 3: modify — explicit change/update requests with a target
const MODIFY_PATTERNS =
  /\b(change\s+\S+|update\s+the\s+\w+|add\s+(?:error\s+handling|logging|validation|retry)\s+to)\b/i;

// Rule 4: validate — verification / test requests
const VALIDATE_PATTERNS =
  /\b(run\s+the\s+tests?|check\s+if|does\s+this\s+handle|what\s+happens\s+when|verify|make\s+sure\s+(?:it|this)|assert|confirm\s+that)\b/i;

// Rule 5: scope remove
const SCOPE_REMOVE_PATTERNS =
  /\b(skip|drop|don'?t\s+need|leave\s+out|remove|cut|omit|for\s+now\s+skip|skip\s+(?:the\s+)?\w+\s+for\s+now)\b/i;

// Rule 6: scope add
const SCOPE_ADD_PATTERNS =
  /\b(also\s+add|additionally\s+include|additionally\s+add|we\s+still\s+need|also\s+include|also\s+(?:make|create|implement|set\s+up))\b/i;

// Rule 7: accept explicit affirmatives
const ACCEPT_EXPLICIT_PATTERNS =
  /\b(looks?\s+good|lgtm|yes|do\s+it|perfect|great|awesome|nice|ship\s+it|proceed|go\s+ahead|sounds?\s+good|ok(?:ay)?|approved?|that'?s\s+(?:good|right|correct|great|perfect))\b/i;

// ─── Depth Heuristics ─────────────────────────────────────────────────────────

const SURFACE_SIMPLE_WORDS = /^(yes|no|ok|okay|sure|fine|yep|nope|lgtm|great|perfect|awesome|nice|cool|thanks|good)\.?$/i;
const SURFACE_NAMING_FORMATTING = /\b(rename|naming|camelCase|snake_case|formatting|indent|whitespace|typo|spelling|capitalize)\b/i;

const TACTICAL_KEYWORDS =
  /\b(bcrypt|argon2|redis|postgres|sqlite|jwt|oauth|middleware|express|fastify|prisma|drizzle|zod|vitest|jest|playwright|webpack|vite|eslint|prettier|docker|nginx|cors|rate.?limit|cache|queue|worker|hook|endpoint|route|handler|controller|service|repository|schema|migration|index|foreign.?key|transaction)\b/i;

const ARCHITECTURAL_KEYWORDS =
  /\b(system\s+design|data\s+flow|scaling|infrastructure|split\s+(?:into|the)\s+service|event.?driven|microservice|monorepo|database\s+schema|redesign|architecture|refactor\s+(?:the|all|entire)|separate\s+concern|decoupl|abstraction|domain\s+model|bounded\s+context|api\s+contract|versioning|deployment|ci\/cd|pipeline|load\s+balanc|sharding|replication)\b/i;

function countTechnicalConcepts(msg: string): number {
  const m = lower(msg);
  const concepts = [
    /\b(bcrypt|argon2|redis|postgres|sqlite|jwt|oauth|cors|rate.?limit)\b/,
    /\b(middleware|express|fastify|hook|endpoint|route|handler|controller)\b/,
    /\b(service|repository|schema|migration|index|foreign.?key|transaction)\b/,
    /\b(cache|queue|worker|async|await|promise|stream|buffer)\b/,
    /\b(docker|nginx|kubernetes|ci\/cd|pipeline|deploy)\b/,
    /\b(prisma|drizzle|zod|vitest|jest|playwright|webpack|vite|eslint)\b/,
  ];
  return concepts.filter(re => re.test(m)).length;
}

export function classifyDepth(msg: string): DecisionDepth {
  const trimmed = msg.trim();
  const msgLower = lower(trimmed);

  // surface: very short, simple yes/no/ok, or only naming/formatting
  if (trimmed.length < 30) return 'surface';
  if (SURFACE_SIMPLE_WORDS.test(trimmed)) return 'surface';
  if (SURFACE_NAMING_FORMATTING.test(msgLower) && trimmed.length < 80) return 'surface';

  // architectural: system design keywords OR 3+ technical concepts
  if (ARCHITECTURAL_KEYWORDS.test(msgLower)) return 'architectural';
  if (countTechnicalConcepts(trimmed) >= 3) return 'architectural';

  // tactical: specific tools, libraries, patterns
  if (TACTICAL_KEYWORDS.test(msgLower)) return 'tactical';

  // default: surface for short messages, tactical for longer ones
  if (trimmed.length < 60) return 'surface';
  return 'tactical';
}

// ─── Opinionation Heuristics ──────────────────────────────────────────────────

const LOW_OPINIONATION =
  /^(looks?\s+good|lgtm|yes|do\s+it|perfect|great|awesome|nice|ship\s+it|proceed|go\s+ahead|sounds?\s+good|ok(?:ay)?|approved?|run\s+the\s+tests?|that'?s\s+(?:good|right|correct|great|perfect))\.?$/i;

const HIGH_OPINIONATION_KEYWORDS =
  /\b(compliance|regulation|gdpr|hipaa|soc2|business\s+requirement|customer|user\s+behavior|user\s+experience|pricing|deadline|team\s+decision|stakeholder|legal|audit|security\s+policy|performance\s+budget|sla|slo|kpi|okr|revenue|churn|conversion)\b/i;

function hasProjectSpecificReferences(msg: string): boolean {
  // References to specific files, 'we use X', 'in this project', 'our X'
  if (/\b(we\s+use|in\s+this\s+project|our\s+(codebase|api|backend|frontend|db|database|schema|service)|this\s+(repo|codebase|project))\b/i.test(msg)) return true;
  if (/\.[a-z]{1,5}['"]?\s*(?:file|path|module)?/i.test(msg)) return true;
  // References to specific named libraries/tools in a choice context
  if (TACTICAL_KEYWORDS.test(lower(msg))) return true;
  return false;
}

function countSentences(msg: string): number {
  return msg.split(/[.!?]+/).filter(s => s.trim().length > 3).length;
}

export function classifyOpinionation(msg: string): DecisionOpinionation {
  const trimmed = msg.trim();

  // low: generic short responses with no domain knowledge
  if (LOW_OPINIONATION.test(trimmed)) return 'low';
  if (trimmed.length < 20) return 'low';

  // high: introduces external/business knowledge OR multi-sentence reasoning explaining WHY
  if (HIGH_OPINIONATION_KEYWORDS.test(trimmed)) return 'high';
  if (countSentences(trimmed) >= 3 && trimmed.length > 100) return 'high';

  // medium: references project-specific things
  if (hasProjectSpecificReferences(trimmed)) return 'medium';

  // default based on length / specificity
  if (trimmed.length > 80) return 'medium';
  return 'low';
}

// ─── Context Rewriting ────────────────────────────────────────────────────────

/** Strip XML/system tags from a message. */
function stripSystemContent(msg: string): string {
  return msg
    .replace(/<[^>]+>/g, ' ')   // remove XML tags
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Convert a raw user message into a clean decision summary (<=80 chars).
 * Not a quote — a reworded description of what the decision was.
 */
export function summarizeContext(userMessage: string, type: DecisionType): string {
  const msg = stripSystemContent(userMessage).trim();
  const msgLower = lower(msg);

  // Accept / affirmative patterns (check before length-based fallbacks)
  if (/^(looks?\s+good|lgtm|approved?)[.!]?$/i.test(msg)) {
    return 'Approved implementation';
  }
  if (/^(great|perfect|awesome|nice|ship\s+it|sounds?\s+good|yes|ok|okay)[.!]?$/i.test(msg)) {
    return 'Approved implementation';
  }
  if (/\b(looks?\s+good|lgtm|approved?)\b/i.test(msgLower) && msg.length < 30) {
    return 'Approved implementation';
  }
  if (/\b(great|perfect|awesome|nice|ship\s+it|sounds?\s+good)\b/i.test(msgLower) && msg.length < 30) {
    return 'Approved implementation';
  }

  // Very short messages
  if (msg.length <= 10) {
    if (/^(yes|ok|okay|sure|yep)\.?$/i.test(msg)) return 'Approved implementation';
    if (/^(no|nope)\.?$/i.test(msg)) return 'Rejected approach';
    return msg.slice(0, 80);
  }

  // Validate patterns
  if (/\brun\s+the\s+tests?\b/i.test(msgLower)) return 'Requested test verification';
  if (/\brun\s+(?:the\s+)?(\w+)\s+tests?\b/i.test(msgLower)) {
    const match = msg.match(/\brun\s+(?:the\s+)?(\w+)\s+tests?\b/i);
    return `Requested ${match?.[1] ?? ''} test verification`.trim();
  }
  if (/\b(verify|confirm\s+that|make\s+sure|check\s+if)\b/i.test(msgLower)) {
    return 'Requested verification';
  }

  // Reject patterns
  if (/\b(won'?t\s+work|doesn'?t\s+work|this\s+is\s+wrong|not\s+right|incorrect|broken)\b/i.test(msgLower)) {
    return 'Rejected approach';
  }

  // Steer: "No, use X instead of Y"
  const steerMatch = msg.match(/(?:no[,.]?\s+)?(?:use|switch\s+to|let'?s\s+use)\s+(\w+)\s+instead\s+of\s+(\w+)/i);
  if (steerMatch) {
    return `Chose ${steerMatch[1]} over ${steerMatch[2]}`.slice(0, 80);
  }

  // Steer: "No, use X" without "instead of"
  const steerUseMatch = msg.match(/(?:no[,.]?\s+)?(?:use|switch\s+to)\s+([\w-]+)(?:\s+instead)?/i);
  if (steerUseMatch && type === 'steer') {
    return `Steered to use ${steerUseMatch[1]}`.slice(0, 80);
  }

  // Scope add
  if (/\b(also\s+add|additionally\s+(?:add|include)|we\s+still\s+need|also\s+include|also\s+(?:make|create|implement))\b/i.test(msgLower)) {
    // Extract what's being added
    const scopeMatch = msg.match(/(?:also\s+add|also\s+include|also\s+(?:make|create|implement)|we\s+still\s+need|additionally\s+(?:add|include))\s+(.+)/i);
    if (scopeMatch) {
      return `Added ${scopeMatch[1].slice(0, 60)} to scope`.slice(0, 80);
    }
    return 'Expanded task scope';
  }

  // Scope remove
  if (/\b(skip|drop|don'?t\s+need|leave\s+out|omit)\b/i.test(msgLower)) {
    return 'Removed item from scope';
  }

  // Modify
  if (/\bchange\s+(\S+)/i.test(msgLower)) {
    const m = msg.match(/\bchange\s+(\S+)/i);
    return `Changed ${m?.[1] ?? 'implementation'}`.slice(0, 80);
  }
  if (/\bupdate\s+the\s+(\w+)/i.test(msgLower)) {
    const m = msg.match(/\bupdate\s+the\s+(\w+)/i);
    return `Updated ${m?.[1] ?? 'implementation'}`.slice(0, 80);
  }

  // For longer messages: take the first meaningful sentence and trim
  const firstSentence = msg.split(/[.!?]/)[0]?.trim() ?? msg;
  if (firstSentence.length <= 80) return firstSentence;
  return firstSentence.slice(0, 77) + '...';
}

// ─── Classifier ──────────────────────────────────────────────────────────────

/**
 * Classify a user message into a decision type using heuristic rules.
 *
 * @param userMessage        The incoming user message to classify.
 * @param prevAssistantMessage  The preceding assistant message (or null).
 * @param prevToolUses       Tool uses from the preceding assistant turn (or null).
 * @returns ClassifiedDecision if a rule matched, otherwise null.
 */
export function classifyDecision(
  userMessage: string,
  prevAssistantMessage: string | null,
  prevToolUses: ToolUse[] | null,
): ClassifiedDecision | null {
  const msg = userMessage.trim();
  const msgLower = lower(msg);
  const filesAffected = extractFiles(prevToolUses);
  const hadCode = hadToolUse(prevToolUses);

  const depth = classifyDepth(msg);
  const opinionation = classifyOpinionation(msg);
  const aiAction = extractAiAction(prevAssistantMessage, prevToolUses);

  function result(type: DecisionType, matchedRule: string): ClassifiedDecision {
    const devReaction = summarizeContext(msg, type);
    const signal = classifySignal(type, depth, opinionation, msg);
    return {
      type,
      context: buildContext(type, aiAction, devReaction),
      aiAction,
      devReaction,
      matchedRule,
      filesAffected,
      depth,
      opinionation,
      signal,
    };
  }

  // Rule 1: steer — negation + alternative (highest priority)
  if (STEER_NEGATION.test(msgLower) && STEER_ALTERNATIVE.test(msgLower)) {
    return result('steer', 'steer_negation_plus_alternative');
  }

  // Rule 2: reject — negation without alternative ONLY when previous had tool_use
  if (hadCode && REJECT_PATTERNS.test(msgLower)) {
    return result('reject', 'reject_negation_after_code');
  }

  // Rule 3: modify — explicit change request
  if (MODIFY_PATTERNS.test(msgLower)) {
    return result('modify', 'modify_change_request');
  }

  // Rule 4: validate — verification/test request
  if (VALIDATE_PATTERNS.test(msgLower)) {
    return result('validate', 'validate_verification_request');
  }

  // Rule 5: scope remove
  if (SCOPE_REMOVE_PATTERNS.test(msgLower)) {
    return result('scope', 'scope_remove');
  }

  // Rule 6: scope add
  if (SCOPE_ADD_PATTERNS.test(msgLower)) {
    return result('scope', 'scope_add');
  }

  // Rule 7: accept explicit affirmative
  if (ACCEPT_EXPLICIT_PATTERNS.test(msgLower)) {
    return result('accept', 'accept_explicit_affirmative');
  }

  // Rule 8: accept implicit — any message >10 chars after code generation
  // that didn't match any rule above
  if (hadCode && msg.length > 10) {
    return result('accept', 'accept_implicit_new_request');
  }

  // No rule matched — ambiguous
  return null;
}
