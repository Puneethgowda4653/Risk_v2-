// src/utils/riskEngine.js

// -----------------------------------------------------------------------------
// 1. THE EXPANDED QUESTION POOL (~200 Questions)
// Each domain has 10-12 variations. The engine will randomly pick 4-5 per run.
// -----------------------------------------------------------------------------

export const QUESTION_POOL = {
  strategic: [
    "We have assessed alignment with government national security priorities in key markets.",
    "Our supply chain includes critical minerals subject to export controls.",
    "We have contingency plans for discriminatory procurement requirements.",
    "We actively monitor geopolitical tensions affecting sourcing regions.",
    "Our business model relies heavily on cross-border data flows that could be restricted.",
    "We have mapped exposure to 'friend-shoring' vs. 'near-shoring' supply dependencies.",
    "Our leadership team regularly reviews industrial policy shifts in top 3 revenue markets.",
    "We have identified single points of failure in our logistics network due to geopolitical friction.",
    "Our IP strategy accounts for potential state-sponsored theft or forced technology transfer.",
    "We maintain diverse banking relationships across non-aligned jurisdictions.",
    "Our product roadmap considers potential sanctions on specific hardware components."
  ],
  financial: [
    "Our business model is resilient to persistent inflation >4%.",
    "We have modeled 'higher-for-longer' interest rate scenarios.",
    "Our valuation is not dependent on inflated AI expectations.",
    "We maintain 6+ months of working capital at current burn.",
    "Unit economics remain profitable at 8%+ WACC.",
    "We have stress-tested our cash flow against a 20% currency devaluation.",
    "Our revenue concentration risk is managed (no single customer >15%).",
    "We have access to non-dilutive capital sources (debt, grants, RBF).",
    "Our pricing strategy includes automatic escalation clauses for inflation.",
    "We track leading indicators of liquidity crunches in our sector.",
    "Our cap table is optimized to prevent excessive dilution in down rounds.",
    "We have a clear path to profitability within 24 months regardless of funding."
  ],
  compliance: [
    "We audited exposure to the 2025 TCJA tax cliff.",
    "Our structure complies with OECD 15% global minimum tax.",
    "We track 'Making Tax Digital' mandates in relevant jurisdictions.",
    "We document substance-based activities for tax safe harbors.",
    "Annual compliance audits show no material gaps.",
    "We have a dedicated process for monitoring evolving AI regulations (EU AI Act).",
    "Our data retention policies align with GDPR, CCPA, and emerging global standards.",
    "We conduct regular anti-money laundering (AML) checks on all partners.",
    "Our export control classification for products is documented and reviewed quarterly.",
    "We have legal counsel specialized in the regulatory landscape of our top 3 markets.",
    "Our employee handbook is updated annually for labor law compliance in all regions.",
    "We maintain a register of all third-party processors and their compliance status."
  ],
  operational: [
    "Completed climate impact assessment of all facilities.",
    "Real-time IoT monitoring across tier-1/2 suppliers.",
    "Plans exist for maritime chokepoint disruptions (Suez, Panama).",
    "No single-region sourcing for energy-critical components.",
    "Quarterly extreme weather scenario planning conducted.",
    "We have mapped dependencies on rare earth elements.",
    "Our manufacturing partners have verified business continuity plans.",
    "We maintain strategic buffer stock for components with >12 week lead times.",
    "Our logistics providers are diversified across air, sea, and land freight.",
    "We regularly test our ability to switch primary manufacturing sites.",
    "Our operational dashboard includes real-time supply chain risk alerts.",
    "We have identified alternative suppliers for 100% of critical SKUs."
  ],
  cybersecurity: [
    "Identity-based controls are primary security architecture.",
    "Zero-trust principles adopted and tested regularly.",
    "Managed SOC services or <2 critical open incidents.",
    "Quarterly pen-testing; critical findings remediated <30 days.",
    "Incident response procedures tested in past 6 months.",
    "All employees undergo mandatory phishing simulation training quarterly.",
    "We enforce MFA for all internal and external access points.",
    "Our code repositories are scanned daily for secrets and vulnerabilities.",
    "We have an isolated backup strategy immune to ransomware encryption.",
    "Third-party vendor security assessments are mandatory before integration.",
    "We maintain cyber insurance with coverage aligned to our risk profile.",
    "Our CISO (or equivalent) reports directly to the board."
  ],
  hr: [
    "Annual surveys track burnout and mental health.",
    "Formal mental health support programs (EAP, therapy) exist.",
    "Leadership assesses retention risk and key-person dependencies.",
    "Succession plans exist for critical roles.",
    "AI displacement risks assessed with reskilling strategies.",
    "We have a documented remote/hybrid work policy that ensures equity.",
    "Our compensation bands are benchmarked annually against market rates.",
    "We track diversity metrics across all levels of the organization.",
    "Exit interviews are analyzed systematically to identify cultural issues.",
    "We have a formal mentorship program for high-potential employees.",
    "Our performance review process is calibrated to reduce bias.",
    "We offer flexible working arrangements to support work-life balance."
  ],
  capital_markets: [
    "Clear visibility into cash runway/burn rate (monthly updates).",
    "Path to profitability within 36 months demonstrated.",
    "Not dependent on a single investor/round for survival.",
    "Business model not dependent on asset value inflation.",
    "Investor base diversified across 3+ institutions.",
    "We have a rolling 18-month financial forecast updated monthly.",
    "Our fundraising pipeline is active even when not immediately raising.",
    "We understand our unit economics deeply (CAC, LTV, Payback).",
    "We have explored alternative financing (venture debt, revenue based).",
    "Our board receives detailed financial packs 5 days before meetings.",
    "We have a crisis communication plan for investors.",
    "Our valuation assumptions are conservative and defensible."
  ],
  founder: [
    "Legally binding equity agreements with departure scenarios.",
    "Formal conflict resolution mechanisms (mediation) exist.",
    "Founders actively monitor mental health (coaches/therapists).",
    "Business can continue if one founder departs.",
    "Team stress/crossover stress actively managed.",
    "Founders have clearly defined roles and decision rights.",
    "We hold regular 'state of the union' meetings for the founding team.",
    "Founders have personal financial runway separate from the company.",
    "We have a documented vision and mission that aligns the team.",
    "Founders actively seek external feedback and mentorship.",
    "We have a succession plan for the CEO role.",
    "The founding team trusts each other with sensitive information."
  ],
  reputation: [
    "Mapped potential ESG controversies and ethical exposures.",
    "Transparent ESG communication; avoiding 'greenhushing'.",
    "Incident response protocols for ethical controversies (<48h).",
    "Board reviewed reputational triggers and mitigation.",
    "Annual third-party audits of ethical/ESG claims.",
    "We monitor social sentiment and brand mentions daily.",
    "Our marketing claims are legally vetted before publication.",
    "We have a crisis communication team trained for media inquiries.",
    "Our supply chain labor practices are publicly disclosed.",
    "We engage proactively with community stakeholders.",
    "Our brand values are integrated into hiring and promotion criteria.",
    "We have a process for handling customer complaints publicly."
  ],
  esg: [
    "Assessed dependency on natural capital (pollinators, water).",
    "Supply chain labor practices meet international standards.",
    "Diversified clean energy sourcing; not grid-dependent.",
    "Climate risks mapped to physical assets annually.",
    "Adequate insurance coverage (including parametric).",
    "We have set science-based targets for carbon reduction.",
    "Our waste management strategy prioritizes circular economy principles.",
    "We measure and report on Scope 1, 2, and 3 emissions.",
    "Our investment criteria include ESG factors.",
    "We engage with suppliers to improve their ESG performance.",
    "Our product design considers end-of-life recyclability.",
    "We have a biodiversity impact assessment for our operations."
  ],
  supply_chain: [
    "Complete mapping of tier-2/3 suppliers to component level.",
    "No single supplier >20% of critical components.",
    "Proactive monitoring of end-of-life (EOL) notices.",
    "Strategic buffer inventory for extended lead times.",
    "Geographic diversification reviewed quarterly (<25% concentration).",
    "We use digital tools for real-time supply chain visibility.",
    "Our contracts with suppliers include force majeure clauses.",
    "We regularly audit supplier financial health.",
    "We have a supplier code of conduct that is enforced.",
    "Our logistics partners have redundancy built in.",
    "We collaborate with suppliers on innovation and efficiency.",
    "We track the carbon footprint of our supply chain."
  ],
  ai_compliance: [
    "Comprehensive AI system audit under EU AI Act frameworks.",
    "High-risk AI systems have bias documentation & human oversight.",
    "D&O insurance covers AI liability with retroactive dating.",
    "Fundamental Rights Impact Assessments (FRIA) completed.",
    "Living AI governance policy updated quarterly.",
    "We maintain a register of all AI models in production.",
    "Our AI training data is vetted for copyright and privacy issues.",
    "We have explainability features for all customer-facing AI decisions.",
    "Our AI systems are tested for adversarial attacks regularly.",
    "We have a process for humans to override AI decisions.",
    "Our AI vendors are contractually bound to compliance standards.",
    "We monitor emerging AI regulations globally."
  ],
  market: [
    "Product-market fit demonstrated (CAC:LTV >3:1).",
    "Competitive advantages durable (>18-24 months).",
    "Pricing validated before significant R&D investment.",
    "Contingency strategies for market vertical disruption.",
    "We have a clear understanding of our total addressable market (TAM).",
    "Our customer retention rates exceed industry benchmarks.",
    "We continuously gather and act on customer feedback.",
    "Our sales cycle is predictable and optimized.",
    "We have a diversified customer acquisition channel strategy.",
    "Our product roadmap is driven by market needs, not just tech.",
    "We monitor competitor moves and respond agilely.",
    "Our brand positioning is distinct and compelling."
  ],
  climate: [
    "Physical infrastructure exposure to extreme weather assessed.",
    "Adequate insurance coverage (parametric where relevant).",
    "Contingency plans for hurricanes/wildfires/flooding tested.",
    "Facilities located in manageable climate risk zones.",
    "We have a climate adaptation strategy for our operations.",
    "Our supply chain is resilient to climate-induced disruptions.",
    "We invest in energy efficiency measures.",
    "We participate in industry initiatives on climate action.",
    "Our real estate portfolio is assessed for climate risk.",
    "We have a plan for transitioning to renewable energy.",
    "Our employees are trained on climate safety protocols.",
    "We disclose climate risks in line with TCFD recommendations."
  ],
  investment: [
    "Cap table well-documented; dilution tracked.",
    "Founder ownership aligns with stage benchmarks.",
    "Employee option pool clarity; <30% overhang.",
    "Unit economics support current valuation.",
    "We have a clear exit strategy or long-term independence plan.",
    "Our financial reporting is transparent and accurate.",
    "We manage investor relations proactively.",
    "Our valuation is supported by comparable transactions.",
    "We have minimized liquidation preference overhang.",
    "Our board composition supports our strategic goals.",
    "We have a plan for future funding rounds.",
    "Our intellectual property is secured and valued."
  ],
  external: [
    "Litigation exposure assessed (customer, employment, IP).",
    "Litigation insurance and dispute resolution protocols in place.",
    "Exposure to geopolitical shocks analyzed.",
    "Regulatory changes and litigation trends monitored.",
    "We have a crisis management team for external threats.",
    "Our contracts limit liability appropriately.",
    "We monitor political stability in our operating regions.",
    "We have a plan for responding to black swan events.",
    "Our reputation management includes legal preparedness.",
    "We engage with policymakers on relevant issues.",
    "Our insurance coverage is reviewed annually for gaps.",
    "We have a network of external experts for crisis support."
  ],
  cyber_physical: [
    "Third-party vendors undergo security assessments.",
    "Disaster recovery tested; restore <4 hours.",
    "Incident response team trained/exercised in past 6 months.",
    "Our physical access controls are integrated with digital security.",
    "We monitor for supply chain cyber attacks.",
    "Our backup systems are air-gapped or immutable.",
    "We have a plan for restoring operations after a catastrophic event.",
    "Our employees are trained on physical security protocols.",
    "We regularly test our disaster recovery sites.",
    "Our critical infrastructure is protected against tampering.",
    "We have a communication plan for cyber-physical incidents.",
    "Our vendors adhere to our physical security standards."
  ],
  polycrisis: [
    "Scenario planning for 2+ simultaneous risk events conducted.",
    "Mitigation protocols coordinated across domains.",
    "Our leadership team understands systemic risk interdependencies.",
    "We have a 'war room' protocol for cascading failures.",
    "Our risk register is updated dynamically based on global events.",
    "We simulate complex crisis scenarios annually.",
    "Our decision-making framework accounts for uncertainty.",
    "We have redundant systems for critical functions.",
    "Our culture encourages reporting of weak signals.",
    "We collaborate with peers on shared risk intelligence.",
    "Our strategy is flexible enough to pivot during crises.",
    "We prioritize resilience over pure efficiency."
  ]
};

