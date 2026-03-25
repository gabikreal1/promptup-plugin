// ─── Session tracking ─────────────────────────────────────────────────────────
// ─── Classification ──────────────────────────────────────────────────────────
export function classify(score) {
    if (score <= 40)
        return 'junior';
    if (score <= 70)
        return 'middle';
    return 'senior';
}
