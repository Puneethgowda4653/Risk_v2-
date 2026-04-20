# Global Business Risk Assessment Tool
## Complete Development & Implementation Roadmap

---

## EXECUTIVE SUMMARY

This document outlines the complete technical roadmap for building the **Enhanced Global Business Risk Assessment Tool** — a sophisticated 18-domain risk evaluation platform that synthesizes insights from two comprehensive business risk analyses.

**Target Outcome**: Interactive web-based assessment delivering:
- 80 targeted questions across 18 risk domains
- Real-time intelligent scoring with polycrisis modeling
- Comprehensive risk heatmap visualizations
- Prioritized 30-90 day mitigation action plans
- PDF export with peer benchmarking

**Timeline**: 12-14 weeks (Phase 1: MVP | Phase 2: Analytics | Phase 3: Scale)

---

## PHASE 1: MVP DEVELOPMENT (Weeks 1-6)

### Sprint 1-2: Core Architecture & Assessment Flow (Weeks 1-2)

#### Frontend Setup
```
Technology Stack:
- React 18+ with TypeScript
- Tailwind CSS for styling
- React Router for navigation
- Context API for state management
- Recharts for visualizations

Project Structure:
/src
  /components
    /Assessment (Question flow, Likert scale, progress)
    /Results (Heatmap, summary cards, risks/strengths)
    /Navigation (Tab switching)
    /Common (Header, footer, loading states)
  /hooks
    useAssessment (Global assessment state)
    useScoringEngine (Real-time score calculation)
  /utils
    scoringAlgorithm.ts (Core calculation logic)
    constants.ts (18 domains, weights, questions)
    exportPDF.ts (PDF generation)
  /styles
    globals.css (Design system, CSS variables)
```

#### Assessment Component Architecture
```javascript
// useAssessment Hook
const useAssessment = () => {
  const [responses, setResponses] = useState({}); // {questionId: likertValue}
  const [currentDomain, setCurrentDomain] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  
  const domains = [...18 domain definitions...];
  const questionnaire = [...80 questions...];
  
  const getDomainProgress = () => {
    const domainQuestions = questionnaire.filter(q => q.domain === domains[currentDomain].id);
    return (currentQuestionIndex / domainQuestions.length) * 100;
  };
  
  const getOverallProgress = () => {
    return (Object.keys(responses).length / questionnaire.length) * 100;
  };
};
```

#### Assessment Component (Question Display)
```javascript
const AssessmentCard = ({ question, domain, onRespond }) => {
  const [selected, setSelected] = useState(null);
  
  const likertOptions = [
    { value: 1, label: 'Strongly Disagree' },
    { value: 2, label: 'Disagree' },
    { value: 3, label: 'Neutral' },
    { value: 4, label: 'Agree' },
    { value: 5, label: 'Strongly Agree' }
  ];
  
  return (
    <div className="assessment-card">
      <DomainHeader domain={domain} weight={domain.weight} />
      <QuestionText text={question.text} />
      <LikertScale 
        options={likertOptions}
        onSelect={(val) => {
          setSelected(val);
          onRespond(question.id, val);
        }}
      />
      <ContextBox importance={question.importance} />
    </div>
  );
};
```

