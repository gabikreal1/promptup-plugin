/**
 * Decision Quality Score (DQS) computation for PromptUp.
 *
 * STANDALONE copy — no imports from @promptup/shared.
 */

import type { DecisionRow, DecisionType } from './types.js';

function countByType(decisions: DecisionRow[]): Record<DecisionType, number> {
  const counts: Record<string, number> = { steer: 0, accept: 0, reject: 0, modify: 0, validate: 0, scope: 0 };
  for (const d of decisions) counts[d.type] = (counts[d.type] || 0) + 1;
  return counts as Record<DecisionType, number>;
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeDQS(decisions: DecisionRow[], validationRate: number): number | null {
  const total = decisions.length;
  if (total === 0) return null;

  const b = countByType(decisions);

  // Autonomy: steering + rejecting + modifying vs total
  const autonomy = (b.steer + b.reject + b.modify) / total;

  // Discipline: modifications vs all acceptances
  const acceptsAndModifies = b.accept + b.modify;
  const discipline = acceptsAndModifies > 0 ? b.modify / acceptsAndModifies : 0.5;

  // Validation rate (0-1)
  const validation = clamp(0, 1, validationRate);

  // Diversity: types used (peaks at 4+)
  const typesUsed = Object.values(b).filter(v => v > 0).length;
  const diversity = Math.min(typesUsed / 4, 1);

  return clamp(0, 100, Math.round(
    autonomy * 25 + discipline * 25 + validation * 30 + diversity * 20
  ));
}
