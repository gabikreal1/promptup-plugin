/**
 * Base 6-dimension rubric definitions for PromptUp evaluation.
 * Sourced from the PromptUp Evaluator rubric v0.1.
 *
 * STANDALONE copy — no imports from @promptup/shared.
 */

import type { WeightProfileKey } from './types.js';

export interface DimensionDefinition {
  key: string;
  label: string;
  description: string;
  scoring_guidance: string;
  signals: string[];
  ranges: { min: number; max: number; description: string }[];
}

export const BASE_DIMENSION_KEYS = [
  'task_decomposition',
  'prompt_specificity',
  'output_validation',
  'iteration_quality',
  'strategic_tool_usage',
  'context_management',
] as const;

export type BaseDimensionKey = (typeof BASE_DIMENSION_KEYS)[number];

export const BASE_DIMENSIONS: Record<BaseDimensionKey, DimensionDefinition> = {
  task_decomposition: {
    key: 'task_decomposition',
    label: 'Task Decomposition',
    description: 'How well the developer breaks down complex problems before prompting.',
    scoring_guidance:
      'Score 0-100 based on how effectively the developer decomposes complex tasks into manageable sub-tasks with clear sequencing and dependency management.',
    signals: [
      'One thing at a time vs everything at once?',
      'References prior step outputs?',
      'Visible plan or improvising?',
    ],
    ranges: [
      { min: 0, max: 20, description: 'Dumps entire complex task in one prompt, no structure' },
      { min: 21, max: 40, description: 'Some structure but mixes multiple concerns per prompt' },
      { min: 41, max: 60, description: 'Logical steps but suboptimal sequencing' },
      { min: 61, max: 80, description: 'Clear decomposition with logical sequencing and dependencies' },
      { min: 81, max: 100, description: 'Expert — optimal subtask order, explicit dependency management' },
    ],
  },
  prompt_specificity: {
    key: 'prompt_specificity',
    label: 'Prompt Specificity',
    description: 'How precise and well-structured the prompts are.',
    scoring_guidance:
      'Score 0-100 based on information density, constraints, examples, output format requirements, and edge case coverage.',
    signals: [
      'Information density (long != good, dense = good)',
      'Output format requirements?',
      'Few-shot examples?',
      'Constraints (what NOT to do)?',
    ],
    ranges: [
      { min: 0, max: 20, description: 'Vague/ambiguous ("make it better", "fix this")' },
      { min: 21, max: 40, description: 'Some specificity, missing key constraints or context' },
      { min: 41, max: 60, description: 'Adequate, gets reasonable results but room for misinterpretation' },
      { min: 61, max: 80, description: 'Well-structured with clear constraints, examples, or format requirements' },
      {
        min: 81,
        max: 100,
        description: 'Expert — role setting, constraints, examples, output format, edge cases, success criteria',
      },
    ],
  },
  output_validation: {
    key: 'output_validation',
    label: 'Output Validation',
    description: 'Does the developer critically evaluate AI responses or accept blindly?',
    scoring_guidance:
      'Score 0-100 based on how thoroughly the developer validates, questions, and tests AI-generated outputs.',
    signals: [
      'Says "that\'s wrong" or "check that"?',
      'Tests code before accepting?',
      'Catches hallucinations?',
      'Asks for sources?',
      'Notices logical inconsistencies?',
    ],
    ranges: [
      { min: 0, max: 20, description: 'Accepts every response without question' },
      { min: 21, max: 40, description: 'Occasionally pushes back on obvious errors only' },
      { min: 41, max: 60, description: 'Checks key claims/results, catches some errors' },
      {
        min: 61,
        max: 80,
        description: 'Systematic — tests outputs, cross-references, identifies hallucinations',
      },
      {
        min: 81,
        max: 100,
        description: 'Expert — challenges assumptions, tests edge cases, verifies against external sources',
      },
    ],
  },
  iteration_quality: {
    key: 'iteration_quality',
    label: 'Iteration Quality',
    description: 'When iterating, does each iteration meaningfully improve on the previous?',
    scoring_guidance:
      'Score 0-100 based on whether each follow-up prompt builds purposefully on previous responses and converges efficiently.',
    signals: [
      'Clear purpose per follow-up?',
      'Converging or going in circles?',
      'References specific parts of previous responses?',
      'Pivots when approach fails?',
    ],
    ranges: [
      { min: 0, max: 20, description: 'Repeats similar prompts hoping for different results' },
      { min: 21, max: 40, description: 'Changes are random/unfocused' },
      { min: 41, max: 60, description: 'Shows direction but includes unnecessary repetition' },
      { min: 61, max: 80, description: 'Focused iterations addressing specific weaknesses' },
      {
        min: 81,
        max: 100,
        description: 'Expert — each prompt builds precisely on previous, converges efficiently',
      },
    ],
  },
  strategic_tool_usage: {
    key: 'strategic_tool_usage',
    label: 'Strategic Tool Usage',
    description: 'Intelligent choices about which AI capabilities to use.',
    scoring_guidance:
      'Score 0-100 based on deliberate selection of models, tools, and capabilities matched to task requirements.',
    signals: [
      'Switches models/tools when appropriate?',
      'Uses code execution for verification?',
      'Leverages search for factual accuracy?',
      'Understands capability differences?',
    ],
    ranges: [
      { min: 0, max: 20, description: 'One model/approach for everything' },
      { min: 21, max: 40, description: 'Aware of different capabilities but doesn\'t leverage them' },
      { min: 41, max: 60, description: 'Some tool/model choices but not always optimal' },
      { min: 61, max: 80, description: 'Deliberately selects models/tools based on task requirements' },
      {
        min: 81,
        max: 100,
        description: 'Expert — switches models mid-workflow, uses appropriate tools at right moments',
      },
    ],
  },
  context_management: {
    key: 'context_management',
    label: 'Context Management',
    description: 'How well the developer manages conversation context and information flow.',
    scoring_guidance:
      'Score 0-100 based on deliberate context structuring, summarization, and information flow management.',
    signals: [
      'Provides context at start?',
      'References previous parts?',
      'Summarises/checkpoints progress?',
      'Re-provides context when conversation gets long?',
    ],
    ranges: [
      {
        min: 0,
        max: 20,
        description: 'No context management, each prompt independent, repeats information',
      },
      { min: 21, max: 40, description: 'Some reference to previous context but inconsistent' },
      {
        min: 41,
        max: 60,
        description: "Maintains thread but doesn't explicitly manage context window",
      },
      {
        min: 61,
        max: 80,
        description:
          'Deliberately structures info flow — summarises, references, builds on prior exchanges',
      },
      {
        min: 81,
        max: 100,
        description:
          'Expert — relevant background upfront, summarises intermediate results, manages long conversations',
      },
    ],
  },
};

