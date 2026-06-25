# Risk_v2 — Global Business Risk Assessment Tool
## Tool Overview Document

---

## 1. Why Is This Tool Required?

Organizations operating in 2026 face an unprecedented convergence of simultaneous, interconnected risks — geopolitical fragmentation, AI regulatory shifts, demographic workforce collapse, climate volatility, and capital market instability. Traditional risk frameworks were designed for simpler, sequential crises and fall short when multiple independent shocks amplify one another (a "polycrisis" scenario).

Risk_v2 is required because:

- **Existing frameworks are incomplete.** Legacy 8-domain risk models miss critical 2026-specific exposures such as AI regulatory liability (EU AI Act), OECD Pillar Two tax obligations, natural capital risk, and cyber-physical convergence threats.
- **No standardized cross-company benchmark exists.** Each investor, board, and executive team uses a different internal checklist, making comparison and diligence inconsistent.
- **Risk identification alone does not create action.** Most assessments end with a list of risks but provide no prioritized roadmap or accountability structure for mitigation.

---

## 2. What Problem Is It Trying to Solve?

### Problem 1 — Incomplete Risk Visibility
Organizations routinely underestimate tail risks and systemic interdependencies. Key blind spots include polycrisis amplification (when 5+ domains exceed threshold risk simultaneously), AI displacement of functional teams, founder mental health as a business continuity risk, and biodiversity/natural capital exposure in supply chains.

### Problem 2 — Information Asymmetry Between Founders and Investors
Founders and VCs/PEs approach diligence with different, often incompatible risk vocabularies. There is no shared, quantitative baseline to anchor conversations about organizational resilience, making capital allocation decisions harder and more subjective than necessary.

### Problem 3 — The Actionability Gap
Risk identification without a prioritized mitigation plan creates paralysis rather than progress. Without quantified domain-level scores and time-bounded action roadmaps, teams cannot allocate resources effectively or measure whether interventions are working.

---

## 3. Who Is the Intended User or Beneficiary?

| Persona | Primary Use Case |
|---|---|
| **Founders & CEOs** | Self-assess vulnerabilities, prepare for investor meetings, guide board discussions, track quarterly risk trajectory |
| **VC / PE Investors** | Standardized diligence scoring, portfolio risk aggregation, red-flag identification before investment |
| **CFOs & Finance Teams** | Financial risk modeling, capital structure optimization, insurance underwriting support |
| **Risk Officers & Board Members** | Quarterly risk reviews, governance reporting, compliance auditing |
| **M&A Teams** | Due diligence risk adjustments, valuation discount rate inputs |
| **Insurance Underwriters** | D&O and cyber insurance premium calibration |

**Primary go-to-market target:** Series A founders — highest pain point, highest willingness to pay, and highest need for investor-ready risk documentation.

---

## 4. What Data and Methodology Are Being Used?

### Research Inputs
- **Global Business Risks Report** — macroeconomic, geopolitical, and operational threat landscape
- **Global Strategic Risk Compendium** — deep research covering TCJA tax cliff ($4T exposure), EU AI Act enforcement (€35M fines / 7% global turnover), OECD Pillar Two minimum tax, US labor force participation rate decline to 61.1% by 2034, AI displacement rates by function (Office/Admin: 90.2%; Finance/Accounting: 84.2%), ESG controversy stock penalties (−9.1% Europe within 10 days), and billion-dollar climate events (now every 3 weeks vs. every 9 weeks in the 1980s)

### Assessment Structure
- **80 targeted questions** across 18 risk domains (4–5 questions per domain)
- **5-point Likert scale** (1 = Strongly Disagree → 5 = Strongly Agree)
- **Inverted scoring**: low agreement = high risk (`domain_risk = 100 − (average × 20)`)

### The 18 Risk Domains (3-Tier Architecture)

**Tier 1 — Strategic & Macro (30% weight)**
Strategic Risk · Financial Risk · Compliance Risk

**Tier 2 — Operational & Functional (35% weight)**
Operational Risk · Cybersecurity Risk · HR Risk · Capital Markets Risk

**Tier 3 — Contextual & Stakeholder (35% weight)**
Founder & Team Risk · Reputation Risk · ESG Risk · Supply Chain Transparency · AI & Regulatory Compliance · Market & Product Risk · Climate & Physical Risk · Investment & Equity Risk · External Risk & Litigation · Cyber-Physical Risk · Polycrisis Convergence

### Scoring Formula
```
1.  Domain Risk Score  = 100 − (average_response × 20)
2.  Flag Detection     → RED (+50pts), ORANGE (+30pts), YELLOW (+15pts)
3.  Critical domains (Founder, Cybersecurity, AI Compliance) apply 1.5× flag multiplier
4.  Weighted Score     = Σ (domain_risk × domain_weight)
5.  Stage Multiplier   → Pre-seed 1.4 | Seed 1.2 | Series A 1.0 | Series B 0.85 | Series C+ 0.7
6.  Vertical Multiplier→ Fintech 1.3 | Healthtech 1.25 | Deeptech 1.15 | SaaS B2B 1.0 | Consumer 0.9
7.  Polycrisis Check   → If 5+ domains >60, apply 1.15× multiplier
8.  Final Score        = min(100, (weighted + penalties) × stage × vertical × polycrisis)
```