// Domain Metadata with Weights
export const DOMAINS = [
  { id: 'strategic', name: 'Strategic Risk', weight: 0.10, tier: 1 },
  { id: 'financial', name: 'Financial Risk', weight: 0.10, tier: 1 },
  { id: 'compliance', name: 'Compliance Risk', weight: 0.09, tier: 1 },
  { id: 'operational', name: 'Operational Risk', weight: 0.10, tier: 2 },
  { id: 'cybersecurity', name: 'Cybersecurity Risk', weight: 0.09, tier: 2 },
  { id: 'hr', name: 'HR Risk', weight: 0.08, tier: 2 },
  { id: 'capital_markets', name: 'Capital Markets', weight: 0.07, tier: 2 },
  { id: 'founder', name: 'Founder Risk', weight: 0.08, tier: 3 },
  { id: 'reputation', name: 'Reputation Risk', weight: 0.07, tier: 3 },
  { id: 'esg', name: 'ESG Risk', weight: 0.06, tier: 3 },
  { id: 'supply_chain', name: 'Supply Chain', weight: 0.06, tier: 3 },
  { id: 'ai_compliance', name: 'AI Compliance', weight: 0.06, tier: 3, conditional: 'uses_ai' },
  { id: 'market', name: 'Market Risk', weight: 0.05, tier: 3 },
  { id: 'climate', name: 'Climate Risk', weight: 0.05, tier: 3, conditional: 'physical_product' },
  { id: 'investment', name: 'Investment Risk', weight: 0.04, tier: 3 },
  { id: 'external', name: 'External Risk', weight: 0.04, tier: 3 },
  { id: 'cyber_physical', name: 'Cyber-Physical', weight: 0.03, tier: 3 },
  { id: 'polycrisis', name: 'Polycrisis', weight: 0.02, tier: 3 },
];

