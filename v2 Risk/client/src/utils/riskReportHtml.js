// src/utils/riskReportHtml.js
//
// Generates the full multi-page Risk Assessment report as a self-contained HTML
// string, using the finalized/approved template design (CII_Report_FINAL.html)
// as the visual reference — same fonts, palette, page cards, and section
// styling (all pulled verbatim from reportAssets.js).
//
// Every number and chart is populated from deriveReportMetrics() in
// reportMetrics.js, which is the SAME logic the OrgDashboard/results dashboard
// (App.tsx) uses. The report and the dashboard therefore show identical figures
// for the same assessment, computed the same way.
//
// AI-narrative fields (result.ai_narrative, result.ai_key_insight,
// result.ai_persona_type) are honored when present on the result object, with
// null-safe fallbacks to deterministic computed copy when they are absent — so
// this generator works both for AI-augmented results and plain engine output.

import { REPORT_CSS, LOGO_DATA_URI, WAVE_SVG } from './reportAssets';
import {
  deriveReportMetrics,
  getScoreInterpretation,
  domainRiskLevel,
  domainAction,
  heatColor,
  scoreColor,
  DOMAIN_EXPLANATIONS,
  domainColorAt,
} from './reportMetrics';

// ── tiny helpers ─────────────────────────────────────────────────────────────
const esc = (v) =>
  String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const r0 = (n) => Math.round(n);
const clampPct = (n) => Math.max(0, Math.min(100, n));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// "series-a" → "Series A", "saas-b2b" → "Saas B2b" — title-cases each token.
const prettyEnum = (s) =>
  String(s || '')
    .split('-')
    .map((w) => cap(w))
    .join(' ');

// Page header / footer chrome (matches template .pg-hdr / .pg-ftr).
const hdr = (num) => `
  <div class="pg-hdr">
    <div class="brand" style="display:flex; align-items:center; gap:9px;"><img src="${LOGO_DATA_URI}" style="height:56px;" alt="Infopace"/></div>
    <div class="pg-num mono">${num} / 16</div>
  </div>`;
const ftr = `
  <div class="pg-ftr"><div>©2026 Infopace Management Pvt. Ltd. All Rights Reserved.</div><div>AI-Evaluated Report</div></div>`;

// Decorative wave motif scaled into a page corner (matches template usage).
const cornerWave = `
  <div style="position:absolute; right:0; top:0; width:300px; height:180px; overflow:hidden; z-index:0;">
    <div style="transform:scale(0.55) rotate(4deg); transform-origin:top right; width:760px; height:480px;">${WAVE_SVG}</div>
  </div>`;

// ── ARCHETYPE ────────────────────────────────────────────────────────────────
// The reference template shows a "Creative Archetype". The Risk codebase has NO
// separate archetype model — the closest existing, real classification is the
// overall risk RATING band produced by riskEngine.calculateRiskScore. We map the
// archetype to that existing band rather than inventing a new taxonomy.
// (Per project rule: don't fabricate a metric that isn't computed elsewhere.)
const RISK_ARCHETYPE = {
  MINIMAL: { name: 'The Fortified Operator', blurb: 'Risk is actively controlled across the board — the posture here is maintenance and vigilance, not remediation.' },
  LOW: { name: 'The Resilient Builder', blurb: 'A fundamentally sound risk posture with a small number of contained gaps to tighten.' },
  MODERATE: { name: 'The Exposed Challenger', blurb: 'Real momentum paired with real exposure — several domains need structured attention before they compound.' },
  HIGH: { name: 'The Vulnerable Contender', blurb: 'Critical exposures are present and interacting; a focused remediation plan is needed now, not later.' },
  CRITICAL: { name: 'The Fragile Venture', blurb: 'Severe, multi-domain exposure threatens continuity — emergency intervention and external advisory are warranted.' },
  EXISTENTIAL: { name: 'The Systemic-Risk Entity', blurb: 'Convergent failures pose a systemic threat to viability — immediate strategic action is required.' },
};

// ── COVER ────────────────────────────────────────────────────────────────────
function coverPage(metadata) {
  return `
<div class="wp-page" style="border:1px solid var(--border);">
  <div style="padding:14mm 16mm 0;"><img src="${LOGO_DATA_URI}" alt="Infopace" style="height:56px;"/></div>
  <div style="padding:14mm 16mm 0; position:relative; z-index:2;">
    <div class="wp-mono" style="font-size:11.5px; letter-spacing:.2em; text-transform:uppercase; color:#1a56db; font-weight:600; margin-bottom:6mm;">Assessment Report · Personal Edition</div>
    <div style="font-weight:800; font-size:69.0px; line-height:1.08; color:#061228; letter-spacing:-.01em;">Business Risk</div>
    <div style="font-weight:800; font-size:69.0px; line-height:1.08; color:#1a56db; letter-spacing:-.01em;">Assessment</div>
    <div style="font-size:13.8px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:#334155; margin-top:8mm;">Comprehensive Business Risk Analysis</div>
    <div style="font-size:12px; color:#475569; margin-top:4mm; line-height:1.7;">
      Prepared for <b style="color:#061228;">${esc(metadata.companyName) || '—'}</b><br/>
      ${esc(metadata.name)}${metadata.email ? ' · ' + esc(metadata.email) : ''}<br/>
      ${prettyEnum(metadata.stage)} · ${prettyEnum(metadata.vertical)}
    </div>
  </div>
  <div style="position:relative; flex:1; height:150mm; margin-top:-4mm;">
    <svg width="760" height="480" viewBox="0 0 760 480" style="position:absolute; left:-30px; bottom:0;">${WAVE_SVG.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg>
  </div>
  <div style="position:relative; z-index:2; display:flex; justify-content:space-between; align-items:flex-end; padding:0 16mm 14mm;">
    <div class="wp-mono" style="font-size:10.3px; color:#94a3b8;">Prepared By Infopace Management Pvt. Ltd.</div>
    <div style="font-weight:800; font-size:57.5px; color:#061228; line-height:1.1;">2026</div>
  </div>
</div>`;
}