#### Scoring Engine
```javascript
// scoringAlgorithm.ts
export const calculateRiskScore = (responses, domains, metadata) => {
  // Step 1: Calculate domain averages
  const domainScores = domains.map(domain => {
    const domainResponses = responses.filter(r => r.domain === domain.id);
    const avg = mean(domainResponses.map(r => r.value));
    return {
      id: domain.id,
      name: domain.name,
      average: avg,
      riskScore: 100 - (avg * 20)
    };
  });
  
  // Step 2: Detect risk flags
  const flags = detectRiskFlags(responses, domains);
  
  // Step 3: Apply weights
  const weighted = domainScores.map(ds => 
    ds.riskScore * domains.find(d => d.id === ds.id).weight
  );
  
  // Step 4: Apply multipliers
  const stageMultiplier = STAGE_MULTIPLIERS[metadata.stage];
  const verticalMultiplier = VERTICAL_MULTIPLIERS[metadata.vertical];
  const polycrisisBonus = countHighRiskDomains(domainScores) >= 5 ? 1.15 : 1.0;
  
  // Step 5: Calculate final score
  let finalScore = sum(weighted);
  finalScore *= stageMultiplier * verticalMultiplier * polycrisisBonus;
  finalScore = Math.min(finalScore, 100);
  
  return {
    score: finalScore,
    rating: getRating(finalScore),
    domains: domainScores,
    flags: flags,
    recommendations: generateRecommendations(domainScores, flags)
  };
};

const detectRiskFlags = (responses, domains) => {
  const flags = [];
  
  domains.forEach(domain => {
    const domainResponses = responses.filter(r => r.domain === domain.id);
    const minScore = Math.min(...domainResponses.map(r => r.value));
    const countLow = domainResponses.filter(r => r.value <= 2).length;
    
    if (minScore <= 1) {
      flags.push({
        type: 'CRITICAL',
        domain: domain.name,
        message: `Critical issue detected in ${domain.name}`
      });
    } else if (minScore <= 2 && countLow >= 2) {
      flags.push({
        type: 'ORANGE',
        domain: domain.name,
        message: `Significant gaps in ${domain.name}`
      });
    } else if (domainResponses.every(r => r.value <= 2.5)) {
      flags.push({
        type: 'YELLOW',
        domain: domain.name,
        message: `Monitor ${domain.name} closely`
      });
    }
  });
  
  return flags;
};
```

### Sprint 3-4: Results Dashboard & Visualization (Weeks 3-4)

#### Results Component Architecture
```javascript
const ResultsDashboard = ({ assessment }) => {
  const { score, rating, domains, flags, recommendations } = assessment;
  
  return (
    <div className="results-dashboard">
      <SummaryCards score={score} rating={rating} />
      <RiskHeatmap domains={domains} />
      <TierBreakdown domains={domains} />
      <RisksAndStrengths domains={domains} />
      <ActionPlan recommendations={recommendations} />
      <ExportButton assessment={assessment} />
    </div>
  );
};
```

#### Heatmap Component (Recharts)
```javascript
const RiskHeatmap = ({ domains }) => {
  const tieredDomains = {
    tier1: domains.filter(d => d.tier === 1),
    tier2: domains.filter(d => d.tier === 2),
    tier3: domains.filter(d => d.tier === 3)
  };
  
  const getRiskColor = (score) => {
    if (score <= 25) return '#4CAF50'; // Green
    if (score <= 40) return '#8BC34A'; // Light green
    if (score <= 55) return '#FDD835'; // Yellow
    if (score <= 70) return '#FFB74D'; // Orange
    if (score <= 85) return '#FF7043'; // Red
    return '#E24B4A'; // Dark red
  };
  
  return (
    <div className="heatmap">
      {Object.entries(tieredDomains).map(([tier, tierDomains]) => (
        <div key={tier} className="tier-row">
          <h3>{getTierLabel(tier)}</h3>
          <div className="domain-grid">
            {tierDomains.map(domain => (
              <div 
                key={domain.id} 
                className="domain-card"
                style={{
                  borderLeftColor: getRiskColor(domain.riskScore),
                  backgroundColor: adjustOpacity(getRiskColor(domain.riskScore), 0.1)
                }}
              >
                <p className="domain-name">{domain.name}</p>
                <p className="domain-score">{Math.round(domain.riskScore)}</p>
                <p className="domain-rating">{getRating(domain.riskScore)}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
```

#### Strengths & Risks Component
```javascript
const RisksAndStrengths = ({ domains }) => {
  const topRisks = domains
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 3);
  
  const topStrengths = domains
    .sort((a, b) => a.riskScore - b.riskScore)
    .slice(0, 3);
  
  return (
    <div className="risks-strengths">
      <div className="risks">
        <h3>🚨 Top 3 Critical Risks</h3>
        {topRisks.map(risk => (
          <RiskCard key={risk.id} risk={risk} />
        ))}
      </div>
      <div className="strengths">
        <h3>✓ Top 3 Strengths</h3>
        {topStrengths.map(strength => (
          <StrengthCard key={strength.id} strength={strength} />
        ))}
      </div>
    </div>
  );
};
```

### Sprint 5-6: Onboarding & PDF Export (Weeks 5-6)

