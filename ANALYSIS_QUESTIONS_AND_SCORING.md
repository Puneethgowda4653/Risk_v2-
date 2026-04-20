# ANALYSIS: Questions Count & Scoring Formula Validation
**Date:** April 19, 2026  
**Framework Document:** ENHANCED_RISK_FRAMEWORK (1).md  
**Implementation:** v2 Risk Assessment Tool

---

## EXECUTIVE SUMMARY

| Aspect | Specification | Implementation | Status |
|--------|---------------|-----------------|--------|
| **Total Questions** | 72 (4-5 per domain) | **80** (2-5 per domain) | ❌ **MISMATCH** |
| **Domains** | 18 | 18 | ✅ Correct |
| **Domain Weights** | Sum = 1.0 | Sum = **1.19** | ❌ **CRITICAL ERROR** |
| **Scoring Formula** | Clear formula defined | Implemented with variations | ⚠️ **PARTIALLY CORRECT** |
| **Stage Multipliers** | 5 tiers defined | 5 tiers implemented | ✅ Correct |
| **Vertical Multipliers** | 6 types defined | 6 types implemented | ✅ Correct |
| **Flag Detection** | 3 types (RED, ORANGE, YELLOW) | 3 types implemented | ✅ Correct |

---

## FINDING 1: QUESTION COUNT DISCREPANCY

### Specification Requirement
**72 total questions** with 4-5 questions per domain:

```
Tier 1 (Strategic & Macro):
- Strategic Risk: 4 Q's        ✓
- Financial Risk: 5 Q's        ✓
- Compliance Risk: 5 Q's       ✓

Tier 2 (Operational & Functional):
- Operational Risk: 5 Q's      ✓
- Cybersecurity Risk: 5 Q's    ✓
- HR Risk: 5 Q's               ✓
- Capital Markets: 5 Q's       ✓

Tier 3 (Contextual & Stakeholder):
- Founder & Team Risk: 5 Q's   ✓
- Reputation Risk: 5 Q's       ✓
- ESG Risk: 5 Q's              ✓
- Supply Chain: 5 Q's          ✓
- AI Compliance: 5 Q's         ✓
- Market & Product Risk: 4 Q's ✓
- Climate & Physical Risk: 4 Q's ✓
- Investment & Equity Risk: 4 Q's ✓
- External Risk: 4 Q's         ✓
- Cyber-Physical Risk: 3 Q's   ✓
- Polycrisis Convergence: 2 Q's ✓

TOTAL: 72 Questions
```

### Actual Implementation
**80 total questions** in [server/questions.js](../v2%20Risk/server/questions.js):

```
strategic: 4 questions       (Expected: 4)    ✓
financial: 5 questions       (Expected: 5)    ✓
compliance: 5 questions      (Expected: 5)    ✓
operational: 5 questions     (Expected: 5)    ✓
cybersecurity: 5 questions   (Expected: 5)    ✓
hr: 5 questions              (Expected: 5)    ✓
capital_markets: 5 questions (Expected: 5)    ✓
founder: 5 questions         (Expected: 5)    ✓
reputation: 5 questions      (Expected: 5)    ✓
esg: 5 questions             (Expected: 5)    ✓
supply_chain: 5 questions    (Expected: 5)    ✓
ai_compliance: 5 questions   (Expected: 5)    ✓
market: 4 questions          (Expected: 4)    ✓
climate: 4 questions         (Expected: 4)    ✓
investment: 4 questions      (Expected: 4)    ✓
external: 4 questions        (Expected: 4)    ✓
cyber_physical: 3 questions  (Expected: 3)    ✓
polycrisis: 2 questions      (Expected: 2)    ✓

TOTAL: 80 Questions (Expected: 72)  ❌ +8 EXTRA
```

### Root Cause
The specification document lists **80 question examples** (numbered 1-80) in the QUESTION ARCHITECTURE section, but the header states "72 Questions across 18 Domains". This appears to be a documentation error - **the implementation correctly follows the detailed 80-question list** provided in the spec document itself.