// ── CONTENTS ─────────────────────────────────────────────────────────────────
function contentsPage() {
  const rows = [
    ['Our Assessment Suite', 'An overview of all five Infopace assessment tools', '03'],
    ['Executive Summary', 'Overall risk score and headline findings', '04'],
    ['Domain-by-Domain Breakdown', 'What each risk domain measures and your score', '05'],
    ['Strengths & Watch-Outs', 'Lowest-risk domain, highest-risk domain, and flags', '07'],
    ['Risk Profile & Archetype', 'The shape formed by all your domain scores together', '09'],
    ['Action Plan & Recommendations', 'Sequenced actions tied directly to your scores', '10'],
    ['Tracking Progress', '30 / 60 / 90-day review structure', '13'],
    ['Disclaimer, Privacy and Terms', '', '14'],
    ['About Infopace', '', '15'],
  ];
  const rowHtml = rows
    .map(
      ([t, s, n]) => `
    <div style="display:flex; align-items:baseline; gap:5mm; padding:5mm 0; border-bottom:1px solid var(--border);">
      <div style="font-family:'Playfair Display',serif; font-size:17px; color:#0f172a; flex-shrink:0;">${esc(t)}${s ? `<span style="display:block; font-size:9.8px; color:#94a3b8; margin-top:1mm;">${esc(s)}</span>` : ''}</div>
      <div style="flex:1; border-bottom:1px dotted #cbd5e1; margin-bottom:1.5mm;"></div>
      <div style="font-family:'IBM Plex Mono',monospace; font-size:10.5px; color:#94a3b8; flex-shrink:0;">${n}</div>
    </div>`
    )
    .join('');
  return `
<div class="wp-page">
  <div style="padding:16mm 16mm 12mm; display:flex; flex-direction:column; min-height:297mm;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12mm;">
      <img src="${LOGO_DATA_URI}" alt="Infopace" style="height:56px;"/>
      <div style="font-family:'IBM Plex Mono',monospace; font-size:10.5px; color:#94a3b8;">02 / 16</div>
    </div>
    <div style="font-family:'IBM Plex Mono',monospace; font-size:11.5px; letter-spacing:.16em; text-transform:uppercase; color:#1a56db; font-weight:600; margin-bottom:3mm;">In This Report</div>
    <div style="font-family:'Playfair Display',serif; font-size:36.8px; font-weight:700; color:#061228; margin-bottom:9mm;">Contents</div>
    ${rowHtml}
    <div style="margin-top:auto; padding-top:6mm; border-top:1px solid var(--border); display:flex; justify-content:space-between; font-size:9.5px; color:#94a3b8;">
      <div>©2026 Infopace Management Pvt. Ltd. All Rights Reserved.</div><div>AI-Evaluated Report</div>
    </div>
  </div>
</div>`;
}

// ── ASSESSMENT SUITE (static brand page, kept from template) ─────────────────
function suitePage() {
  const tools = [
    ['#a21caf', 'Market Research Assessment', 'Validates business ideas by analyzing market demand, customer needs, industry trends, and competition, enabling informed market-entry decisions.'],
    ['#06b6d4', 'Market Potential', 'Evaluates the growth potential and commercial viability of a product or business by assessing market size, demand, scalability and risk opportunities.'],
    ['#1a56db', 'Creative Innovation Index', 'Measures innovation capability by assessing creativity, problem-solving and adaptability, assisting individuals and organizations strengthen their innovation potential.'],
    ['#f97316', 'Business Risk Assessment', 'Identifies strategic, operational, financial and market risks, enabling businesses to proactively mitigate challenges and improve resilience.'],
    ['#f43f5e', 'Founder and Co-Founder Compatibility', 'Assesses alignment between founders in leadership, communication, values, and decision-making to build stronger partnerships and reduce future conflicts.'],
  ];
  const toolHtml = tools
    .map(
      ([c, t, d]) => `
    <div style="display:flex; gap:5mm; padding:4.5mm 0; border-bottom:1px solid var(--border);">
      <div style="width:3px; background:${c}; border-radius:2px; flex-shrink:0;"></div>
      <div><div style="font-weight:700; font-size:14.4px; color:#0f172a; margin-bottom:1.5mm;">${t}</div>
      <div style="font-size:11.8px; color:#475569; line-height:1.76;">${d}</div></div>
    </div>`
    )
    .join('');
  return `
<div class="wp-page">
  ${cornerWave}
  <div style="position:relative; z-index:1; padding:16mm 16mm 12mm; display:flex; flex-direction:column; min-height:297mm;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:9mm;">
      <img src="${LOGO_DATA_URI}" alt="Infopace" style="height:56px;"/>
      <div class="wp-mono" style="font-size:10.3px; color:#94a3b8;">03 / 16</div>
    </div>
    <div class="wp-mono" style="font-size:11.5px; letter-spacing:.16em; text-transform:uppercase; color:#1a56db; font-weight:600; margin-bottom:3mm;">Company Overview</div>
    <div class="wp-serif" style="font-size:36.8px; font-weight:700; color:#061228; margin-bottom:6mm;">Our Assessment Suite</div>
    <p style="font-size:12.6px; color:#334155; line-height:1.87; margin-bottom:4mm;">Over the reporting period, Infopace continued to strengthen its portfolio of AI-powered business assessment tools, delivering intelligent, data-driven solutions that assist entrepreneurs, startups, and organizations make informed strategic decisions.</p>
    <p style="font-size:12.6px; color:#334155; line-height:1.87; margin-bottom:8mm;">Each assessment leverages AI to analyze user responses and generate comprehensive reports containing actionable insights, key findings, strengths, improvement areas, and tailored recommendations. The current suite includes the following five tools:</p>
    <div class="wp-mono" style="font-size:10.3px; letter-spacing:.14em; text-transform:uppercase; color:#94a3b8; margin-bottom:2mm;">The Assessment Suite</div>
    ${toolHtml}
    <div style="margin-top:auto; padding-top:6mm; border-top:1px solid var(--border);">
      <div style="display:flex; justify-content:space-between; font-size:9.5px; color:#94a3b8; letter-spacing:.02em;"><div>©2026 Infopace Management Pvt. Ltd. All Rights Reserved.</div><div>AI-Evaluated Report</div></div>
    </div>
  </div>
</div>`;
}