#### Onboarding Component
```javascript
const Onboarding = ({ onComplete }) => {
  const [metadata, setMetadata] = useState({
    companyName: '',
    stage: 'seed',
    vertical: 'saas',
    employees: 0,
    founded: new Date().getFullYear(),
    arrOrRevenue: 0,
    burnRate: 0,
    investors: 1
  });
  
  return (
    <form onSubmit={() => onComplete(metadata)}>
      <TextInput 
        label="Company Name"
        value={metadata.companyName}
        onChange={(val) => setMetadata({...metadata, companyName: val})}
      />
      <SelectInput
        label="Business Stage"
        options={['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+']}
        value={metadata.stage}
        onChange={(val) => setMetadata({...metadata, stage: val})}
      />
      <SelectInput
        label="Industry Vertical"
        options={['SaaS B2B', 'SaaS B2C', 'Fintech', 'Healthtech', 'Deep Tech', 'Hardware', 'Consumer']}
        value={metadata.vertical}
        onChange={(val) => setMetadata({...metadata, vertical: val})}
      />
      {/* Additional fields... */}
    </form>
  );
};
```

#### PDF Export
```javascript
// Using jsPDF + html2canvas
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export const exportAssessmentPDF = async (assessment, metadata) => {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  // Page 1: Title & Summary
  pdf.setFontSize(24);
  pdf.text('Global Business Risk Assessment Report', 10, 20);
  pdf.setFontSize(12);
  pdf.text(`${metadata.companyName} | ${metadata.stage}`, 10, 35);
  
  // Summary metrics
  pdf.text(`Overall Risk Score: ${assessment.score}`, 10, 55);
  pdf.text(`Rating: ${assessment.rating}`, 10, 65);
  
  // Page 2: Heatmap
  pdf.addPage();
  const heatmapCanvas = await html2canvas(document.getElementById('heatmap'));
  const heatmapImage = heatmapCanvas.toDataURL('image/png');
  pdf.addImage(heatmapImage, 'PNG', 10, 20, 190, 140);
  
  // Page 3: Recommendations
  pdf.addPage();
  pdf.setFontSize(16);
  pdf.text('Prioritized Action Plan', 10, 20);
  
  assessment.recommendations.forEach((rec, idx) => {
    pdf.setFontSize(11);
    pdf.text(`${idx + 1}. ${rec.title}`, 10, 40 + (idx * 30));
    pdf.setFontSize(10);
    pdf.text(rec.description, 15, 47 + (idx * 30), { maxWidth: 180 });
  });
  
  // Save PDF
  pdf.save(`Risk_Assessment_${metadata.companyName}_${new Date().toISOString().split('T')[0]}.pdf`);
};
```

---

## PHASE 2: ANALYTICS & REFINEMENT (Weeks 7-10)

### Sprint 7: Backend & Data Persistence

#### API Architecture (Node.js + Express)
```javascript
// api/assessments.js
const router = express.Router();

// Create assessment
router.post('/assessments', async (req, res) => {
  const { metadata, responses } = req.body;
  
  const assessment = new Assessment({
    metadata,
    responses,
    score: calculateRiskScore(responses, metadata),
    createdAt: new Date(),
    userId: req.user.id
  });
  
  await assessment.save();
  res.json(assessment);
});

// Retrieve assessment
router.get('/assessments/:id', async (req, res) => {
  const assessment = await Assessment.findById(req.params.id);
  res.json(assessment);
});

// List user's assessments
router.get('/assessments', async (req, res) => {
  const assessments = await Assessment.find({ userId: req.user.id });
  res.json(assessments);
});
```

#### Database Schema (MongoDB)
```javascript
const assessmentSchema = new Schema({
  userId: String,
  metadata: {
    companyName: String,
    stage: String,
    vertical: String,
    employees: Number,
    founded: Number,
    arrOrRevenue: Number,
    burnRate: Number
  },
  responses: [{
    questionId: String,
    domainId: String,
    value: Number,
    timestamp: Date
  }],
  score: {
    overall: Number,
    rating: String,
    domainScores: [{
      domainId: String,
      score: Number,
      weight: Number
    }],
    flags: []
  },
  createdAt: Date,
  updatedAt: Date
});
```

### Sprint 8-9: Peer Benchmarking & Comparative Analytics

