import { OVR_WEIGHTS } from './balancing';

export function calculateOVR(attributes: any, tendency: string = 'BALANCED'): number {
  const weights = OVR_WEIGHTS[tendency] || OVR_WEIGHTS['BALANCED'];
  
  // Base core attributes that are always important in RL
  const coreAttributes = ['gameSense', 'positioning', 'consistency', 'speed'];
  
  let totalScore = 0;
  let totalWeight = 0;

  for (const [attr, value] of Object.entries(attributes)) {
    if (typeof value !== 'number') continue;
    
    let weight = 1.0;
    
    // Core attributes always have base importance
    if (coreAttributes.includes(attr)) weight += 0.2;
    
    // Apply tendency-specific weights
    if (weights[attr]) weight *= weights[attr];

    totalScore += value * weight;
    totalWeight += weight;
  }

  let ovr = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 50;
  return Math.max(1, Math.min(99, ovr)); // Clamp 1-99
}