// ── EXECUTIVE SUMMARY ────────────────────────────────────────────────────────
function execSummaryPage(m, result, metadata) {
  const interp = m.interpretation;
  const arche = RISK_ARCHETYPE[m.rating] || RISK_ARCHETYPE.MODERATE;
  const col = scoreColor(m.score);
  // gauge arc — semicircle from (30,130) sweeping right; fill fraction = score/100
  const frac = clampPct(m.score) / 100;
  const startA = Math.PI, endA = Math.PI - frac * Math.PI; // 180° → sweep
  const cx = 130, cy = 130, R = 100;
  const ex = cx + R * Math.cos(endA), ey = cy - R * Math.sin(endA);

  // stat boxes
  const topRisk = m.weakest ? m.weakest[1].name.replace(' Risk', '') : '—';

  // AI narrative (null-safe) or computed fallback
  const aiParas = Array.isArray(result.ai_narrative)
    ? result.ai_narrative
    : result.ai_narrative
    ? [result.ai_narrative]
    : null;
  const computedParas = [
    `This assessment evaluates <b>${m.totalDomains} active risk domains</b> tailored to a ${esc(prettyEnum(metadata.stage))} company in ${esc(prettyEnum(metadata.vertical))}. The composite risk score of <b>${m.score}%</b> places the organization in the <b>${esc(interp.label)}</b> band — ${esc(interp.description).toLowerCase()}. On this scale a lower score is better: it represents less accumulated risk exposure.`,
    `${m.highRiskDomains > 0
      ? `<b>${m.highRiskDomains}</b> of ${m.totalDomains} domains score above the 60% high-risk threshold and warrant priority attention, led by <b>${esc(m.weakest ? m.weakest[1].name : '—')}</b> at ${m.weakest ? r0(m.weakest[1].score) : 0}%.`
      : `No domain crosses the 60% high-risk threshold — exposure is spread rather than concentrated in a single failure point.`} The strongest domain is <b>${esc(m.strongest ? m.strongest[1].name : '—')}</b> at ${m.strongest ? r0(m.strongest[1].score) : 0}% risk, the most reliable part of the current posture.`,
    `Across all responses the engine surfaced <b>${m.criticalFlags} critical</b> and <b>${m.orangeFlags} elevated</b> flags. ${m.polycrisisTriggered ? 'A <b>polycrisis condition</b> was triggered (5+ high-risk domains), applying a compounding multiplier — interacting failures, not just individual ones, are the concern here.' : 'No polycrisis convergence was detected across domains.'}`,
  ];
  const paras = (aiParas || computedParas).map((p) => `<p class="body">${aiParas ? esc(p) : p}</p>`).join('');

  // glance table — ALL domains, sorted highest risk first (dashboard sort order)
  const glance = m.sorted
    .map(([, d], i) => {
      const c = heatColor(d.score);
      return `<tr><td><span class="dot" style="background:${c};"></span><span class="nm">${esc(d.name)}</span></td><td style="color:var(--inkL);">${esc(DOMAIN_EXPLANATIONS[d.name] || 'Risk domain').split(',')[0]}</td><td class="sc" style="color:${c};">${r0(d.score)}</td></tr>`;
    })
    .join('');

  const keyInsight = result.ai_key_insight
    ? esc(result.ai_key_insight)
    : `Your risk is ${m.highRiskDomains > 0 ? `concentrated in ${m.highRiskDomains} domain${m.highRiskDomains > 1 ? 's' : ''}` : 'broadly distributed'}. The single highest-leverage move is to close <b>${esc(m.weakest ? m.weakest[1].name : 'your top domain')}</b> — the domain contributing most to your overall exposure — before addressing lower-severity items.`;

  const benchLine = m.benchmark
    ? `A peer benchmark for ${esc(prettyEnum(metadata.stage))} ${esc(prettyEnum(metadata.vertical))} companies sits at <b style="color:var(--b700);">${m.benchmark.peerAverage}%</b> risk. This result is ${m.benchmark.comparison === 'BETTER' ? 'below (better than)' : m.benchmark.comparison === 'WORSE' ? 'above (worse than)' : 'in line with'} that peer average, placing it around the <b>${m.benchmark.percentileRank}th percentile</b>.`
    : '';

  return `
<div class="page">
  ${hdr('04')}
  <div class="eyebrow">Section One</div>
  <div class="pg-title">Executive Summary</div>
  <div class="pg-sub">A single-page overview of your overall risk profile — your score, what it means, and where your exposure concentrates. Lower scores indicate lower risk.</div>

  <div class="gauge-wrap">
    <svg width="190" height="110" viewBox="0 0 260 150">
      <path d="M 30 130 A 100 100 0 0 1 230 130" fill="none" stroke="#e2e8f0" stroke-width="18" stroke-linecap="round"/>
      <path d="M 30 130 A 100 100 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="${col}" stroke-width="18" stroke-linecap="round"/>
      <text x="130" y="108" text-anchor="middle" class="gauge-num" style="fill:${col};">${m.score}</text>
      <text x="130" y="130" text-anchor="middle" class="gauge-label mono">RISK SCORE / 100</text>
    </svg>
    <div>
      <div class="tag-pill" style="background:${col}22; color:${col};">${esc(interp.short)} RISK</div>
      <div class="persona-name">${esc(result.ai_persona_type || arche.name)}</div>
    </div>
  </div>

  <div class="stat-row">
    <div class="stat-box"><div class="n">${m.score}</div><div class="l">Overall Score</div></div>
    <div class="stat-box"><div class="n">${m.riskExposure}%</div><div class="l">Risk Exposure</div></div>
    <div class="stat-box"><div class="n">${m.highRiskDomains}/${m.totalDomains}</div><div class="l">High-Risk Domains</div></div>
    <div class="stat-box"><div class="n">${esc(topRisk)}</div><div class="l">Top Risk</div></div>
  </div>
  ${benchLine ? `<p style="font-size:9.5px; color:var(--inkL); margin:6px 0 4px; line-height:1.5;">${benchLine}</p>` : ''}

  <h3 class="sec">Summary</h3>
  ${paras}

  <div class="callout" style="background:#f8fafc; border-color:var(--border);">
    <span class="lbl" style="color:#475569;">Assessment Validity</span>
    Based on ${m.totalDomains} domains analyzed, this result carries a validity score of <b>${m.validityScore}%</b> (${esc(m.confidenceLabel)}). Scores are directional indicators calibrated to your stage and vertical, not absolute measurements.
  </div>

  <h3 class="sec">All Domains At A Glance</h3>
  <table class="glance-table">${glance}</table>

  <div class="callout insight">
    <span class="lbl">Key Insight</span>
    ${keyInsight}
  </div>
  ${ftr}
</div>`;
}

