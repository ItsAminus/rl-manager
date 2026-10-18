import { FORM_WEIGHTS } from './balancing';

export function calculateForm(recentResults: any[], playerStats: any[]) {
  let form = 50; // Base form

  // Adjust based on last 5 games
  const recent = recentResults.slice(0, 5);
  for (const match of recent) {
    if (match.won) form += FORM_WEIGHTS.WIN;
    else form += FORM_WEIGHTS.LOSS;
  }

  // Adjust based on individual performance
  for (const stat of playerStats.slice(0, 5)) {
    if (stat.score > 400) form += FORM_WEIGHTS.MVP;
    if (stat.score < 150) form += FORM_WEIGHTS.POOR_PERFORMANCE;
  }

  return Math.max(0, Math.min(100, form));
}