// ─── Domain Dimensions (5 depth-of-understanding dimensions) ──────────

export const DOMAIN_DIMENSION_KEYS = [
  'architectural_awareness',
  'error_anticipation',
  'technical_vocabulary',
  'dependency_reasoning',
  'tradeoff_articulation',
] as const;

export type DomainDimensionKey = (typeof DOMAIN_DIMENSION_KEYS)[number];

export const DOMAIN_DIMENSIONS: Record<DomainDimensionKey, DimensionDefinition> = {
  architectural_awareness: {
    key: 'architectural_awareness',
    label: 'Architectural Awareness',
    description: 'Understanding of system architecture, patterns, and design trade-offs.',
    scoring_guidance:
      'Score 0-100 based on how well the developer demonstrates awareness of system-level architecture, design patterns, and structural implications of their changes.',
    signals: [
      'References architecture when making decisions?',
      'Considers cross-cutting concerns?',
      'Understands component boundaries?',
      'Anticipates scaling implications?',
    ],
    ranges: [
      { min: 0, max: 20, description: 'No awareness of system structure, treats code in isolation' },
      { min: 21, max: 40, description: 'Aware of immediate file/module scope only' },
      { min: 41, max: 60, description: 'Understands local architecture but misses wider implications' },
      { min: 61, max: 80, description: 'Considers system-level design patterns and trade-offs' },
      { min: 81, max: 100, description: 'Expert — reasons about architecture holistically, anticipates cascading effects' },
    ],
  },
  error_anticipation: {
    key: 'error_anticipation',
    label: 'Error Anticipation',
    description: 'Proactively considering failure modes, edge cases, and error handling.',
    scoring_guidance:
      'Score 0-100 based on how proactively the developer considers failure modes, edge cases, and error recovery strategies.',
    signals: [
      'Asks about edge cases proactively?',
      'Considers failure scenarios?',
      'Plans error recovery?',
      'Tests unhappy paths?',
    ],
    ranges: [
      { min: 0, max: 20, description: 'No consideration of failure modes or edge cases' },
      { min: 21, max: 40, description: 'Handles obvious errors only when prompted' },
      { min: 41, max: 60, description: 'Some proactive error thinking but gaps in coverage' },
      { min: 61, max: 80, description: 'Systematically considers failure modes and edge cases' },
      { min: 81, max: 100, description: 'Expert — anticipates subtle failures, designs for resilience' },
    ],
  },
  technical_vocabulary: {
    key: 'technical_vocabulary',
    label: 'Technical Vocabulary',
    description: 'Precision of technical language and domain-specific terminology.',
    scoring_guidance:
      'Score 0-100 based on the precision and appropriateness of technical language, correct use of domain terminology, and communication clarity.',
    signals: [
      'Uses correct technical terms?',
      'Distinguishes similar concepts precisely?',
      'Communicates intent clearly to AI?',
      'Names things well in code?',
    ],
    ranges: [
      { min: 0, max: 20, description: 'Vague or incorrect terminology, imprecise communication' },
      { min: 21, max: 40, description: 'Basic terms used correctly but lacks precision' },
      { min: 41, max: 60, description: 'Generally correct terminology with occasional imprecision' },
      { min: 61, max: 80, description: 'Precise technical language, clear domain-specific communication' },
      { min: 81, max: 100, description: 'Expert — nuanced vocabulary, distinguishes subtle concept differences' },
    ],
  },
  dependency_reasoning: {
    key: 'dependency_reasoning',
    label: 'Dependency Reasoning',
    description: 'Understanding how components interact, import chains, and side effects.',
    scoring_guidance:
      'Score 0-100 based on awareness of dependency graphs, understanding of side effects, and ability to trace interaction chains.',
    signals: [
      'Understands import/dependency chains?',
      'Considers side effects of changes?',
      'Traces data flow across boundaries?',
      'Identifies coupling risks?',
    ],
    ranges: [
      { min: 0, max: 20, description: 'No awareness of dependencies or side effects' },
      { min: 21, max: 40, description: 'Understands direct dependencies only' },
      { min: 41, max: 60, description: 'Traces some dependency chains but misses indirect effects' },
      { min: 61, max: 80, description: 'Good understanding of interaction patterns and side effects' },
      { min: 81, max: 100, description: 'Expert — traces full dependency graphs, predicts cascading side effects' },
    ],
  },
  tradeoff_articulation: {
    key: 'tradeoff_articulation',
    label: 'Tradeoff Articulation',
    description: 'Ability to weigh and explain trade-offs between different approaches.',
    scoring_guidance:
      'Score 0-100 based on ability to identify, compare, and clearly articulate trade-offs when choosing between approaches.',
    signals: [
      'Compares alternatives explicitly?',
      'Weighs pros/cons of approaches?',
      'Explains reasoning for choices?',
      'Considers non-functional requirements?',
    ],
    ranges: [
      { min: 0, max: 20, description: 'Accepts first solution without considering alternatives' },
      { min: 21, max: 40, description: 'Occasionally mentions alternatives but no structured comparison' },
      { min: 41, max: 60, description: 'Identifies trade-offs but analysis lacks depth' },
      { min: 61, max: 80, description: 'Structured comparison of approaches with clear reasoning' },
      { min: 81, max: 100, description: 'Expert — multi-dimensional trade-off analysis including performance, maintainability, and business impact' },
    ],
  },
};