// ── DIMENSION BREAKDOWN (paginated) ──────────────────────────────────────────
function dimensionBlock(id, d, idx, m) {
  const band = domainRiskLevel(d.score);
  const c = heatColor(d.score);
  const bench = m.benchmark ? m.benchmark.peerAverage : null;
  const delta = bench != null ? r0(d.score) - bench : null;
  const deltaTxt = delta != null ? ` · Peer avg ${bench} (${delta >= 0 ? '+' : ''}${delta})` : '';
  const desc = DOMAIN_EXPLANATIONS[d.name] || 'Risk domain assessment.';
  return `
  <div class="dim-block">
    <div class="dim-score-col"><div class="n" style="color:${c};">${r0(d.score)}</div><div class="band">${esc(band)}</div></div>
    <div class="dim-body">
      <div class="dim-name">${esc(d.name)} <span style="font-weight:400; color:var(--inkL); font-size:9px;">· ${esc(band)}${deltaTxt} · Weightage ${r0((d.weight || 0) * 100)}% of overall score</span></div>
      <div class="dim-desc">${esc(desc)}</div>
      <div class="dim-tell">In practice: ${d.score > 60 ? 'this is an active exposure requiring near-term remediation — ' + esc(domainAction(d.score).toLowerCase()) + '.' : d.score > 40 ? 'a moderate exposure worth structured monitoring and steady improvement.' : 'a well-controlled area — maintain current practices and re-check periodically.'}</div>
      <div class="dim-extra"><span class="k">Recommended posture:</span> ${esc(domainAction(d.score))}${(d.tier === 1) ? ' — this is a Tier-1 (highest-weight) domain, so movement here moves the overall score most.' : '.'}</div>
    </div>
  </div>`;
}

function dimensionPages(m) {
  // Sorted highest-risk-first (same order as dashboard). Paginate ~5 per page.
  const perPage = 5;
  const chunks = [];
  for (let i = 0; i < m.sorted.length; i += perPage) chunks.push(m.sorted.slice(i, i + perPage));
  const total = chunks.length;
  return chunks
    .map((chunk, pi) => {
      const blocks = chunk.map(([id, d], i) => dimensionBlock(id, d, pi * perPage + i, m)).join('');
      const pageNum = String(5 + pi).padStart(2, '0');
      return `
<div class="page">
  ${hdr(pageNum)}
  <div class="eyebrow">Section Two${total > 1 ? (pi === 0 ? '' : ', Continued') : ''}</div>
  <div class="pg-title">Domain-by-Domain Breakdown</div>
  <div class="pg-sub">What each domain measures, your risk score, and what it looks like in practice.${total > 1 ? ` Part ${pi + 1} of ${total}.` : ''} Domains are ordered highest-risk first.</div>
  ${blocks}
  ${ftr}
</div>`;
    })
    .join('');
}

// ── STRENGTHS, GROWTH & WATCH-OUTS ───────────────────────────────────────────
function strengthsPage(m, pageNum) {
  const strongest = m.strongest ? m.strongest[1] : null;
  const weakest = m.weakest ? m.weakest[1] : null;
  const bench = m.benchmark ? m.benchmark.peerAverage : null;

  // Spread rows — each domain's risk vs peer average line (deterministic).
  // NOTE: the dashboard's per-domain benchmark bars use decorative Math.random()
  // jitter; that is intentionally NOT reproduced. The stable peer average from
  // riskEngine.getBenchmarkData is used instead so the report is reproducible.
  const spread = m.sorted
    .map(([, d]) => {
      const c = heatColor(d.score);
      const delta = bench != null ? r0(d.score) - bench : 0;
      return `<div class="spread-row"><div class="spread-label">${esc(d.name.replace(' Risk', ''))}</div><div class="spread-track"><div class="spread-fill" style="width:${clampPct(d.score)}%; background:${c};"></div>${bench != null ? `<div class="spread-avg" style="left:${clampPct(bench)}%;"></div>` : ''}</div><div class="spread-val mono">${delta >= 0 ? '+' : ''}${delta}</div></div>`;
    })
    .join('');

  // Watch-outs derived from real flags (dashboard "Top Priority Risks").
  const flagRows = m.priorityRisks.length
    ? m.priorityRisks
        .map(
          (f) =>
            `<div class="flag-row warn"><b>⚠</b><div><b>${esc(f.domain)} — ${esc(f.type)} flag:</b> triggered by ${esc(f.trigger)}, adding ${f.penalty} points of weighted penalty. This is one of the specific response patterns driving the overall score up.</div></div>`
        )
        .join('')
    : `<div class="flag-row good"><b>✓</b><div><b>No critical flags:</b> no single response pattern crossed the critical or elevated flag thresholds in this assessment.</div></div>`;

  const goodRow =
    m.highPerformers > 0
      ? `<div class="flag-row good"><b>✓</b><div><b>${m.highPerformers} low-risk domain${m.highPerformers > 1 ? 's' : ''}:</b> scoring at or below 30% — a genuine foundation to build the higher-risk domains on, rather than starting from scratch.</div></div>`
      : '';

  return `
<div class="page">
  ${hdr(pageNum)}
  <div class="eyebrow">Section Three</div>
  <div class="pg-title">Strengths, Growth Areas &amp; Watch-Outs</div>
  <div class="pg-sub">Your single lowest-risk domain, your single highest-risk domain, and the specific flags worth being aware of.</div>

  <div class="analysis-cards">
    <div class="a-card up">
      <div class="a-card-label">↓ Lowest-Risk Domain</div>
      <div class="a-card-score">${strongest ? r0(strongest.score) : 0}</div>
      <div class="a-card-dim">${esc(strongest ? strongest.name : '—')}</div>
      <div class="a-card-desc">Your most reliable area — the strongest part of the current risk posture. Lean on the practices already working here and hold the line as other domains improve.</div>
    </div>
    <div class="a-card down">
      <div class="a-card-label">↑ Highest-Risk Domain</div>
      <div class="a-card-score">${weakest ? r0(weakest.score) : 0}</div>
      <div class="a-card-dim">${esc(weakest ? weakest.name : '—')}</div>
      <div class="a-card-desc">The clearest lever for lowering your overall score — see the targeted actions later in this report. ${weakest && weakest.tier === 1 ? 'As a Tier-1 domain, improvement here moves the composite score the most.' : 'Addressing this reduces the largest single share of current exposure.'}</div>
    </div>
  </div>

  <h3 class="sec">Domain Risk vs. Peer Average</h3>
  ${spread}

  <h3 class="sec">Watch-Outs</h3>
  ${flagRows}
  ${goodRow}
  ${ftr}
</div>`;
}