// -----------------------------------------------------------------------------
// 2. RANDOMIZATION ENGINE (Stratified Sampling)
// Ensures every user gets a unique set of ~80 questions while preserving weights.
// -----------------------------------------------------------------------------

export const generateUniqueAssessment = (metadata) => {
  let selectedQuestions = [];
  
  // Filter domains based on metadata (Conditional Logic)
  const activeDomains = DOMAINS.filter(d => {
    if (d.conditional === 'uses_ai' && !metadata.usesAi) return false;
    if (d.conditional === 'physical_product' && !metadata.physicalProduct) return false;
    return true;
  });

  // Calculate how many questions to pull per domain to reach ~80 total
  // We distribute proportionally based on weight, but ensure min 3, max 6 per domain
  const totalTarget = 80;
  
  activeDomains.forEach(domain => {
    const pool = QUESTION_POOL[domain.id] || [];
    
    // Determine count: Weight * Total Target, clamped between 3 and 6
    let count = Math.round(domain.weight * totalTarget);
    count = Math.max(3, Math.min(count, 6)); 
    
    // Ensure we don't ask more than available
    count = Math.min(count, pool.length);

    // Stratified Random Selection (Shuffle and Slice)
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);

    selected.forEach((text, index) => {
      selectedQuestions.push({
        id: `${domain.id}_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Unique ID
        domainId: domain.id,
        domainName: domain.name,
        text: text,
        weight: domain.weight,
        tier: domain.tier
      });
    });
  });

  // Final Shuffle so domains aren't clustered
  return selectedQuestions.sort(() => 0.5 - Math.random());
};

// -----------------------------------------------------------------------------
// 3. SCORING ENGINE
// -----------------------------------------------------------------------------

export const calculateRiskScore = (responses, metadata) => {
  const domainScores = {};
  const flags = [];
  let weightedSum = 0;
  let highRiskCount = 0;

  // Group responses by domain
  const responsesByDomain = {};
  responses.forEach(r => {
    if (!responsesByDomain[r.domainId]) responsesByDomain[r.domainId] = [];
    responsesByDomain[r.domainId].push(r.value);
  });

  const activeDomains = DOMAINS.filter(d => {
    if (d.conditional === 'uses_ai' && !metadata.usesAi) return false;
    if (d.conditional === 'physical_product' && !metadata.physicalProduct) return false;
    return true;
  });

  activeDomains.forEach(domain => {
    const vals = responsesByDomain[domain.id] || [];
    if (vals.length === 0) return;

    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const riskScore = Math.max(0, Math.min(100, 100 - (avg * 20)));
    
    domainScores[domain.id] = {
      score: riskScore,
      name: domain.name,
      weight: domain.weight,
      tier: domain.tier
    };

    if (riskScore > 60) highRiskCount++;

    // Flag Detection
    const minVal = Math.min(...vals);
    const lowCount = vals.filter(v => v <= 2).length;
    let flagType = null;
    let penalty = 0;

    if (minVal <= 1) { flagType = 'CRITICAL'; penalty = 50; }
    else if (minVal <= 2 && lowCount >= 2) { flagType = 'ORANGE'; penalty = 30; }
    else if (avg <= 2.5) { flagType = 'YELLOW'; penalty = 15; }

    if (flagType) {
      if (['founder', 'cybersecurity', 'ai_compliance'].includes(domain.id)) {
        penalty *= 1.5;
      }
      flags.push({
        domain: domain.name,
        type: flagType,
        penalty: Math.round(penalty),
        trigger: `Min: ${minVal}, Avg: ${avg.toFixed(1)}`
      });
    }

    weightedSum += riskScore * domain.weight;
  });

  const stageMult = { 'pre-seed': 1.4, 'seed': 1.2, 'series-a': 1.0, 'series-b': 0.85, 'series-c+': 0.7 }[metadata.stage] || 1.0;
  const verticalMult = { 'fintech': 1.3, 'healthtech': 1.25, 'deeptech': 1.15, 'saas-b2b': 1.0, 'consumer': 0.9, 'hardware': 1.1 }[metadata.vertical] || 1.0;
  const polycrisisMult = highRiskCount >= 5 ? 1.15 : 1.0;

  const totalPenalty = flags.reduce((sum, f) => sum + f.penalty, 0) * 0.01;
  let finalScore = (weightedSum + totalPenalty) * stageMult * verticalMult * polycrisisMult;
  finalScore = Math.round(Math.min(100, Math.max(0, finalScore)));

  let rating = 'MINIMAL';
  let color = 'text-green-600';
  if (finalScore > 25) { rating = 'LOW'; color = 'text-lime-600'; }
  if (finalScore > 40) { rating = 'MODERATE'; color = 'text-yellow-600'; }
  if (finalScore > 55) { rating = 'HIGH'; color = 'text-orange-600'; }
  if (finalScore > 70) { rating = 'CRITICAL'; color = 'text-red-600'; }
  if (finalScore > 85) { rating = 'EXISTENTIAL'; color = 'text-red-800'; }

  return {
    score: finalScore,
    rating,
    color,
    domainScores,
    flags,
    polycrisisTriggered: highRiskCount >= 5,
    highRiskCount
  };
};

// -----------------------------------------------------------------------------
// 4. PEER BENCHMARKING ENGINE (Mock Data for Demo)
// -----------------------------------------------------------------------------

export const getBenchmarkData = (metadata, userScore, domainScores) => {
  const mockPeers = {
    'saas-b2b': {
      'pre-seed': { avgScore: 58, percentile50: 55, percentile90: 35 },
      'seed': { avgScore: 52, percentile50: 48, percentile90: 30 },
      'series-a': { avgScore: 45, percentile50: 42, percentile90: 25 },
      'series-b': { avgScore: 38, percentile50: 35, percentile90: 20 },
      'series-c+': { avgScore: 32, percentile50: 30, percentile90: 15 }
    },
    'fintech': {
      'pre-seed': { avgScore: 65, percentile50: 62, percentile90: 45 },
      'seed': { avgScore: 60, percentile50: 57, percentile90: 40 },
      'series-a': { avgScore: 52, percentile50: 49, percentile90: 32 },
      'series-b': { avgScore: 45, percentile50: 42, percentile90: 28 },
      'series-c+': { avgScore: 38, percentile50: 35, percentile90: 22 }
    },
    'healthtech': {
      'pre-seed': { avgScore: 62, percentile50: 59, percentile90: 42 },
      'seed': { avgScore: 56, percentile50: 53, percentile90: 38 },
      'series-a': { avgScore: 48, percentile50: 45, percentile90: 30 },
      'series-b': { avgScore: 42, percentile50: 39, percentile90: 25 },
      'series-c+': { avgScore: 35, percentile50: 32, percentile90: 20 }
    },
    'default': {
      'pre-seed': { avgScore: 60, percentile50: 57, percentile90: 40 },
      'seed': { avgScore: 54, percentile50: 51, percentile90: 35 },
      'series-a': { avgScore: 47, percentile50: 44, percentile90: 28 },
      'series-b': { avgScore: 40, percentile50: 37, percentile90: 22 },
      'series-c+': { avgScore: 34, percentile50: 31, percentile90: 18 }
    }
  };

  const verticalKey = metadata.vertical in mockPeers ? metadata.vertical : 'default';
  const stageKey = metadata.stage in mockPeers[verticalKey] ? metadata.stage : 'seed';
  
  const peerStats = mockPeers[verticalKey][stageKey];
  
  let percentile = 50;
  if (userScore < peerStats.percentile90) percentile = 90;
  else if (userScore < peerStats.percentile50) percentile = 75;
  else if (userScore > peerStats.avgScore) percentile = 25;
  
  return {
    peerAverage: peerStats.avgScore,
    percentileRank: percentile,
    comparison: userScore < peerStats.avgScore ? 'BETTER' : userScore > peerStats.avgScore ? 'WORSE' : 'AVERAGE',
    message: userScore < peerStats.avgScore 
      ? `Your risk profile is ${peerStats.avgScore - userScore} points LOWER (better) than the average ${metadata.stage} ${metadata.vertical} company.`
      : `Your risk profile is ${userScore - peerStats.avgScore} points HIGHER (worse) than the average ${metadata.stage} ${metadata.vertical} company.`
  };
};