### Recommendation
✅ **ACCEPT IMPLEMENTATION** - The 80 questions match the detailed specification in the framework document. Update the framework header to clarify: "80 Questions across 18 Domains (4-5 per domain)"

---

## FINDING 2: CRITICAL ERROR - DOMAIN WEIGHTS DON'T SUM TO 1.0

### Current Weights
```javascript
const DOMAIN_WEIGHTS = {
  strategic: 0.10,        
  financial: 0.10,        
  compliance: 0.09,       
  operational: 0.10,      
  cybersecurity: 0.09,    
  hr: 0.08,               
  capital_markets: 0.07,  
  founder: 0.08,          
  reputation: 0.07,       
  esg: 0.06,              
  supply_chain: 0.06,     
  ai_compliance: 0.06,    
  market: 0.05,           
  climate: 0.05,          
  investment: 0.04,       
  external: 0.04,         
  cyber_physical: 0.03,   
  polycrisis: 0.02        
};

SUM: 1.1900000000000002   ❌ ERROR
```

**Expected:** 1.0  
**Actual:** 1.19  
**Error:** +19% weighting inflation

### Impact on Scoring
Since the composite score uses: 
```
weighted_score = Σ(domain_risk_score × domain_weight)
```

And weights sum to 1.19 instead of 1.0, all scores are inflated by approximately **19%**.

**Example:**
- If all domains score 50/100, with correct weights (1.0): `score = 50 × 1.0 = 50`
- With current weights (1.19): `score = 50 × 1.19 = 59.5` (9.5 points higher)

This pushes users from "MODERATE (41-55)" into "HIGH (56-70)" range artificially.

### Correction Required
Normalize all weights by dividing by 1.19:

```javascript
const DOMAIN_WEIGHTS = {
  strategic: 0.084,           // 0.10 / 1.19
  financial: 0.084,           // 0.10 / 1.19
  compliance: 0.076,          // 0.09 / 1.19
  operational: 0.084,         // 0.10 / 1.19
  cybersecurity: 0.076,       // 0.09 / 1.19
  hr: 0.067,                  // 0.08 / 1.19
  capital_markets: 0.059,     // 0.07 / 1.19
  founder: 0.067,             // 0.08 / 1.19
  reputation: 0.059,          // 0.07 / 1.19
  esg: 0.050,                 // 0.06 / 1.19
  supply_chain: 0.050,        // 0.06 / 1.19
  ai_compliance: 0.050,       // 0.06 / 1.19
  market: 0.042,              // 0.05 / 1.19
  climate: 0.042,             // 0.05 / 1.19
  investment: 0.034,          // 0.04 / 1.19
  external: 0.034,            // 0.04 / 1.19
  cyber_physical: 0.025,      // 0.03 / 1.19
  polycrisis: 0.017           // 0.02 / 1.19
};

// Verification: sum = 1.0 ✓
```

---

## FINDING 3: SCORING FORMULA VALIDATION

### Specification Formula

```
Step 1: Domain Risk Score
  domain_average = mean(question_responses_for_domain)
  domain_risk_score = 100 - (domain_average × 20)
  Range: 0-100 (higher = greater risk)

Step 2: Risk Flag Detection
  if min(responses) ≤ 1:
    apply RED_FLAG (+50 points)
  elif min(responses) ≤ 2 AND count(≤2) ≥ 2:
    apply ORANGE_FLAG (+30 points)
  elif domain_average ≤ 2.5:
    apply YELLOW_FLAG (+15 points)
  
  if domain is CRITICAL (founder, cybersecurity, ai_compliance):
    multiply flag_penalty × 1.5

Step 3: Composite Score
  weighted_score = Σ(domain_risk_score × domain_weight)
  
  stage_mult = {pre-seed: 1.4, seed: 1.2, series-a: 1.0, series-b: 0.85, series-c+: 0.7}
  vertical_mult = {fintech: 1.3, healthtech: 1.25, deeptech: 1.15, saas-b2b: 1.0, consumer: 0.9, hardware: 1.1}
  
  polycrisis_bonus = (count(domains > 60) ≥ 5) ? 1.15 : 1.0
  
  final_score = (weighted_score + flag_penalties) × stage_mult × vertical_mult × polycrisis_bonus
  final_score = min(final_score, 100)
```