// ── RISK PROFILE & ARCHETYPE (radar) ─────────────────────────────────────────
function radarPolygon(scores, cx, cy, R, fracFn) {
  const n = scores.length;
  return scores
    .map((s, i) => {
      const a = (2 * Math.PI * i) / n - Math.PI / 2;
      const fr = fracFn(s);
      return `${(cx + fr * R * Math.cos(a)).toFixed(1)},${(cy + fr * R * Math.sin(a)).toFixed(1)}`;
    })
    .join(' ');
}

function archetypePage(m, metadata, pageNum) {
  const arche = RISK_ARCHETYPE[m.rating] || RISK_ARCHETYPE.MODERATE;
  // radar over up to 10 domains (dashboard uses domains.slice(0,10))
  const radar = m.domains.slice(0, 10).map(([, d]) => d);
  const cx = 140, cy = 120, R = 92;
  const userScores = radar.map((d) => d.score);
  const userPoly = radarPolygon(userScores, cx, cy, R, (s) => clampPct(s) / 100);
  const bench = m.benchmark ? m.benchmark.peerAverage : null;
  const benchPoly = bench != null ? radarPolygon(radar.map(() => bench), cx, cy, R, (s) => clampPct(s) / 100) : null;
  const gridPolys = [0.25, 0.5, 0.75, 1]
    .map((f) => `<polygon points="${radarPolygon(radar.map(() => 100), cx, cy, R, () => f)}" fill="none" stroke="#e2e8f0" stroke-width="1"/>`)
    .join('');
  const axes = radar
    .map((d, i) => {
      const a = (2 * Math.PI * i) / radar.length - Math.PI / 2;
      const ex = cx + R * Math.cos(a), ey = cy + R * Math.sin(a);
      const lx = cx + 1.16 * R * Math.cos(a), ly = cy + 1.16 * R * Math.sin(a);
      return `<line x1="${cx}" y1="${cy}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#e2e8f0"/><text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="8" font-weight="700" fill="#0f172a">${esc(d.name.replace(' Risk', '').substring(0, 8))}</text>`;
    })
    .join('');

  const list = m.domains
    .slice(0, 10)
    .map(([, d], i) => {
      const c = heatColor(d.score);
      return `<div class="dim-list-row"><div class="dot" style="background:${c};"></div>${esc(d.name.replace(' Risk', ''))}<div class="bar"><div class="fill" style="width:${clampPct(d.score)}%; background:${c};"></div></div><div class="val">${r0(d.score)}</div></div>`;
    })
    .join('');

  return `
<div class="page">
  ${hdr(pageNum)}
  <div class="eyebrow">Section Five</div>
  <div class="pg-title">Your Risk Profile &amp; Archetype</div>
  <div class="pg-sub">All your domain scores plotted together form a distinct shape — here's what yours looks like, and the risk archetype it maps to. The archetype is derived from your overall risk rating band.</div>

  <div class="radar-flex">
    <svg width="250" height="250" viewBox="0 0 280 260" style="flex-shrink:0;">
      ${gridPolys}
      ${axes}
      ${benchPoly ? `<polygon points="${benchPoly}" fill="var(--border)" fill-opacity="0.45" stroke="#9bb0c9" stroke-width="1.5" stroke-dasharray="3 3"/>` : ''}
      <polygon points="${userPoly}" fill="${scoreColor(m.score)}" fill-opacity="0.18" stroke="${scoreColor(m.score)}" stroke-width="2.5"/>
    </svg>
    <div style="flex:1;">
      <div class="archetype-box">
        <div class="lbl">Risk Archetype</div>
        <div class="archetype-name">${esc(arche.name)}</div>
      </div>
      ${list}
    </div>
  </div>

  <h3 class="sec">What This Archetype Means</h3>
  <p class="body">${esc(arche.blurb)} This label is mapped directly from your <b>${esc(m.interpretation.label)}</b> overall band (score ${m.score}%) — it is a plain-language summary of that rating, not a separate score.</p>

  <h3 class="sec">Reading The Shape</h3>
  <p class="body">Each spoke is one risk domain; the further a point sits from the centre, the higher the risk in that domain. ${bench != null ? 'The dashed shape is the peer average for your stage and vertical — anywhere your solid shape extends <b>past</b> the dashed line, you carry more risk than comparable companies; anywhere it sits <b>inside</b> it, you carry less.' : ''} A balanced shape means risk is spread evenly; a spiky shape means one or two domains dominate your exposure.</p>

  <div class="callout">The domain contributing most to the overall score is <b>${esc(m.weakest ? m.weakest[1].name : '—')}</b> (${m.weakest ? r0(m.weakest[1].score) : 0}%). Pulling that spoke inward is the fastest way to change the overall shape.</div>
  ${ftr}
</div>`;
}

