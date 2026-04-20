const QUESTIONS = require('./questions');

const DOMAIN_WEIGHTS = {
  strategic: 0.10, financial: 0.10, compliance: 0.09,
  operational: 0.10, cybersecurity: 0.09, hr: 0.08, capital_markets: 0.07,
  founder: 0.08, reputation: 0.07, esg: 0.06, supply_chain: 0.06, ai_compliance: 0.06,
  market: 0.05, climate: 0.05, investment: 0.04, external: 0.04,
  cyber_physical: 0.03, polycrisis: 0.02
};

const STAGE_MULTIPLIERS = { 'pre-seed': 1.4, 'seed': 1.2, 'series-a': 1.0, 'series-b': 0.85, 'series-c+': 0.7 };
const VERTICAL_MULTIPLIERS = { 'fintech': 1.3, 'healthtech': 1.25, 'deeptech': 1.15, 'saas-b2b': 1.0, 'consumer': 0.9, 'hardware': 1.1 };
const CRITICAL_DOMAINS = ['founder', 'cybersecurity', 'ai_compliance'];

function calculateScore(responses, metadata) {
  const domainResponses = {};
  for (const r of responses) {
    if (!domainResponses[r.domain]) domainResponses[r.domain] = [];
    domainResponses[r.domain].push(r.value);
  }

  let weightedSum = 0;
  const flags = [];
  const domainScores = {};
  let highRiskCount = 0;

  for (const [domain, weights] of Object.entries(DOMAIN_WEIGHTS)) {
    if (!domainResponses[domain]) continue;
    const vals = domainResponses[domain];
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const riskScore = Math.max(0, Math.min(100, 100 - (avg * 20)));
    domainScores[domain] = riskScore;

    if (riskScore > 60) highRiskCount++;

    // Flag Detection
    const min = Math.min(...vals);
    const lowCount = vals.filter(v => v <= 2).length;
    let flagType = null, penalty = 0, trigger = '';

    if (min <= 1) { 
      flagType = 'CRITICAL'; 
      penalty = 50; 
      trigger = `Critical minimum score: ${min}`;
    }
    else if (min <= 2 && lowCount >= 2) { 
      flagType = 'ORANGE'; 
      penalty = 30; 
      trigger = `Multiple low scores (${lowCount} below 2)`;
    }
    else if (avg <= 2.5) { 
      flagType = 'YELLOW'; 
      penalty = 15; 
      trigger = `Average score ${avg.toFixed(1)} indicates risk`;
    }

    if (flagType) {
      if (CRITICAL_DOMAINS.includes(domain)) penalty *= 1.5;
      flags.push({ domain, type: flagType, penalty: Math.round(penalty), trigger });
    }

    weightedSum += riskScore * weights;
  }

  const totalPenalty = flags.reduce((sum, f) => sum + f.penalty, 0) * 0.01;
  const stageMult = STAGE_MULTIPLIERS[metadata.stage] || 1.0;
  const verticalMult = VERTICAL_MULTIPLIERS[metadata.vertical] || 1.0;
  const polycrisisMult = highRiskCount >= 5 ? 1.15 : 1.0;

  let finalScore = (weightedSum + totalPenalty) * stageMult * verticalMult * polycrisisMult;
  finalScore = Math.round(Math.min(100, Math.max(0, finalScore)));

  const rating = finalScore <= 25 ? 'MINIMAL' : finalScore <= 40 ? 'LOW' : finalScore <= 55 ? 'MODERATE' : finalScore <= 70 ? 'HIGH' : finalScore <= 85 ? 'CRITICAL' : 'EXISTENTIAL';

  return {
    score: finalScore,
    rating,
    domainScores,
    flags,
    polycrisisTriggered: highRiskCount >= 5,
    metadata
  };
}

module.exports = { calculateScore };