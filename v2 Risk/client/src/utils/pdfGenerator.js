import jsPDF from 'jspdf';

// Helper function to get score interpretation
const getScoreInterpretation = (score) => {
  if (score <= 25) return { label: 'MINIMAL RISK', description: 'Strong risk controls and governance in place' };
  if (score <= 40) return { label: 'LOW RISK', description: 'Adequate risk management with minor gaps' };
  if (score <= 55) return { label: 'MODERATE RISK', description: 'Significant risk areas requiring attention' };
  if (score <= 70) return { label: 'HIGH RISK', description: 'Critical vulnerabilities present' };
  if (score <= 85) return { label: 'CRITICAL RISK', description: 'Severe exposure across multiple domains' };
  return { label: 'EXISTENTIAL RISK', description: 'Systemic threat to business viability' };
};

// Helper to wrap text
const wrapText = (doc, text, x, y, maxWidth, lineHeight = 5) => {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + (lines.length * lineHeight);
};

export const generatePDF = async (assessmentData, metadata) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);
  
  // Color palette
  const colors = {
    primary: [31, 27, 76],
    accent: [139, 92, 246],
    success: [16, 185, 129],
    warning: [245, 158, 11],
    danger: [239, 68, 68],
    text: [0, 0, 0],
    lightText: [107, 114, 128],
    border: [229, 231, 235],
    lightBg: [248, 249, 250]
  };

  let yPosition = margin;
  let pageNum = 1;

  // ============ PAGE 1: COVER PAGE ============
  
  doc.setFillColor(...colors.primary);
  doc.rect(0, 0, pageWidth, 60, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('Risk Assessment Report', margin, 25);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Comprehensive Business Risk Analysis', margin, 35);
  
  yPosition = 75;
  doc.setDrawColor(...colors.border);
  doc.setLineWidth(0.5);
  doc.rect(margin, yPosition, contentWidth, 50);
  
  doc.setTextColor(...colors.text);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Assessment Details', margin + 5, yPosition + 6);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  yPosition += 12;
  doc.text(`Company: ${metadata.companyName}`, margin + 5, yPosition);
  doc.text(`Contact: ${metadata.name} (${metadata.email})`, margin + 5, yPosition + 6);
  doc.text(`Business Stage: ${metadata.stage.toUpperCase()}  |  Vertical: ${metadata.vertical.toUpperCase().replace('-', ' ')}`, margin + 5, yPosition + 12);
  doc.text(`Assessment Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin + 5, yPosition + 18);
  
  yPosition = 135;
  doc.setFillColor(240, 240, 245);
  doc.rect(margin, yPosition, contentWidth, 55, 'F');
  
  const scoreInterp = getScoreInterpretation(assessmentData.score);
  
  doc.setFontSize(48);
  doc.setFont('helvetica', 'bold');
  const scoreColor = assessmentData.score > 70 ? colors.danger : 
                     assessmentData.score > 55 ? colors.warning : 
                     assessmentData.score > 40 ? colors.warning : colors.success;
  doc.setTextColor(...scoreColor);
  doc.text(`${assessmentData.score}%`, pageWidth - margin - 20, yPosition + 30, { align: 'right' });
  
  doc.setTextColor(...colors.text);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Overall Risk Score', margin + 5, yPosition + 15);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(scoreInterp.label, margin + 5, yPosition + 25);
  
  doc.setFontSize(9);
  doc.setTextColor(...colors.lightText);
  doc.text(scoreInterp.description, margin + 5, yPosition + 33);
  
  yPosition = 200;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.text);
  doc.text('Key Metrics', margin, yPosition);
  
  yPosition += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const highRiskDomains = Object.values(assessmentData.domainScores).filter(d => d.score > 60).length;
  const criticalFlags = assessmentData.flags.filter(f => f.type === 'CRITICAL').length;
  const totalDomains = Object.keys(assessmentData.domainScores).length;
  
  doc.text(`High-Risk Domains: ${highRiskDomains} / ${totalDomains}`, margin, yPosition);
  doc.text(`Critical Flags: ${criticalFlags}`, pageWidth / 2, yPosition);
  yPosition += 6;
  doc.text(`Polycrisis Risk: ${assessmentData.polycrisisTriggered ? 'YES ⚠️' : 'No'}`, margin, yPosition);
  doc.text(`Confidence Level: High`, pageWidth / 2, yPosition);
  
  doc.setFontSize(8);
  doc.setTextColor(...colors.lightText);
  doc.text(`Page ${pageNum++}`, pageWidth / 2, pageHeight - 8, { align: 'center' });

  // ============ PAGE 2: EXECUTIVE SUMMARY ============
  doc.addPage();
  yPosition = margin;
  pageNum = 2;
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.text);
  doc.text('Executive Summary', margin, yPosition);
  
  doc.setDrawColor(...colors.accent);
  doc.setLineWidth(1);
  doc.line(margin, yPosition + 2, margin + 50, yPosition + 2);
  
  yPosition += 12;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const summaryText = `Your organization's risk assessment reveals a ${scoreInterp.label} profile across 18 critical business domains. This comprehensive analysis evaluates strategic, financial, operational, cyber, compliance, and governance domains tailored to your business stage and vertical.

KEY FINDINGS:
• Overall Risk Score: ${assessmentData.score}% (${scoreInterp.label})
• High-Risk Domains: ${highRiskDomains} areas requiring immediate attention
• Critical Flags: ${criticalFlags} specific vulnerabilities detected
• Assessment Coverage: ${totalDomains} active domains analyzed
• Polycrisis Status: ${assessmentData.polycrisisTriggered ? 'Multiple domain failures detected' : 'No convergence detected'}

ASSESSMENT METHODOLOGY:
This evaluation uses weighted domain scoring (each domain weighted by strategic importance), stage-specific multipliers (accounting for your lifecycle maturity), vertical risk adjustments (industry-specific exposures), and composite scoring to identify compounding risks.`;

  yPosition = wrapText(doc, summaryText, margin, yPosition, contentWidth, 4.5);
  
  yPosition += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Interpretation:', margin, yPosition);
  
  yPosition += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const explanation = {
    'MINIMAL RISK': 'Exceptional risk controls and governance. Continue monitoring and maintain current practices. Periodic assessments (annual) recommended.',
    'LOW RISK': 'Adequate risk management with minor gaps. Focus on identified improvements. Semi-annual reviews recommended.',
    'MODERATE RISK': 'Significant vulnerabilities exist. Priority remediation required. Quarterly reviews and progress tracking essential.',
    'HIGH RISK': 'Critical exposures present. Immediate action plan needed. Monthly progress reviews and potential external advisory recommended.',
    'CRITICAL RISK': 'Severe threats to business viability. Emergency intervention required. Weekly executive review and external advisors essential.',
    'EXISTENTIAL RISK': 'Systemic threats identified. Immediate strategic action required. Daily management attention and potential restructuring needed.'
  };
  
  yPosition = wrapText(doc, explanation[scoreInterp.label], margin, yPosition, contentWidth, 4.5);
  
  doc.setFontSize(8);
  doc.setTextColor(...colors.lightText);
  doc.text(`Page ${pageNum++}`, pageWidth / 2, pageHeight - 8, { align: 'center' });

  // ============ PAGE 3: DOMAIN BREAKDOWN ============
  doc.addPage();
  yPosition = margin;
  pageNum = 3;
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.text);
  doc.text('Domain Risk Analysis', margin, yPosition);
  
  doc.setDrawColor(...colors.accent);
  doc.setLineWidth(1);
  doc.line(margin, yPosition + 2, margin + 50, yPosition + 2);
  
  yPosition += 12;
  
  // Sort domains by score (highest first)
  const sortedDomains = Object.entries(assessmentData.domainScores)
    .sort(([, a], [, b]) => b.score - a.score);
  
  doc.setFontSize(9);
  
  sortedDomains.forEach(([domainId, domainData], index) => {
    if (yPosition > pageHeight - 30) {
      doc.addPage();
      yPosition = margin;
    }
    
    // Domain header with score
    const domainColor = domainData.score > 60 ? colors.danger : 
                        domainData.score > 40 ? colors.warning : colors.success;
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...domainColor);
    doc.text(`${index + 1}. ${domainData.name}`, margin, yPosition);
    
    // Score badge
    doc.setFillColor(...domainColor);
    doc.rect(pageWidth - margin - 20, yPosition - 3, 15, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text(`${Math.round(domainData.score)}%`, pageWidth - margin - 13, yPosition + 1, { align: 'center' });
    
    yPosition += 7;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.lightText);
    
    // Domain explanation
    const domainExplanations = {
      'Strategic Risk': 'Evaluates long-term viability of business model, competitive positioning, and strategic execution capability.',
      'Financial Risk': 'Reviews cash flow management, burn rate sustainability, funding runway, revenue quality, and financial controls.',
      'Compliance Risk': 'Evaluates regulatory adherence, legal obligation fulfillment, corporate governance, and board effectiveness.',
      'Operational Risk': 'Examines process maturity, vendor management, supply chain resilience, and operational efficiency.',
      'Cybersecurity Risk': 'Measures data security posture, infrastructure protection, incident response capability, and cybersecurity governance.',
      'HR Risk': 'Evaluates talent acquisition, employee retention, cultural cohesion, and organizational development.',
      'Capital Markets Risk': 'Reviews investor relations, IPO readiness, valuation credibility, and market timing.',
      'Founder Risk': 'Assesses founder health, key person dependencies, succession planning, and founder-team alignment.',
      'Reputation Risk': 'Examines brand strength, stakeholder trust, media relations, and crisis management capability.',
      'ESG Risk': 'Evaluates environmental sustainability practices, social impact initiatives, and governance maturity.',
      'Supply Chain Risk': 'Reviews vendor concentration, logistics resilience, procurement controls, and supply chain visibility.',
      'AI Compliance Risk': 'Assesses AI governance, bias mitigation, regulatory compliance, and responsible AI practices.',
      'Market Risk': 'Analyzes market volatility exposure, customer concentration, demand forecasting accuracy, and competitive intensity.',
      'Climate Risk': 'Evaluates physical climate risks, transition risks, ESG alignment, and climate scenario planning.',
      'Investment Risk': 'Reviews investment decisions, capital allocation strategy, M&A integration, and diversification.',
      'External Risk': 'Assesses geopolitical exposure, regulatory changes, macroeconomic factors, and third-party dependencies.',
      'Cyber-Physical Risk': 'Evaluates physical infrastructure security and integration with digital systems.',
      'Polycrisis Risk': 'Measures convergence and interaction effects of multiple domain failures creating systemic risk.'
    };
    
    const explanation = domainExplanations[domainData.name] || 'Risk domain assessment';
    doc.setTextColor(...colors.text);
    yPosition = wrapText(doc, explanation, margin, yPosition, contentWidth - 5, 3.5);
    
    yPosition += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    
    const riskLevel = domainData.score > 60 ? 'HIGH RISK' : domainData.score > 40 ? 'MODERATE' : 'LOW RISK';
    const recommendation = domainData.score > 60 ? 'Immediate action required' : 
                          domainData.score > 40 ? 'Monitor and improve' : 'Continue current practices';
    
    doc.text(`Status: ${riskLevel} | Weight: ${(domainData.weight * 100).toFixed(0)}% | Action: ${recommendation}`, margin, yPosition);
    
    yPosition += 5;
  });
  
  doc.setFontSize(8);
  doc.setTextColor(...colors.lightText);
  doc.text(`Page ${pageNum++}`, pageWidth / 2, pageHeight - 8, { align: 'center' });

  // ============ PAGE 4: RISK FLAGS ============
  doc.addPage();
  yPosition = margin;
  pageNum = 4;
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.text);
  doc.text('Identified Risk Flags', margin, yPosition);
  
  doc.setDrawColor(...colors.accent);
  doc.setLineWidth(1);
  doc.line(margin, yPosition + 2, margin + 50, yPosition + 2);
  
  yPosition += 12;
  
  if (assessmentData.flags.length === 0) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.success);
    doc.text('✓ No critical risk flags detected in this assessment.', margin, yPosition);
  } else {
    doc.setFontSize(9);
    
    assessmentData.flags.forEach((flag, idx) => {
      if (yPosition > pageHeight - 25) {
        doc.addPage();
        yPosition = margin;
      }
      
      // Flag type badge
      const flagColor = flag.type === 'CRITICAL' ? colors.danger : 
                        flag.type === 'ORANGE' ? colors.warning : [245, 197, 24];
      
      doc.setFillColor(...flagColor);
      doc.rect(margin, yPosition - 2, 12, 5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text(flag.type[0], margin + 6, yPosition + 0.5, { align: 'center' });
      
      // Flag description
      doc.setTextColor(...colors.text);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`${idx + 1}. ${flag.domain}`, margin + 16, yPosition);
      
      yPosition += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...colors.lightText);
      doc.text(`Severity: ${flag.type} | Impact: +${flag.penalty} pts | Trigger: ${flag.trigger}`, margin + 16, yPosition);
      
      yPosition += 5;
      doc.setTextColor(...colors.text);
      const flagExplanation = `This flag indicates a critical gap in ${flag.domain.toLowerCase()}. Responses suggest vulnerability in this domain requiring immediate remediation and governance improvements.`;
      yPosition = wrapText(doc, flagExplanation, margin + 16, yPosition, contentWidth - 16, 3.5);
      
      yPosition += 4;
    });
  }
  
  yPosition += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.text);
  doc.text('Flag Severity Definitions:', margin, yPosition);
  
  yPosition += 6;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  
  const severityDefs = [
    { type: 'CRITICAL', desc: 'Severe vulnerability requiring immediate executive intervention and remediation plan within 30 days' },
    { type: 'ORANGE', desc: 'Significant gap requiring management attention and structured improvement plan within 60 days' },
    { type: 'YELLOW', desc: 'Moderate concern requiring monitoring and targeted improvements within 90 days' }
  ];
  
  severityDefs.forEach(sev => {
    doc.text(`${sev.type}: ${sev.desc}`, margin, yPosition, { maxWidth: contentWidth - 5 });
    yPosition += 5;
  });
  
  doc.setFontSize(8);
  doc.setTextColor(...colors.lightText);
  doc.text(`Page ${pageNum++}`, pageWidth / 2, pageHeight - 8, { align: 'center' });

  // ============ PAGE 5: RECOMMENDATIONS ============
  doc.addPage();
  yPosition = margin;
  pageNum = 5;
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.text);
  doc.text('Recommendations & Action Plan', margin, yPosition);
  
  doc.setDrawColor(...colors.accent);
  doc.setLineWidth(1);
  doc.line(margin, yPosition + 2, margin + 70, yPosition + 2);
  
  yPosition += 12;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.danger);
  doc.text('IMMEDIATE ACTIONS (Next 30 Days)', margin, yPosition);
  
  yPosition += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...colors.text);
  
  const criticalDomains = Object.entries(assessmentData.domainScores)
    .filter(([, d]) => d.score > 60)
    .sort(([, a], [, b]) => b.score - a.score)
    .slice(0, 3);
  
  if (criticalDomains.length > 0) {
    criticalDomains.forEach(([id, domain], idx) => {
      if (yPosition > pageHeight - 30) {
        doc.addPage();
        yPosition = margin;
      }
      doc.setFont('helvetica', 'bold');
      doc.text(`${idx + 1}. Address ${domain.name} (Score: ${Math.round(domain.score)}%)`, margin + 5, yPosition);
      yPosition += 4;
      doc.setFont('helvetica', 'normal');
      const actionText = `Conduct comprehensive assessment of ${domain.name.toLowerCase()} gaps. Assign executive sponsor and cross-functional team. Develop detailed 90-day remediation roadmap with specific, measurable milestones.`;
      yPosition = wrapText(doc, actionText, margin + 5, yPosition, contentWidth - 10, 3.5);
      yPosition += 2;
    });
  }
  
  yPosition += 3;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.warning);
  doc.text('MEDIUM-TERM IMPROVEMENTS (60-90 Days)', margin, yPosition);
  
  yPosition += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...colors.text);
  
  const improvements = [
    'Governance Review: Establish risk governance framework with board oversight',
    'Cross-Functional Alignment: Align departments on risks and mitigation strategies',
    'Control Enhancement: Strengthen controls with documented processes and automation',
    'Stakeholder Communication: Brief board, investors, and management on findings'
  ];
  
  improvements.forEach(imp => {
    doc.text(`• ${imp}`, margin + 3, yPosition);
    yPosition += 4;
  });
  
  yPosition += 3;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.success);
  doc.text('LONG-TERM STRATEGY (6-12 Months)', margin, yPosition);
  
  yPosition += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...colors.text);
  
  const strategies = [
    '• Schedule quarterly re-assessments to track progress',
    '• Build sustainable risk management infrastructure',
    '• Implement advanced monitoring and early warning systems',
    '• Develop scenario planning and stress testing capabilities',
    '• Establish continuous improvement processes'
  ];
  
  strategies.forEach(strat => {
    doc.text(strat, margin + 3, yPosition);
    yPosition += 4;
  });
  
  doc.setFontSize(8);
  doc.setTextColor(...colors.lightText);
  doc.text(`Page ${pageNum++}`, pageWidth / 2, pageHeight - 8, { align: 'center' });

  // ============ PAGE 6: METHODOLOGY ============
  doc.addPage();
  yPosition = margin;
  pageNum = 6;
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.text);
  doc.text('Assessment Methodology', margin, yPosition);
  
  doc.setDrawColor(...colors.accent);
  doc.setLineWidth(1);
  doc.line(margin, yPosition + 2, margin + 50, yPosition + 2);
  
  yPosition += 12;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Scoring Framework:', margin, yPosition);
  
  yPosition += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  
  const methodologyText = `1. DOMAIN SCORING: Each of 18 domains evaluated on 0-100 scale using targeted questions calibrated to detect specific vulnerabilities.

2. WEIGHTING: Domain scores weighted by strategic importance. Financial and compliance domains weighted higher (8-10%) than emerging risks (2-3%).

3. STAGE MULTIPLIER: Adjusts for company lifecycle:
   Pre-Seed: 1.4x | Seed: 1.2x | Series A: 1.0x | Series B: 0.85x | Series C+: 0.7x

4. VERTICAL ADJUSTMENT: Industry-specific risk factors:
   Fintech: 1.3x | Healthtech: 1.25x | Deeptech: 1.15x | Hardware: 1.1x | SaaS: 1.0x | Consumer: 0.9x

5. POLYCRISIS MODELING: 1.15x multiplier when 5+ domains exceed thresholds.

6. FLAG PENALTIES: Critical flags add 50pts, Orange 30pts, Yellow 15pts (×0.01 for scoring).

7. FINAL COMPOSITE SCORE: All adjustments applied to produce final 0-100 risk percentage.`;

  yPosition = wrapText(doc, methodologyText, margin, yPosition, contentWidth, 3.5);
  
  yPosition += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Score Interpretation:', margin, yPosition);
  
  yPosition += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  
  const ranges = [
    '0-25%: MINIMAL RISK',
    '26-40%: LOW RISK',
    '41-55%: MODERATE RISK',
    '56-70%: HIGH RISK',
    '71-85%: CRITICAL RISK',
    '86-100%: EXISTENTIAL RISK'
  ];
  
  ranges.forEach(range => {
    doc.text(`• ${range}`, margin, yPosition);
    yPosition += 4;
  });
  
  doc.setFontSize(8);
  doc.setTextColor(...colors.lightText);
  doc.text(`Page ${pageNum}`, pageWidth / 2, pageHeight - 8, { align: 'center' });

  // Save the PDF locally
  const filename = `Risk_Assessment_${metadata.companyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);

  // Return the blob and filename so it can be uploaded to Supabase
  const pdfBlob = doc.output('blob');
  return { blob: pdfBlob, filename };
};