// ── ACTION PLAN OVERVIEW ─────────────────────────────────────────────────────
function actionPlanPage(m, pageNum) {
  // Top risk domains drive the actions (same set the dashboard prioritises).
  const targets = (m.criticalDomains.length ? m.criticalDomains : m.sorted.slice(0, 3)).map(([, d]) => d);
  const rows = targets
    .map((d, i) => {
      const c = heatColor(d.score);
      return `<tr><td class="mono">${i + 1}</td><td>Reduce exposure in ${esc(d.name.toLowerCase())}</td><td><span class="seq-dim-tag" style="background:${c};">${esc(d.name.replace(' Risk', ''))}</span></td><td>${d.score > 60 ? 'Immediate' : 'This quarter'}</td></tr>`;
    })
    .join('');
  const seqRows = targets
    .map((d, i) => {
      const wk = ['Week 1', 'Week 3', 'Week 6'][i] || `Week ${1 + i * 3}`;
      return `<tr><td class="seq-week">${wk}</td><td><b>Action ${i + 1}</b> — ${esc(d.name.replace(' Risk', ''))}</td><td>${i === 0 ? 'Highest-risk domain first — this moves the overall score the most.' : 'Layer in once the prior action has a stable owner and cadence.'}</td></tr>`;
    })
    .join('');

  return `
<div class="page">
  ${hdr(pageNum)}
  <div class="eyebrow">Section Six</div>
  <div class="pg-title">Action Plan &amp; Recommendations</div>
  <div class="pg-sub">Actions tied directly to your highest-risk domains, sequenced rather than tackled all at once.</div>

  <h3 class="sec" style="margin-top:6px;">Priority Actions at a Glance</h3>
  <table class="summary-table">
    <tr><th>#</th><th>Action</th><th>Targets</th><th>Timing</th></tr>
    ${rows || '<tr><td class="mono">—</td><td>No high-risk domains — maintain current controls</td><td></td><td>Ongoing</td></tr>'}
  </table>

  <h3 class="sec">Suggested Sequence — Don't Start All At Once</h3>
  <p class="body">Trying to remediate every domain simultaneously is the most common way a risk plan quietly fails — too much change at once, with no single control given the chance to embed. Phase the priority actions in over the first eight weeks instead, starting with the highest-risk domain.</p>
  <table class="seq-table">
    <tr><th>Timing</th><th>Add</th><th>Why This Order</th></tr>
    ${seqRows || '<tr><td class="seq-week">Ongoing</td><td>Maintain controls</td><td>No high-risk domains detected this cycle.</td></tr>'}
  </table>

  <div class="callout" style="background:#fffbeb; border-color:#fde68a;">
    <span class="lbl" style="color:#b45309;">If You Can Only Start One</span>
    Start with <b>${esc(m.weakest ? m.weakest[1].name : 'your highest-risk domain')}</b> — it is the single largest contributor to your overall score, so progress here shows up fastest on a re-assessment.
  </div>
  ${ftr}
</div>`;
}

// ── RECOMMENDED ACTIONS DETAIL ───────────────────────────────────────────────
function recommendedDetailPage(m, pageNum) {
  const targets = (m.criticalDomains.length ? m.criticalDomains : m.sorted.slice(0, 3)).map(([, d]) => d);
  const items = targets
    .map((d, i) => {
      const c = heatColor(d.score);
      return `
  <div class="action-item">
    <div class="action-num" style="background:${c};">${i + 1}</div>
    <div><div class="action-dim" style="color:${c};">${esc(d.name)} · ${r0(d.score)}%</div>
    <div class="action-text">Assign an executive sponsor to ${esc(d.name.toLowerCase())} and build a 90-day remediation roadmap with specific, measurable milestones.</div>
    <div class="action-why">Why: at ${r0(d.score)}% this is a ${esc(domainRiskLevel(d.score).toLowerCase())} domain${d.tier === 1 ? ' with the highest weighting' : ''} — ${esc(domainAction(d.score).toLowerCase())}.</div>
    <div class="action-signal">How to know it's working: on the next assessment, this domain's score should drop out of the high-risk band (below 60%), and its weighted contribution to the overall score should visibly shrink.</div>
    <div class="action-obstacle">Likely obstacle: remediation scope expands until it feels too big to finish.</div>
    <div class="action-stuck">If you get stuck: cut scope, not the deadline — a smaller control that actually ships beats a comprehensive one that doesn't.</div></div>
  </div>`;
    })
    .join('');

  return `
<div class="page">
  ${hdr(pageNum)}
  <div class="eyebrow">Section Six, Continued</div>
  <div class="pg-title">Recommended Actions</div>
  <div class="pg-sub">Full detail for each priority action, including how to know it's working and what to do if it stalls.</div>
  <h3 class="sec" style="margin-top:8px;">Targeting Your Highest-Risk Domains</h3>
  ${items || '<p class="body">No high-risk domains were detected. Maintain existing controls and re-assess on the normal cadence.</p>'}
  <div class="callout" style="margin-top:14px;">These actions target your highest-scoring risk domains — the levers most likely to lower your overall score on a future assessment.</div>
  ${ftr}
</div>`;
}

