// src/utils/reportMetrics.js
//
// SINGLE SOURCE OF TRUTH for every aggregate/derived statistic shown to the
// user about a risk assessment result.
//
// Both the on-screen dashboard (App.tsx) and the generated report
// (riskReportHtml.js / pdfGenerator.js) import from here so their numbers can
// never drift apart. The logic below was extracted verbatim from the values
// the dashboard already computed inline (App.tsx results view) and from
// pdfGenerator.js — it is NOT re-derived or simplified. If a number needs to
// change, change it here once and both surfaces update together.
//
// `result` shape (produced by riskEngine.calculateRiskScore, or rebuilt from a
// stored row by App.reconstructResultFromRow):
//   { score, rating, color, domainScores: { [id]: {score,name,weight,tier} },
//     flags: [{domain,type,penalty,trigger}], polycrisisTriggered, highRiskCount }

import { getBenchmarkData } from './riskEngine';

// ── Band interpretation ──────────────────────────────────────────────────────
// Identical thresholds to pdfGenerator.getScoreInterpretation (the report band)
// and App.tsx _scoreLabel (the dashboard band). Kept in ONE place now.
export const getScoreInterpretation = (score) => {
  if (score <= 25) return { label: 'MINIMAL RISK', short: 'MINIMAL', description: 'Strong risk controls and governance in place' };
  if (score <= 40) return { label: 'LOW RISK', short: 'LOW', description: 'Adequate risk management with minor gaps' };
  if (score <= 55) return { label: 'MODERATE RISK', short: 'MODERATE', description: 'Significant risk areas requiring attention' };
  if (score <= 70) return { label: 'HIGH RISK', short: 'HIGH', description: 'Critical vulnerabilities present' };
  if (score <= 85) return { label: 'CRITICAL RISK', short: 'CRITICAL', description: 'Severe exposure across multiple domains' };
  return { label: 'EXISTENTIAL RISK', short: 'EXISTENTIAL', description: 'Systemic threat to business viability' };
};

// Matches App.tsx scoreColor(): the risk-score → hex used across dashboard cards.
export const scoreColor = (s) => (s > 70 ? '#ef4444' : s > 55 ? '#f97316' : s > 40 ? '#eab308' : '#22c55e');

// Per-domain band label used on the dashboard heat map / breakdown.
export const domainRiskLevel = (score) =>
  score > 60 ? 'HIGH RISK' : score > 40 ? 'MODERATE' : 'LOW RISK';

// Per-domain recommendation verb (from pdfGenerator domain rows).
export const domainAction = (score) =>
  score > 60 ? 'Immediate action required' : score > 40 ? 'Monitor and improve' : 'Continue current practices';

// Heat-map gradient bands — identical stops to the dashboard Risk Heat Map.
export const heatColor = (s) =>
  s >= 70 ? '#dc2626' : s >= 60 ? '#ef4444' : s >= 50 ? '#f97316' :
  s >= 40 ? '#f59e0b' : s >= 30 ? '#eab308' : s >= 20 ? '#84cc16' : '#22c55e';

// ── Static content maps (kept here so dashboard, PDF and HTML report agree) ───
// Domain descriptions — copied from pdfGenerator.domainExplanations so the HTML
// report and the PDF report describe each domain identically.
export const DOMAIN_EXPLANATIONS = {
  'Strategic Risk': 'Evaluates long-term viability of business model, competitive positioning, and strategic execution capability.',
  'Financial Risk': 'Reviews cash flow management, burn rate sustainability, funding runway, revenue quality, and financial controls.',
  'Compliance Risk': 'Evaluates regulatory adherence, legal obligation fulfillment, corporate governance, and board effectiveness.',
  'Operational Risk': 'Examines process maturity, vendor management, supply chain resilience, and operational efficiency.',
  'Cybersecurity Risk': 'Measures data security posture, infrastructure protection, incident response capability, and cybersecurity governance.',
  'HR Risk': 'Evaluates talent acquisition, employee retention, cultural cohesion, and organizational development.',
  'Capital Markets': 'Reviews investor relations, IPO readiness, valuation credibility, and market timing.',
  'Founder Risk': 'Assesses founder health, key person dependencies, succession planning, and founder-team alignment.',
  'Reputation Risk': 'Examines brand strength, stakeholder trust, media relations, and crisis management capability.',
  'ESG Risk': 'Evaluates environmental sustainability practices, social impact initiatives, and governance maturity.',
  'Supply Chain': 'Reviews vendor concentration, logistics resilience, procurement controls, and supply chain visibility.',
  'AI Compliance': 'Assesses AI governance, bias mitigation, regulatory compliance, and responsible AI practices.',
  'Market Risk': 'Analyzes market volatility exposure, customer concentration, demand forecasting accuracy, and competitive intensity.',
  'Climate Risk': 'Evaluates physical climate risks, transition risks, ESG alignment, and climate scenario planning.',
  'Investment Risk': 'Reviews investment decisions, capital allocation strategy, M&A integration, and diversification.',
  'External Risk': 'Assesses geopolitical exposure, regulatory changes, macroeconomic factors, and third-party dependencies.',
  'Cyber-Physical': 'Evaluates physical infrastructure security and integration with digital systems.',
  'Polycrisis': 'Measures convergence and interaction effects of multiple domain failures creating systemic risk.',
};