/** All 11 dimension keys (6 base + 5 domain) */
export const ALL_DIMENSION_KEYS = [...BASE_DIMENSION_KEYS, ...DOMAIN_DIMENSION_KEYS] as const;
export type AllDimensionKey = (typeof ALL_DIMENSION_KEYS)[number];

/** Default base dimension configuration for a new rubric */
export const DEFAULT_BASE_DIMENSIONS: Record<
  BaseDimensionKey,
  { weight: number; enabled: boolean }
> = {
  task_decomposition: { weight: 1.0, enabled: true },
  prompt_specificity: { weight: 1.0, enabled: true },
  output_validation: { weight: 1.0, enabled: true },
  iteration_quality: { weight: 1.0, enabled: true },
  strategic_tool_usage: { weight: 1.0, enabled: true },
  context_management: { weight: 1.0, enabled: true },
};

// ─── Preset Weight Profiles ──────────────────────────────────────────────

export const WEIGHT_PROFILE_KEYS = [
  'balanced',
  'greenfield',
  'bugfix',
  'refactor',
  'security_review',
] as const;

export interface WeightProfile {
  key: WeightProfileKey;
  label: string;
  description: string;
  weights: Record<BaseDimensionKey, number>;
}

export const WEIGHT_PROFILES: Record<WeightProfileKey, WeightProfile> = {
  balanced: {
    key: 'balanced',
    label: 'Balanced',
    description: 'Equal weight across all dimensions. Good default for general development tasks.',
    weights: {
      task_decomposition: 0.167,
      prompt_specificity: 0.167,
      output_validation: 0.167,
      iteration_quality: 0.167,
      strategic_tool_usage: 0.167,
      context_management: 0.165,
    },
  },
  greenfield: {
    key: 'greenfield',
    label: 'Greenfield',
    description: 'Emphasizes task decomposition and prompt clarity for new feature development.',
    weights: {
      task_decomposition: 0.25,
      prompt_specificity: 0.20,
      output_validation: 0.15,
      iteration_quality: 0.15,
      strategic_tool_usage: 0.15,
      context_management: 0.10,
    },
  },
  bugfix: {
    key: 'bugfix',
    label: 'Bugfix',
    description: 'Emphasizes output validation and iteration for debugging and fixing issues.',
    weights: {
      task_decomposition: 0.10,
      prompt_specificity: 0.15,
      output_validation: 0.30,
      iteration_quality: 0.20,
      strategic_tool_usage: 0.15,
      context_management: 0.10,
    },
  },
  refactor: {
    key: 'refactor',
    label: 'Refactor',
    description: 'Emphasizes decomposition, validation, and context management for code restructuring.',
    weights: {
      task_decomposition: 0.20,
      prompt_specificity: 0.15,
      output_validation: 0.20,
      iteration_quality: 0.15,
      strategic_tool_usage: 0.10,
      context_management: 0.20,
    },
  },
  security_review: {
    key: 'security_review',
    label: 'Security Review',
    description: 'Heavily weights output validation for security-focused code review tasks.',
    weights: {
      task_decomposition: 0.10,
      prompt_specificity: 0.15,
      output_validation: 0.35,
      iteration_quality: 0.15,
      strategic_tool_usage: 0.10,
      context_management: 0.15,
    },
  },
};

/** Look up a weight profile by key. Returns undefined if not found. */
export function getWeightProfile(key: WeightProfileKey): WeightProfile | undefined {
  return WEIGHT_PROFILES[key];
}
