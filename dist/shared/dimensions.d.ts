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
    ranges: {
        min: number;
        max: number;
        description: string;
    }[];
}
export declare const BASE_DIMENSION_KEYS: readonly ["task_decomposition", "prompt_specificity", "output_validation", "iteration_quality", "strategic_tool_usage", "context_management"];
export type BaseDimensionKey = (typeof BASE_DIMENSION_KEYS)[number];
export declare const BASE_DIMENSIONS: Record<BaseDimensionKey, DimensionDefinition>;
export declare const DOMAIN_DIMENSION_KEYS: readonly ["architectural_awareness", "error_anticipation", "technical_vocabulary", "dependency_reasoning", "tradeoff_articulation"];
export type DomainDimensionKey = (typeof DOMAIN_DIMENSION_KEYS)[number];
export declare const DOMAIN_DIMENSIONS: Record<DomainDimensionKey, DimensionDefinition>;
/** All 11 dimension keys (6 base + 5 domain) */
export declare const ALL_DIMENSION_KEYS: readonly ["task_decomposition", "prompt_specificity", "output_validation", "iteration_quality", "strategic_tool_usage", "context_management", "architectural_awareness", "error_anticipation", "technical_vocabulary", "dependency_reasoning", "tradeoff_articulation"];
export type AllDimensionKey = (typeof ALL_DIMENSION_KEYS)[number];
/** Default base dimension configuration for a new rubric */
export declare const DEFAULT_BASE_DIMENSIONS: Record<BaseDimensionKey, {
    weight: number;
    enabled: boolean;
}>;
export declare const WEIGHT_PROFILE_KEYS: readonly ["balanced", "greenfield", "bugfix", "refactor", "security_review"];
export interface WeightProfile {
    key: WeightProfileKey;
    label: string;
    description: string;
    weights: Record<BaseDimensionKey, number>;
}
export declare const WEIGHT_PROFILES: Record<WeightProfileKey, WeightProfile>;
/** Look up a weight profile by key. Returns undefined if not found. */
export declare function getWeightProfile(key: WeightProfileKey): WeightProfile | undefined;