---

## 5. What Output Will the Tool Generate?

### Real-Time Dashboard
- **Overall Risk Score (0–100)** with labeled rating:

  | Score | Rating |
  |---|---|
  | 0–25 | MINIMAL |
  | 26–40 | LOW |
  | 41–55 | MODERATE |
  | 56–70 | HIGH |
  | 71–85 | CRITICAL |
  | 86–100 | EXISTENTIAL |

- 18-domain **color-coded heatmap** (green → red)
- Tier-level breakdown showing which strategic pillar is weakest
- Risk flags summary (CRITICAL / ORANGE / YELLOW) with specific triggering questions identified
- Nightingale rose chart, radar chart, gauge meter, and bar visualizations

### Risk Intelligence Summary
- Top 3 highest-risk domains with business impact narrative
- Top 3 strengths with exploitation risk context
- Polycrisis convergence flag (activated when 5+ domains breach threshold simultaneously)
- Company profile context (stage, vertical, AI usage, physical product presence)

### Actionable Recommendations
- **30–90 day mitigation roadmap** with prioritized tasks, effort estimates, and responsibility assignments
- Peer benchmarking vs. similar-stage and same-vertical companies
- Historical trend comparison for repeat assessments

### PDF Export
A 5–10 page boardroom-ready report including executive summary, domain breakdown with charts, risk narrative, mitigation roadmap, and data appendix.

### Persistent Data (Supabase Backend)
- User profile and company metadata
- Full assessment history with timestamps
- Session resumption (assessment can be paused and continued)
- JSON data export for external analysis

---

## 6. How Will the Output Help in Decision-Making?

### Strategic Level (Board / C-Suite)
- Identify which domains threaten business viability and require immediate capital reallocation
- Inform fundraising timing — a score above 70 signals the company is not ready for the next financing round
- Guide capital structure decisions (debt vs. equity mix based on financial risk score)
- Enable quarterly board reporting with a single, trackable metric and domain-level accountability

### Investor / Diligence Level
- Provide a standardized 0–100 number for apples-to-apples portfolio company comparison
- Surface RED flags that direct diligence deep-dives (e.g., CRITICAL Founder Risk triggers co-founder dynamic investigation)
- Inform discount rate and WACC inputs for DCF models
- Enable fund-level risk aggregation across portfolio holdings

### Operational Level (CFO / Risk Officer)
- Calibrate insurance premiums (cyber, D&O, climate) against quantified domain scores
- Prioritize compliance remediation (tax, AI regulatory, ESG) by flag severity and cost of inaction
- Guide HR interventions when founder or burnout flags are elevated
- Direct cybersecurity budget toward highest-gap areas (SOC maturity, identity-first controls)

### Tactical Level (30–90 Day Execution)
- Eliminate analysis paralysis with a ranked, time-bounded task list
- Assign clear ownership so risk mitigation has accountable team members
- Establish a baseline to re-measure after interventions — retaking the assessment 90 days later quantifies the ROI of remediation work

### Decision Quality Improvements
1. **Removes cognitive bias** — quantitative scoring prevents over-anchoring on a single high-profile risk
2. **Reveals blind spots** — question design surfaces non-obvious exposures (polycrisis convergence, natural capital dependency, founder equity dilution)
3. **Contextualizes risk appropriately** — stage and vertical multipliers prevent pre-seed companies from being measured against series C benchmarks
4. **Creates accountability** — a shareable risk score with board or investors creates external pressure to close gaps
5. **Tracks impact over time** — historical assessment data proves whether interventions actually moved the needle

### Illustrative Example
> A Seed-stage Fintech company completes the assessment and scores **68 (HIGH)**. Domain breakdown reveals Cybersecurity at 75 (CRITICAL), Founder Risk at 70 (ORANGE), and Compliance at 62. The board decides to hire a Head of Security and bring in an executive coach for co-founder mediation. Ninety days later the team retakes the assessment and scores **52 (MODERATE)** — Cyber drops to 48, Founder to 55. The company proceeds to Series A fundraising with a documented risk improvement narrative for investors.

---

## Summary

**Risk_v2** transforms unstructured organizational risk anxiety into quantitative, comparable, and actionable intelligence calibrated for the 2026 polycrisis environment. By combining 80 evidence-based questions, an 18-domain scoring model, stage/vertical normalization, and a prioritized mitigation roadmap, it equips founders, investors, and executives to make confident decisions about capital allocation, strategic pivots, and operational resilience — despite unprecedented volatility across geopolitics, regulation, climate, workforce demographics, and technology disruption.