// Consistent per-domain accent colours for charts/legends across the report.
const DOMAIN_PALETTE = ['#1a56db', '#a21caf', '#06b6d4', '#f97316', '#10b981', '#f43f5e', '#8b5cf6', '#0ea5e9', '#eab308', '#ec4899'];
export const domainColorAt = (i) => DOMAIN_PALETTE[i % DOMAIN_PALETTE.length];

// ── The core derivation ──────────────────────────────────────────────────────
// Everything the dashboard's results view computes inline (App.tsx ~L2369-2410)
// is centralised here. The report calls this to guarantee identical numbers.
export function deriveReportMetrics(result, metadata) {
  const domainScores = result.domainScores || {};
  const flags = result.flags || [];

  // domains list + the two sorts the dashboard uses
  const domains = Object.entries(domainScores); // [id, {score,name,weight,tier}]
  const sorted = [...domains].sort(([, a], [, b]) => b.score - a.score);      // highest risk first
  const sortedAsc = [...domains].sort(([, a], [, b]) => a.score - b.score);   // lowest risk first

  // KPI cards (App.tsx rows) — computed identically
  const criticalFlags = flags.filter((f) => f.type === 'CRITICAL').length;
  const orangeFlags = flags.filter((f) => f.type === 'ORANGE').length;
  const yellowFlags = flags.filter((f) => f.type === 'YELLOW').length;
  const highPerformers = domains.filter(([, d]) => d.score <= 30).length; // low-risk domains
  const highRiskDomains = domains.filter(([, d]) => d.score > 60).length; // pdfGenerator "High-Risk Domains"
  const riskExposure = 100 - result.score;

  // Best / worst (dashboard "Strongest"/"Weakest" cards)
  const strongest = sortedAsc[0] || null; // lowest risk
  const weakest = sorted[0] || null;       // highest risk

  // Validity / confidence (App.tsx L2407-2410)
  const validityScore = Math.min(99, Math.round(85 + (domains.length / 18) * 14));
  const confidenceLabel = validityScore > 90 ? 'High Confidence' : validityScore > 70 ? 'Medium Confidence' : 'Low Confidence';

  // Band interpretation for the overall score
  const interpretation = getScoreInterpretation(result.score);

  // Deterministic peer benchmark (riskEngine.getBenchmarkData — the real,
  // non-random benchmark logic in the codebase). NOTE: the dashboard's radar
  // and bar-chart "benchmark" overlays are decorative Math.random() jitter and
  // are intentionally NOT reproduced as data here — see riskReportHtml.js.
  const benchmark = metadata ? getBenchmarkData(metadata, result.score, domainScores) : null;

  // Priority risks (dashboard "Top Priority Risks" — flags.slice(0,3))
  const priorityRisks = flags.slice(0, 3);

  // Critical domains for the action plan (pdfGenerator: score>60, top 3)
  const criticalDomains = sorted.filter(([, d]) => d.score > 60).slice(0, 3);

  return {
    domains, sorted, sortedAsc,
    criticalFlags, orangeFlags, yellowFlags,
    highPerformers, highRiskDomains, riskExposure,
    strongest, weakest,
    validityScore, confidenceLabel,
    interpretation,
    benchmark,
    priorityRisks,
    criticalDomains,
    polycrisisTriggered: !!result.polycrisisTriggered,
    totalDomains: domains.length,
    score: result.score,
    rating: result.rating || interpretation.short,
  };
}