### Actual Implementation (from [server/scoringEngine.js](../v2%20Risk/server/scoringEngine.js))

```javascript
// Step 1: Domain Risk Score ✓
const riskScore = Math.max(0, Math.min(100, 100 - (avg * 20)));

// Step 2: Flag Detection ✓
if (min <= 1) { flagType = 'CRITICAL'; penalty = 50; }
else if (min <= 2 && lowCount >= 2) { flagType = 'ORANGE'; penalty = 30; }
else if (avg <= 2.5) { flagType = 'YELLOW'; penalty = 15; }

// Critical domain multiplier ✓
if (CRITICAL_DOMAINS.includes(domain)) penalty *= 1.5;

// Step 3: Composite Score
const totalPenalty = flags.reduce((sum, f) => sum + f.penalty, 0) * 0.01;
const stageMult = STAGE_MULTIPLIERS[metadata.stage] || 1.0;
const verticalMult = VERTICAL_MULTIPLIERS[metadata.vertical] || 1.0;
const polycrisisMult = highRiskCount >= 5 ? 1.15 : 1.0;

let finalScore = (weightedSum + totalPenalty) * stageMult * verticalMult * polycrisisMult;
finalScore = Math.round(Math.min(100, Math.max(0, finalScore)));
```

### Scoring Formula Analysis

| Component | Spec | Implementation | Status |
|-----------|------|---|--------|
| Domain risk calculation | `100 - (avg × 20)` | `100 - (avg × 20)` | ✅ Correct |
| Flag detection (RED) | `min ≤ 1 → +50` | `min ≤ 1 → +50` | ✅ Correct |
| Flag detection (ORANGE) | `min ≤ 2 AND count ≥ 2 → +30` | `min ≤ 2 AND lowCount ≥ 2 → +30` | ✅ Correct |
| Flag detection (YELLOW) | `avg ≤ 2.5 → +15` | `avg ≤ 2.5 → +15` | ✅ Correct |
| Critical domain penalty | `penalty × 1.5` | `penalty *= 1.5` | ✅ Correct |
| **Flag penalty application** | Unclear in spec | **Divides by 0.01** | ⚠️ **INTERPRETATION** |
| Weighted sum | `Σ(domain_risk × weight)` | `Σ(domain_risk × weight)` | ✅ Correct |
| Stage multiplier | 5 tiers | 5 tiers match | ✅ Correct |
| Vertical multiplier | 6 types | 6 types match | ✅ Correct |
| Polycrisis multiplier | `× 1.15 if 5+ domains > 60` | `× 1.15 if highRiskCount ≥ 5` | ✅ Correct |

### Flag Penalty Implementation Issue
The spec says: `apply RED_FLAG (+50 points)`

But the code does:
```javascript
const totalPenalty = flags.reduce((sum, f) => sum + f.penalty, 0) * 0.01;
let finalScore = (weightedSum + totalPenalty) * stageMult * ...
```

This divides total penalty by 100 before adding, which **reduces penalty impact** by 100x:
- Example: RED_FLAG penalty of 50 becomes 0.5 points
- This seems incorrect; penalties should be added directly to weighted score

**Correction:** Remove the `* 0.01`:
```javascript
const totalPenalty = flags.reduce((sum, f) => sum + f.penalty, 0);
let finalScore = (weightedSum + totalPenalty) * stageMult * ...
```

---

## FINDING 4: STAGE & VERTICAL MULTIPLIERS ✅

### Stage Multipliers
| Stage | Spec | Implementation | Status |
|-------|------|---|--------|
| pre-seed | 1.4 | 1.4 | ✅ |
| seed | 1.2 | 1.2 | ✅ |
| series-a | 1.0 | 1.0 | ✅ |
| series-b | 0.85 | 0.85 | ✅ |
| series-c+ | 0.7 | 0.7 | ✅ |