#### Benchmarking Component
```javascript
const BenchmarkComparison = ({ assessment, comparableCompanies }) => {
  // Filter for similar stage/vertical
  const peers = comparableCompanies.filter(c => 
    c.stage === assessment.metadata.stage &&
    c.vertical === assessment.metadata.vertical
  );
  
  const getPercentile = (score, peerScores) => {
    const sorted = peerScores.sort((a, b) => a - b);
    const position = sorted.findIndex(s => s >= score);
    return Math.round((position / sorted.length) * 100);
  };
  
  return (
    <div className="benchmark">
      <h3>How You Compare</h3>
      <div className="comparison-card">
        <p>Your Risk Score: {assessment.score}</p>
        <p>Peer Average: {mean(peers.map(p => p.score))}</p>
        <p>Percentile: {getPercentile(assessment.score, peers.map(p => p.score))}th</p>
      </div>
      <div className="distribution-chart">
        {/* Distribution chart showing user's position */}
      </div>
    </div>
  );
};
```

### Sprint 10: Admin Dashboard

#### Admin Dashboard Features
```javascript
const AdminDashboard = () => {
  const [allAssessments, setAllAssessments] = useState([]);
  const [filters, setFilters] = useState({
    stage: null,
    vertical: null,
    minScore: 0,
    maxScore: 100
  });
  
  return (
    <div className="admin-dashboard">
      <h2>Assessment Analytics</h2>
      
      {/* Filters */}
      <FilterPanel filters={filters} onChange={setFilters} />
      
      {/* Summary Statistics */}
      <div className="stats-grid">
        <StatCard 
          title="Total Assessments"
          value={allAssessments.length}
        />
        <StatCard 
          title="Avg Risk Score"
          value={mean(allAssessments.map(a => a.score)).toFixed(1)}
        />
        <StatCard 
          title="% High Risk (>55)"
          value={`${(allAssessments.filter(a => a.score > 55).length / allAssessments.length * 100).toFixed(0)}%`}
        />
      </div>
      
      {/* Data Table */}
      <DataTable 
        assessments={allAssessments.filter(applyFilters)}
        columns={['Company', 'Stage', 'Vertical', 'Score', 'Rating', 'Date']}
      />
      
      {/* Export to CSV */}
      <button onClick={() => exportToCSV(allAssessments)}>
        Export to CSV
      </button>
    </div>
  );
};
```

---

## PHASE 3: SCALE & PRODUCTION (Weeks 11-14)

### Sprint 11: Mobile Responsiveness & Accessibility

#### Mobile-First Responsive Design
```css
/* Mobile: Single column */
@media (max-width: 768px) {
  .heatmap {
    display: grid;
    grid-template-columns: 1fr;
  }
  
  .domain-grid {
    grid-template-columns: 2fr;
  }
  
  .results-grid {
    grid-template-columns: 1fr;
  }
  
  .question-card {
    padding: 1rem;
  }
  
  .likert-scale {
    flex-direction: column;
  }
}

/* Tablet: 2-column */
@media (min-width: 768px) and (max-width: 1024px) {
  .heatmap {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Desktop: Full layout */
@media (min-width: 1024px) {
  .heatmap {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

#### Accessibility (WCAG 2.1 AA)
- All form inputs have associated labels
- Color contrast ratios ≥4.5:1 for text
- Keyboard navigation fully supported
- Screen reader support with ARIA labels
- Focus indicators visible on all interactive elements

### Sprint 12: Performance & Security

#### Performance Optimization
```javascript
// Code splitting by route
const Assessment = lazy(() => import('./pages/Assessment'));
const Results = lazy(() => import('./pages/Results'));
const Admin = lazy(() => import('./pages/Admin'));

// Bundle size optimization
// - Minify & gzip
// - Tree-shake unused Recharts components
// - Lazy-load PDF export library

// Caching strategy
// - Cache assessment questions (static)
// - Cache peer benchmark data (1-day TTL)
// - Cache user assessments (browser localStorage + backend)
```

#### Security
```javascript
// Authentication
- JWT tokens with 24-hour expiration
- Refresh token rotation
- HTTPS only
- CORS whitelist

// Data Protection
- Encrypt sensitive fields (company financials) at rest
- Rate limit API endpoints (100 requests/minute per user)
- Sanitize all user inputs
- CSRF token protection on state-changing requests

