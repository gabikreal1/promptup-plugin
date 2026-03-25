// ─── Session tracking ─────────────────────────────────────────────────────────

export interface SessionRow {
  id: string;
  project_path: string | null;
  transcript_path: string | null;
  status: string;
  message_count: number;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

// ─── Evaluation results ──────────────────────────────────────────────────────

export interface EvaluationRow {
  id: string;
  session_id: string;
  trigger_type: string;
  report_type: string;
  composite_score: number;
  dimension_scores: string; // JSON
  recommendations: string | null; // JSON
  trends: string | null; // JSON
  risk_flags: string | null; // JSON
  raw_evaluation: string | null;
  message_count: number;
  message_range_from: number;
  message_range_to: number;
  weight_profile: string;
  created_at: string;
}

// ─── Parsed message from JSONL transcript ────────────────────────────────────

export interface MessageRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool_result';
  content: string;
  tool_uses: string | null; // JSON array of {name, input}
  sequence_number: number;
  tokens_in: number;
  tokens_out: number;
  model: string | null;
  created_at: string;
}

// ─── Decision tracking ───────────────────────────────────────────────────────

export type DecisionType = 'steer' | 'accept' | 'reject' | 'modify' | 'validate' | 'scope';
export type DecisionDepth = 'surface' | 'tactical' | 'architectural';
export type DecisionOpinionation = 'low' | 'medium' | 'high';
export type DecisionSignal = 'high' | 'medium' | 'low';

export interface DecisionRow {
  id: string;
  session_id: string;
  type: DecisionType;
  message_index: number;
  context: string;
  files_affected: string; // JSON array
  source: 'plugin' | 'daemon';
  matched_rule: string | null;
  depth: DecisionDepth | null;
  opinionation: DecisionOpinionation | null;
  ai_action: string | null;
  signal: DecisionSignal | null;
  created_at: string;
}

// ─── Git activity ────────────────────────────────────────────────────────────

export type GitOpType = 'checkout' | 'commit' | 'push' | 'branch_create' | 'merge';

export interface GitActivityRow {
  id: string;
  session_id: string;
  type: GitOpType;
  branch: string | null;
  commit_hash: string | null;
  commit_message: string | null;
  remote: string | null;
  raw_command: string;
  message_index: number;
  created_at: string;
}

// ─── PR Report ───────────────────────────────────────────────────────────────

export interface PRReportRow {
  id: string;
  branch: string;
  repo: string;
  pr_number: number | null;
  pr_url: string | null;
  commits: string; // JSON
  session_ids: string; // JSON
  total_decisions: number;
  decision_breakdown: string; // JSON
  dqs: number | null;
  markdown: string;
  posted_at: string | null;
  created_at: string;
}

// ─── Evaluation sub-types ────────────────────────────────────────────────────

export interface EvalDimensionScore {
  key: string;
  score: number;
  weight: number;
  reasoning?: string;
}

export interface EvalRecommendation {
  dimension_key: string;
  priority: 'low' | 'medium' | 'high';
  recommendation: string;
  suggestions?: string[];
}

export interface EvalTrend {
  dimension_key: string;
  direction: 'improving' | 'declining' | 'stable';
  delta: number;
  previous_score: number;
  current_score: number;
}

export type EvalTriggerType = 'manual' | 'prompt_count' | 'session_end';
export type WeightProfileKey = 'balanced' | 'greenfield' | 'bugfix' | 'refactor' | 'security_review';

// ─── Classification ──────────────────────────────────────────────────────────

export function classify(score: number): 'junior' | 'middle' | 'senior' {
  if (score <= 40) return 'junior';
  if (score <= 70) return 'middle';
  return 'senior';
}
