/**
 * Multi-layer composite scoring for PromptUp evaluations.
 *
 * Score hierarchy:
 *   base composite       — weighted avg of 6 base dimensions
 *   domain composite     — weighted avg of 5 domain dimensions
 *   tech composite       — avg across roadmap-level tech expertise scores
 *   overall composite    — blend of base + domain (60/40)
 *   grand composite      — blend of overall + tech (70/30)
 *
 * STANDALONE copy — no imports from @promptup/shared.
 */
export interface CompositeScores {
    composite_score: number;
    domain_composite_score: number | null;
    tech_composite_score: number | null;
    overall_composite_score: number | null;
    grand_composite_score: number | null;
}
export interface CompositeDimensionInput {
    score: number;
    weight?: number;
}
export interface TechExpertiseScoreInput {
    score: number;
}
export interface RiskFlag {
    type: string;
    dimension: string;
    score: number;
    severity: 'warning' | 'critical';
    message: string;
}
export interface RiskFlagDimensionScore {
    dimension: string;
    score: number;
}
/** Weight of base composite in the overall composite blend */
export declare const OVERALL_BASE_WEIGHT = 0.6;
/** Weight of domain composite in the overall composite blend */
export declare const OVERALL_DOMAIN_WEIGHT = 0.4;
/** Weight of overall composite in the grand composite blend */
export declare const GRAND_OVERALL_WEIGHT = 0.7;
/** Weight of tech composite in the grand composite blend */
export declare const GRAND_TECH_WEIGHT = 0.3;
export declare function clamp(min: number, max: number, value: number): number;
/**
 * Compute weighted composite score from dimension scores + weights.
 * Dimensions with weight 0 are excluded from calculation.
 */
export declare function computeCompositeScore(dimensions: {
    score: number;
    weight: number;
}[]): number;
/**
 * Compute domain composite from 5 domain dimension scores.
 * Returns null if no scores provided.
 */
export declare function computeDomainComposite(domainScores: Record<string, CompositeDimensionInput>): number | null;
/**
 * Compute tech composite from roadmap-level expertise scores.
 * Returns null if no tech expertise entries.
 */
export declare function computeTechComposite(techExpertise: TechExpertiseScoreInput[]): number | null;
/**
 * Compute overall composite = blend of base + domain composites.
 * Returns null if domain composite is null.
 */
export declare function computeOverallComposite(baseComposite: number, domainComposite: number | null): number | null;
/**
 * Compute grand composite = blend of overall + tech composites.
 * Returns null if either overall or tech composite is null.
 */
export declare function computeGrandComposite(overallComposite: number | null, techComposite: number | null): number | null;
/**
 * Compute risk flags from dimension scores and composite score.
 *
 * Flags:
 * - "Hidden Weakness": any dimension < 30 while composite > 60 (critical)
 * - "Extreme Imbalance": any dimension > 85 while another < 35 (warning)
 */
export declare function computeRiskFlags(dimensionScores: RiskFlagDimensionScore[], compositeScore: number): RiskFlag[];
/**
 * Compute risk flags including historical comparison.
 *
 * In addition to the base flags from computeRiskFlags, adds:
 * - "Volatile": delta > 40 between consecutive checkpoints on any dimension (warning)
 */
export declare function computeRiskFlagsWithHistory(current: RiskFlagDimensionScore[], previous: RiskFlagDimensionScore[] | null, compositeScore?: number): RiskFlag[];