// Compliance
- GDPR: User data deletion on request
- CCPA: Right to know, right to delete
- SOC 2 audit trails for admin actions
```

### Sprint 13: Testing & QA

#### Testing Strategy
```
Unit Tests (Jest)
- Scoring algorithm: 50+ test cases
  - Domain score calculation
  - Flag detection
  - Multiplier application
  - Edge cases (all 5s, all 1s, mixed)
- Component rendering: 30+ test cases

Integration Tests (React Testing Library)
- Onboarding flow → Assessment → Results
- State management across components
- API integration
- PDF export

E2E Tests (Cypress)
- Full user journey
- Cross-browser testing (Chrome, Firefox, Safari)
- Mobile responsiveness
- Accessibility checks

Performance Tests
- Load time <2 seconds
- PDF export <5 seconds
- 80+ Lighthouse score
```

#### QA Checklist
```
Functionality
✓ All 80 questions render correctly
✓ Likert responses save properly
✓ Scoring algorithm calculates accurately
✓ Progress bar updates in real-time
✓ PDF export contains all data
✓ Admin dashboard shows correct aggregates

Usability
✓ Onboarding is intuitive
✓ Navigation is clear
✓ Mobile layout responsive
✓ Accessibility features work

Compliance
✓ GDPR data retention
✓ Data encryption
✓ Audit trails
✓ Permission scoping
```

### Sprint 14: Deployment & Launch

#### Deployment Pipeline
```
Development (dev branch)
→ Staging (main branch)
→ Production (release branch)

CI/CD with GitHub Actions:
- Run tests on every PR
- Build Docker image
- Push to container registry
- Deploy to AWS ECS
- Run smoke tests
- Monitor for errors

Infrastructure (AWS):
- ECS for backend (containerized)
- RDS for PostgreSQL database
- S3 for PDF storage
- CloudFront for CDN
- Route53 for DNS
- CloudWatch for monitoring
```

#### Launch Checklist
```
Pre-Launch (2 weeks before)
- Security audit
- Load testing (1000 concurrent users)
- Data backup strategy
- Rollback plan
- Support documentation

Launch Day
- Deploy to production
- Verify all endpoints
- Test from customer perspective
- Monitor error rates & latency
- Prepare support team

Post-Launch (1 week)
- Daily monitoring
- Bug fix responses
- User feedback collection
- Performance analysis
```

---

## TECHNICAL DEBT & FUTURE ENHANCEMENTS

### Phase 4 Opportunities (Post-MVP)
1. **AI-Powered Recommendations**: Use LLM to generate context-specific mitigation advice
2. **Real-Time Collaboration**: Multiple team members take assessment simultaneously
3. **API for Integration**: Allow tools like Airtable, Zapier to pull risk scores
4. **Mobile App**: Native iOS/Android apps
5. **Industry Benchmarks**: Paid tier with industry-specific comparison data
6. **Continuous Monitoring**: Quarterly flash assessments
7. **Third-Party Integrations**: Calendar sync, Slack alerts
8. **Incident Tracking**: Connect to risk events as they occur

---

## SUCCESS METRICS

**User Adoption:**
- 500+ assessments in Month 1
- 1,000+ by Month 3
- NPS >60

**Product Quality:**
- Zero critical bugs in production
- <100ms response time for scoring
- 99.9% uptime

**Business Impact:**
- 70%+ users identify new risks
- 60%+ implement top recommendations
- 15-20 point average risk reduction post-remediation

---

## RESOURCE REQUIREMENTS

**Team Composition:**
- 1 Full-Stack Engineer (React + Node.js)
- 1 Backend/DevOps Engineer
- 1 QA Engineer
- 1 Product Manager (part-time)
- 1 Designer (part-time)

**Infrastructure Costs:**
- AWS: ~$500/month (starter tier)
- Database: ~$100/month
- CDN/Monitoring: ~$50/month
- **Total: ~$650/month**

**Timeline & Cost:**
- Development: 14 weeks at 1 FTE = ~$35k
- Infrastructure (first year): ~$8k
- **Total MVP Cost: ~$43k**

---

## CONCLUSION

This roadmap provides a complete blueprint for building a world-class business risk assessment tool. The phased approach allows for:
- Fast MVP launch (6 weeks)
- Early user feedback collection
- Iterative refinement based on real usage
- Scale-ready architecture

By week 14, the tool will be production-ready, well-tested, and positioned for organic growth and premium tier expansion.