// ── TRACKING ─────────────────────────────────────────────────────────────────
function trackingPage(m, pageNum) {
  const targets = (m.criticalDomains.length ? m.criticalDomains : m.sorted.slice(0, 2)).map(([, d]) => d);
  const targetBars = targets
    .map((d) => {
      const c = heatColor(d.score);
      const goal = Math.max(0, r0(d.score) - 15); // aim to drop ~15pts (below high-risk band)
      return `
  <div style="margin:3mm 0 6mm;">
    <div style="display:flex; justify-content:space-between; font-size:9.5px; margin-bottom:1.5mm;"><span style="font-weight:600; color:#0f172a;">${esc(d.name)}</span><span class="mono" style="color:#64748b;">${r0(d.score)} → ${goal} target</span></div>
    <div style="height:7px; background:#f1f5f9; border-radius:4px; position:relative;">
      <div style="height:100%; width:${clampPct(d.score)}%; background:${c}; border-radius:4px;"></div>
      <div style="position:absolute; top:-2px; left:${clampPct(goal)}%; width:2px; height:11px; background:#0f172a;"></div>
    </div>
  </div>`;
    })
    .join('');
  const weeks = Array.from({ length: 8 }, (_, i) => `<div style="flex:1; text-align:center;"><div style="height:9mm; border:1.5px solid #cbd5e1; border-radius:6px; background:#f8fafc;"></div><div class="mono" style="font-size:7.5px; color:#94a3b8; margin-top:1.5mm;">W${i + 1}</div></div>`).join('');

  return `
<div class="page">
  ${hdr(pageNum)}
  <div class="eyebrow">Section Seven</div>
  <div class="pg-title">Tracking Your Progress</div>
  <div class="pg-sub">A simple structure for checking in on this plan — without it, even a good plan tends to quietly fade after week two.</div>

  <div style="display:flex; align-items:flex-start; margin:8mm 0 9mm; position:relative;">
    <div style="position:absolute; top:5.5mm; left:6%; right:6%; height:2px; background:#e2e8f0;"></div>
    <div style="position:absolute; top:5.5mm; left:6%; width:88%; height:2px; background:linear-gradient(90deg, #1a56db 0%, #1a56db 22%, #cbd5e1 22%);"></div>
    ${['DAY 0|Baseline set', 'DAY 30|Controls forming', 'DAY 60|Momentum check', 'DAY 90|Re-assessment']
      .map((t, i) => {
        const [d, l] = t.split('|');
        const active = i === 0;
        return `<div style="flex:1; text-align:center; position:relative;"><div style="width:11px; height:11px; border-radius:50%; background:${active ? '#1a56db' : '#fff'}; margin:0 auto 3mm; border:${active ? '3px solid #dbeafe' : '2px solid #cbd5e1'};"></div><div class="mono" style="font-size:9px; font-weight:700; color:${active ? '#1a56db' : '#334155'};">${d}</div><div style="font-size:9px; color:#64748b; margin-top:1mm;">${l}</div></div>`;
      })
      .join('')}
  </div>

  <h3 class="sec">Weekly Check-In</h3>
  <p class="body">Each week, answer one question honestly: did this week's active remediation action actually happen? Not intent — did it happen.</p>
  <div style="display:flex; gap:2.5mm; margin:4mm 0 7mm;">${weeks}</div>

  <h3 class="sec">Score Targets — Where This Plan Is Aimed</h3>
  ${targetBars || '<p class="body">No high-risk domains to target — maintain current controls.</p>'}
  <div style="font-size:8.5px; color:#94a3b8; margin-bottom:6mm;">Dark tick mark shows the 90-day target for each domain's risk score (lower is better).</div>

  <h3 class="sec">Checkpoint Details</h3>
  <p class="body">By day 30: each priority domain should have a named owner and an active remediation plan. By day 60: honestly assess whether the highest-risk domains feel like they are improving in daily practice — the felt change usually precedes the score change. At day 90: retake the assessment and compare directly against this report's baseline. A 10+ point drop on your top domain is a strong signal the plan is working.</p>

  <div class="callout">This tracking structure works best kept lightweight — the goal is a two-minute weekly glance, not a new project to manage on top of the remediation itself.</div>
  ${ftr}
</div>`;
}

// ── DISCLAIMER (verbatim from template) ──────────────────────────────────────
function disclaimerPage() {
  return `
<div class="wp-page">
  ${cornerWave}
  <div style="position:relative; z-index:1; padding:16mm 16mm 12mm; display:flex; flex-direction:column; min-height:297mm;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:9mm;">
      <img src="${LOGO_DATA_URI}" alt="Infopace" style="height:56px;"/>
      <div class="wp-mono" style="font-size:10.3px; color:#94a3b8;">14 / 16</div>
    </div>
    <div class="wp-serif" style="font-size:28.7px; font-weight:700; color:#061228; margin-bottom:8mm; white-space:nowrap;">Disclaimer, Privacy and Terms</div>
    <div style="display:flex; gap:5mm; margin-bottom:7mm;">
      <div style="width:11mm; height:11mm; border-radius:10px; background:#fff7ed; display:flex; align-items:center; justify-content:center; font-size:18.4px; flex-shrink:0;">&#9888;</div>
      <div><div class="wp-serif" style="font-size:17.2px; font-weight:700; color:#061228; margin-bottom:2mm;">Disclaimer</div>
      <div style="font-size:11.7px; color:#334155; line-height:1.78; text-align:left;"><p style="margin-bottom:2mm;">The <b>AI-evaluated assessment report</b> is intended for informational and decision-support purposes only. Results are based on the information provided by the user and AI-driven analysis and should not be considered legal, financial, investment, or professional advice.</p><p style="margin-bottom:2mm;">Users are encouraged to validate critical decisions with relevant experts before taking action. Infopace makes no representation or warranty as to the completeness or accuracy of AI-evaluated interpretations, and scores should be read as directional indicators rather than absolute measurements.</p></div></div>
    </div>
    <div style="display:flex; gap:5mm; margin-bottom:7mm;">
      <div style="width:11mm; height:11mm; border-radius:10px; background:#f0fdf4; display:flex; align-items:center; justify-content:center; font-size:18.4px; flex-shrink:0;">&#128274;</div>
      <div><div class="wp-serif" style="font-size:17.2px; font-weight:700; color:#061228; margin-bottom:2mm;">Privacy Policy</div>
      <div style="font-size:11.7px; color:#334155; line-height:1.78; text-align:left;"><p style="margin-bottom:2mm;">All information shared during the assessment is handled with confidentiality and used solely for generating personalized assessment reports and improving the quality of the assessment platform.</p><p style="margin-bottom:2mm;">User data is processed securely and is not shared with third parties without consent, except where required by applicable law. Individual open-ended responses are never used to train external models or shared outside Infopace's assessment infrastructure.</p></div></div>
    </div>
    <div style="display:flex; gap:5mm; margin-bottom:7mm;">
      <div style="width:11mm; height:11mm; border-radius:10px; background:#eff6ff; display:flex; align-items:center; justify-content:center; font-size:18.4px; flex-shrink:0;">&#128196;</div>
      <div><div class="wp-serif" style="font-size:17.2px; font-weight:700; color:#061228; margin-bottom:2mm;">Terms and Conditions</div>
      <div style="font-size:11.7px; color:#334155; line-height:1.78; text-align:left;"><p style="margin-bottom:2mm;">By using Infopace's AI-powered assessment tools, users acknowledge that the assessment results are generated based on the information they provide and the AI-driven evaluation methodology. The reports are intended to support decision-making and should not be considered a substitute for professional legal, financial, or business advice.</p><p style="margin-bottom:2mm;">Users are responsible for ensuring the accuracy of the information submitted and for any decisions or actions taken based on the report. Infopace does not guarantee specific business outcomes or success resulting from the recommendations provided.</p><p style="margin-bottom:2mm;">All assessment content, methodologies, reports, and related intellectual property remain the exclusive property of Infopace and may not be copied, reproduced, modified, or distributed without prior written consent.</p></div></div>
    </div>
    <div style="margin-top:auto; padding-top:6mm; border-top:1px solid var(--border);">
      <div style="display:flex; justify-content:space-between; font-size:9.5px; color:#94a3b8; letter-spacing:.02em;"><div>©2026 Infopace Management Pvt. Ltd. All Rights Reserved.</div><div>AI-Evaluated Report</div></div>
    </div>
  </div>
</div>`;
}