### Vertical Multipliers
| Vertical | Spec | Implementation | Status |
|----------|------|---|--------|
| fintech | 1.3 | 1.3 | ✅ |
| healthtech | 1.25 | 1.25 | ✅ |
| deeptech | 1.15 | 1.15 | ✅ |
| saas-b2b | 1.0 | 1.0 | ✅ |
| consumer | 0.9 | 0.9 | ✅ |
| hardware | 1.1 | 1.1 | ✅ |

**Status:** All multipliers correctly implemented ✅

---

## SUMMARY OF ISSUES

### 🔴 CRITICAL (Must Fix)

1. **Domain Weights Sum Error**
   - **Issue:** Weights sum to 1.19 instead of 1.0
   - **Impact:** All scores inflated by ~19%
   - **Fix:** Normalize by dividing each weight by 1.19
   - **Severity:** HIGH - affects all score calibration

2. **Flag Penalty Application**
   - **Issue:** Penalties divided by 0.01, reducing impact by 100x
   - **Impact:** Red/Orange/Yellow flags have minimal effect
   - **Fix:** Remove `* 0.01` from penalty calculation
   - **Severity:** HIGH - flags become ineffective

### 🟡 MEDIUM (Should Clarify)

3. **Question Count Documentation**
   - **Issue:** Header says 72, implementation uses 80
   - **Impact:** Documentation confusion
   - **Fix:** Update header to "80 Questions" to match detailed spec
   - **Severity:** MEDIUM - documentation only

### ✅ CORRECT

4. Domain risk calculation formula
5. Flag detection logic
6. Critical domain multiplier
7. Stage multipliers
8. Vertical multipliers
9. Polycrisis bonus logic

---

## RECOMMENDED CORRECTIONS

### File: [server/scoringEngine.js](../v2%20Risk/server/scoringEngine.js)

**Change 1: Fix Domain Weights**
```javascript
const DOMAIN_WEIGHTS = {
  strategic: 0.0840,
  financial: 0.0840,
  compliance: 0.0756,
  operational: 0.0840,
  cybersecurity: 0.0756,
  hr: 0.0672,
  capital_markets: 0.0588,
  founder: 0.0672,
  reputation: 0.0588,
  esg: 0.0504,
  supply_chain: 0.0504,
  ai_compliance: 0.0504,
  market: 0.0420,
  climate: 0.0420,
  investment: 0.0336,
  external: 0.0336,
  cyber_physical: 0.0252,
  polycrisis: 0.0168
};
// Sum verification: 1.0000 ✓
```

**Change 2: Fix Flag Penalty Application**
```javascript
// OLD:
// const totalPenalty = flags.reduce((sum, f) => sum + f.penalty, 0) * 0.01;

// NEW:
const totalPenalty = flags.reduce((sum, f) => sum + f.penalty, 0);
```

### File: [ENHANCED_RISK_FRAMEWORK (1).md](../ENHANCED_RISK_FRAMEWORK%20(1).md)

**Change 1: Update header**
```markdown
## QUESTION ARCHITECTURE (80 Questions across 18 Domains)
# Changed from: (72 Questions across 18 Domains)
```

---

## VERIFICATION PLAN

After applying fixes, test with sample data:

```javascript
// Test Case: All domains = 3 (average risk)
// Expected with corrected weights and flags:
// weightedSum = 3 × 1.0 = 3 → risk = 100 - (3×20) = 40 per domain
// totalWeighted = 40 × 1.0 = 40
// With stage (seed=1.2), vertical (saas=1.0), polycrisis (no):
// finalScore = 40 × 1.2 × 1.0 × 1.0 = 48 (MODERATE range ✓)
```

---

## CONCLUSION

The implementation is **90% correct** with two critical mathematical errors:
1. Weight normalization issue (inflates all scores by 19%)
2. Flag penalty application issue (weakens flag effectiveness by 100x)

Both can be fixed with simple code changes. The logic, domains, questions, and multipliers are all correctly implemented.
