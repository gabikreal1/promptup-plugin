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

// ─── Types ──────────────────────────────────────────────────────────────

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

// ─── Risk Flag Types ─────────────────────────────────────────────────────

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

// ─── Constants ──────────────────────────────────────────────────────────

/** Weight of base composite in the overall composite blend */
export const OVERALL_BASE_WEIGHT = 0.6;
/** Weight of domain composite in the overall composite blend */
export const OVERALL_DOMAIN_WEIGHT = 0.4;
/** Weight of overall composite in the grand composite blend */
export const GRAND_OVERALL_WEIGHT = 0.7;
/** Weight of tech composite in the grand composite blend */
export const GRAND_TECH_WEIGHT = 0.3;

// ─── Helpers ─────────────────────────────────────────────────────────────

export function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── Functions ──────────────────────────────────────────────────────────

/**
 * Compute weighted composite score from dimension scores + weights.
 * Dimensions with weight 0 are excluded from calculation.
 */
export function computeCompositeScore(
  dimensions: { score: number; weight: number }[],
): number {
  const totalWeight = dimensions.reduce(
    (sum, d) => (d.weight > 0 ? sum + d.weight : sum),
    0,
  );
  if (totalWeight === 0) return 0;

  const weightedSum = dimensions.reduce(
    (sum, d) => (d.weight > 0 ? sum + d.score * d.weight : sum),
    0,
  );
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

/**
 * Compute domain composite from 5 domain dimension scores.
 * Returns null if no scores provided.
 */
export function computeDomainComposite(
  domainScores: Record<string, CompositeDimensionInput>,
): number | null {
  const entries = Object.values(domainScores);
  if (entries.length === 0) return null;

  const totalWeight = entries.reduce((sum, d) => sum + (d.weight ?? 1), 0);
  if (totalWeight === 0) return null;

  const weighted = entries.reduce(
    (sum, d) => sum + d.score * (d.weight ?? 1),
    0,
  );
  return Math.round((weighted / totalWeight) * 10) / 10;
}

/**
 * Compute tech composite from roadmap-level expertise scores.
 * Returns null if no tech expertise entries.
 */
export function computeTechComposite(
  techExpertise: TechExpertiseScoreInput[],
): number | null {
  if (techExpertise.length === 0) return null;
  const sum = techExpertise.reduce((s, te) => s + te.score, 0);
  return Math.round((sum / techExpertise.length) * 10) / 10;
}

/**
 * Compute overall composite = blend of base + domain composites.
 * Returns null if domain composite is null.
 */
export function computeOverallComposite(
  baseComposite: number,
  domainComposite: number | null,
): number | null {
  if (domainComposite === null) return null;
  const score =
    baseComposite * OVERALL_BASE_WEIGHT +
    domainComposite * OVERALL_DOMAIN_WEIGHT;
  return Math.round(score * 10) / 10;
}

/**
 * Compute grand composite = blend of overall + tech composites.
 * Returns null if either overall or tech composite is null.
 */
export function computeGrandComposite(
  overallComposite: number | null,
  techComposite: number | null,
): number | null {
  if (overallComposite === null || techComposite === null) return null;
  const score =
    overallComposite * GRAND_OVERALL_WEIGHT +
    techComposite * GRAND_TECH_WEIGHT;
  return Math.round(score * 10) / 10;
}

// ─── Risk Flags ──────────────────────────────────────────────────────────

/**
 * Compute risk flags from dimension scores and composite score.
 *
 * Flags:
 * - "Hidden Weakness": any dimension < 30 while composite > 60 (critical)
 * - "Extreme Imbalance": any dimension > 85 while another < 35 (warning)
 */
export function computeRiskFlags(
  dimensionScores: RiskFlagDimensionScore[],
  compositeScore: number,
): RiskFlag[] {
  const flags: RiskFlag[] = [];

  // Hidden Weakness: any dim < 30 AND composite > 60
  if (compositeScore > 60) {
    for (const ds of dimensionScores) {
      if (ds.score < 30) {
        flags.push({
          type: 'Hidden Weakness',
          dimension: ds.dimension,
          score: ds.score,
          severity: 'critical',
          message: `${ds.dimension} scored ${ds.score} despite composite score of ${compositeScore}. This weakness may be masked by strong performance in other areas.`,
        });
      }
    }
  }

  // Extreme Imbalance: any dim > 85 AND any other dim < 35
  const highDims = dimensionScores.filter((d) => d.score > 85);
  const lowDims = dimensionScores.filter((d) => d.score < 35);

  if (highDims.length > 0 && lowDims.length > 0) {
    for (const low of lowDims) {
      for (const high of highDims) {
        if (low.dimension !== high.dimension) {
          flags.push({
            type: 'Extreme Imbalance',
            dimension: low.dimension,
            score: low.score,
            severity: 'warning',
            message: `${low.dimension} (${low.score}) is critically low while ${high.dimension} (${high.score}) is very high. Consider balancing effort across dimensions.`,
          });
          break; // One flag per low dimension is sufficient
        }
      }
    }
  }

  return flags;
}

/**
 * Compute risk flags including historical comparison.
 *
 * In addition to the base flags from computeRiskFlags, adds:
 * - "Volatile": delta > 40 between consecutive checkpoints on any dimension (warning)
 */
export function computeRiskFlagsWithHistory(
  current: RiskFlagDimensionScore[],
  previous: RiskFlagDimensionScore[] | null,
  compositeScore: number = 0,
): RiskFlag[] {
  // Compute composite from current if not provided
  const composite =
    compositeScore > 0
      ? compositeScore
      : current.reduce((sum, d) => sum + d.score, 0) / (current.length || 1);

  const flags = computeRiskFlags(current, composite);

  // Volatile: delta > 40 between consecutive checkpoints
  if (previous) {
    const prevMap = new Map(previous.map((d) => [d.dimension, d.score]));
    for (const curr of current) {
      const prevScore = prevMap.get(curr.dimension);
      if (prevScore !== undefined) {
        const delta = Math.abs(curr.score - prevScore);
        if (delta > 40) {
          flags.push({
            type: 'Volatile',
            dimension: curr.dimension,
            score: curr.score,
            severity: 'warning',
            message: `${curr.dimension} changed by ${delta} points (${prevScore} -> ${curr.score}) between consecutive checkpoints.`,
          });
        }
      }
    }
  }

  return flags;
}