// ── ABOUT (verbatim from template) ───────────────────────────────────────────
function aboutPage() {
  const what = ['Growth Acceleration Partner', 'Global Capabilities Center', 'Strategic Change Management', 'Strategic Investment and Funding', 'Data Analytics Solutions', 'Digital Transformation'];
  const bullets = what
    .map(
      (w) => `<div style="display:flex; align-items:flex-start; gap:3mm; padding:1.6mm 0;"><div style="width:5px; height:5px; border-radius:50%; background:#1a56db; flex-shrink:0; margin-top:1.5mm;"></div><div style="font-size:9.8px; color:#334155; line-height:1.4;">${w}</div></div>`
    )
    .join('');
  return `
<div class="wp-page" style="display:flex; flex-direction:column; padding:0;">
  <div style="padding:16mm 16mm 4mm;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:7mm;">
      <img src="${LOGO_DATA_URI}" alt="Infopace" style="height:56px;"/>
      <div class="wp-mono" style="font-size:10.3px; color:#94a3b8;">15 / 16</div>
    </div>
    <div class="wp-serif" style="font-size:34px; font-weight:700; color:#061228; line-height:1.1; margin-bottom:5mm;">About <span style="color:#1a56db;">Infopace</span></div>
    <div style="font-size:11.2px; color:#334155; line-height:1.68; text-align:left;">
      <p style="margin-bottom:2.5mm;">Infopace Management Pvt. Ltd is a Bengaluru-based strategic change management and business transformation company established in 1999, providing advisory and technology-driven solutions that help businesses improve operational efficiency, accelerate growth and adapt to changing market conditions.</p>
      <p style="margin-bottom:2.5mm;">Our approach combines deep sector expertise with data-driven methodology — every engagement begins with understanding the specific operational and market context a client is working within, rather than applying a generic playbook. This is the same philosophy behind the AI-powered assessment tools used to generate this report: structured, evidence-based, and built to reflect the individual, not a template.</p>
    </div>
    <div style="margin-top:5mm;">
      <div class="wp-mono" style="font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:#94a3b8; margin-bottom:2mm;">What We Do</div>
      <div style="display:flex; gap:8mm;"><div style="flex:1;">${bullets}</div></div>
    </div>
  </div>
</div>`;
}

// ── PUBLIC API ───────────────────────────────────────────────────────────────
// Returns the full HTML document string for the risk report.
export function generateRiskReportHTML(result, metadata) {
  const m = deriveReportMetrics(result, metadata);

  // Page numbering after the two fixed breakdown-adjacent sections is dynamic
  // because the domain breakdown can span multiple pages for any headcount of
  // domains. We compute the running page number so the "NN / 16" chrome stays
  // sensible even when the domain list is long or short.
  const dimPageCount = Math.max(1, Math.ceil(m.sorted.length / 5));
  let p = 5 + dimPageCount; // first page after the dimension breakdown pages
  const strengthsNum = String(p++).padStart(2, '0');
  const archetypeNum = String(p++).padStart(2, '0');
  const actionNum = String(p++).padStart(2, '0');
  const detailNum = String(p++).padStart(2, '0');
  const trackingNum = String(p++).padStart(2, '0');

  const body = [
    coverPage(metadata),
    contentsPage(),
    suitePage(),
    execSummaryPage(m, result, metadata),
    dimensionPages(m),
    strengthsPage(m, strengthsNum),
    archetypePage(m, metadata, archetypeNum),
    actionPlanPage(m, actionNum),
    recommendedDetailPage(m, detailNum),
    trackingPage(m, trackingNum),
    disclaimerPage(),
    aboutPage(),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Risk Assessment Report — ${esc(metadata.companyName || metadata.name || 'Infopace')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${REPORT_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

// Convenience: build the report and trigger a browser download of the .html.
// Returns { blob, filename } so callers can also upload it (mirrors generatePDF).
export function downloadRiskReport(result, metadata) {
  const html = generateRiskReportHTML(result, metadata);
  const blob = new Blob([html], { type: 'text/html' });
  const filename = `Risk_Assessment_${String(metadata.companyName || metadata.name || 'report').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { blob, filename };
}

export default generateRiskReportHTML;
