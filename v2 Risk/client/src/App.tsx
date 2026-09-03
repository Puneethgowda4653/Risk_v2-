import { useState, useEffect } from 'react';
// @ts-ignore
import { generateUniqueAssessment, calculateRiskScore, getBenchmarkData, DOMAINS } from './utils/riskEngine';
// @ts-ignore
import { deriveReportMetrics } from './utils/reportMetrics';
// The report generators (riskReportHtml / reportPdf) pull in the embedded fonts
// + html2canvas, so they're lazy-loaded on demand inside the handlers below to
// keep the initial bundle lean. The delivered PDF uses the finalized template
// design and replaces the old hand-drawn jsPDF report (pdfGenerator.js).
import CursorField from './CursorField';
import { supabase } from './supabaseClient';
// Payment gateway temporarily disabled — Razorpay checkout is commented out.
// import { startRazorpayCheckout } from './utils/razorpayPayment';
// import type { RazorpayResult } from './utils/razorpayPayment';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : window.location.origin);

// Centralized external "Payment Hub" static site. After a successful checkout we
// redirect the top-level window here with the Razorpay identifiers appended; the
// Hub forwards the user to our /payment-status endpoint for verification.
// The base carries ?app_id=risk, which identifies this app in the Hub's routing.
// const PAYMENT_HUB_URL = import.meta.env.VITE_PAYMENT_HUB_URL || 'https://payment-t1ag.onrender.com/?app_id=risk';

/** Append the Razorpay identifiers to the Payment Hub base URL. */
// const buildHubRedirectUrl = (r: RazorpayResult): string => {
//   const sep = PAYMENT_HUB_URL.includes('?') ? '&' : '?';
//   const params = new URLSearchParams({
//     razorpay_payment_id: r.razorpay_payment_id,
//     razorpay_order_id: r.razorpay_order_id,
//     razorpay_signature: r.razorpay_signature,
//   });
//   return `${PAYMENT_HUB_URL}${sep}${params.toString()}`;
// };

type Step = 'onboarding' | 'assessment' | 'results' | 'retest';
type BusinessStage = 'pre-seed' | 'seed' | 'series-a' | 'series-b' | 'series-c+';
type Vertical = 'saas-b2b' | 'fintech' | 'healthtech' | 'hardware' | 'consumer' | 'deeptech';

interface Metadata {
  name: string; companyName: string; email: string;
  stage: BusinessStage; vertical: Vertical; usesAi: boolean; physicalProduct: boolean;
}
interface Response { questionId: string; domainId: string; value: number; }

const scoreColor = (s: number) => s > 70 ? '#ef4444' : s > 55 ? '#f97316' : s > 40 ? '#eab308' : '#22c55e';
const _scoreLabel = (s: number) => s > 85 ? 'EXISTENTIAL' : s > 70 ? 'CRITICAL' : s > 55 ? 'HIGH' : s > 40 ? 'MODERATE' : s > 25 ? 'LOW' : 'MINIMAL';
const _flagBorder = (t: string) => t === 'CRITICAL' ? '#ef4444' : t === 'ORANGE' ? '#f97316' : '#eab308';
const _flagBg = (t: string) => t === 'CRITICAL' ? '#fef2f2' : t === 'ORANGE' ? '#fff7ed' : '#fefce8';

/* ─── rebuild a client-shaped result from a stored assessment row ─────────── */
function reconstructResultFromRow(row: any) {
  const domainScores: Record<string, { score: number; name: string; weight: number; tier: number }> = {};
  Object.entries(row.domain_scores || {}).forEach(([id, score]) => {
    const d = DOMAINS.find((dm: any) => dm.id === id);
    domainScores[id] = { score: score as number, name: d?.name || id, weight: d?.weight || 0, tier: d?.tier || 1 };
  });
  const flags = (row.flags || []).map((f: any) => ({
    ...f,
    domain: DOMAINS.find((dm: any) => dm.id === f.domain)?.name || f.domain,
  }));
  return {
    score: row.score,
    rating: row.rating,
    domainScores,
    flags,
    polycrisisTriggered: row.polycrisis_triggered,
    highRiskCount: row.high_risk_count,
  };
}

/* ─── smooth SVG curve ─────────────────────────────────────────────────────── */
function curvePath(vals: number[], W: number, H: number, closed = false) {
  if (vals.length < 2) return '';
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
  const xs = vals.map((_, i) => (i / (vals.length - 1)) * W);
  const ys = vals.map(v => H - ((v - mn) / rng) * H * 0.78 - H * 0.11);
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < xs.length; i++) {
    const cx = (xs[i - 1] + xs[i]) / 2;
    d += ` C ${cx} ${ys[i - 1]} ${cx} ${ys[i]} ${xs[i]} ${ys[i]}`;
  }
  if (closed) d += ` L ${xs[xs.length - 1]} ${H} L ${xs[0]} ${H} Z`;
  return d;
}

/* ─── KPI Card sparkline (thin, no fill – like the reference) ──────────────── */
function KpiSparkline({ vals, color, w = 90, h = 36 }: { vals: number[]; color: string; w?: number; h?: number }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }}>
      <path d={curvePath(vals, w, h)} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Donut / Pie chart ────────────────────────────────────────────────────── */
function DonutChart({ slices }: { slices: { pct: number; color: string; label: string }[] }) {
  const R = 70, cx = 90, cy = 90;
  let angle = -Math.PI / 2;
  const paths: React.ReactNode[] = [];
  slices.forEach((s, i) => {
    const sweep = (s.pct / 100) * 2 * Math.PI;
    const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
    const x2 = cx + R * Math.cos(angle + sweep), y2 = cy + R * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    paths.push(
      <path key={i}
        d={`M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`}
        fill={s.color} stroke="white" strokeWidth="2" />
    );
    // label inside slice
    const midA = angle + sweep / 2;
    const lx = cx + R * 0.6 * Math.cos(midA);
    const ly = cy + R * 0.6 * Math.sin(midA);
    paths.push(
      <text key={`t${i}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
        fontSize="9" fontWeight="700" fill="white">{s.pct}%</text>
    );
    angle += sweep;
  });
  return (
    <svg viewBox="0 0 180 180" style={{ width: 180, height: 180 }}>
      {paths}
    </svg>
  );
}

/* ─── Grouped bar chart ─────────────────────────────────────────────────────── */
function GroupedBar({ months, teamA, teamB }: { months: string[]; teamA: number[]; teamB: number[] }) {
  const W = 480, H = 140, pad = 30, bw = 10, gap = 4;
  const mx = Math.max(...teamA, ...teamB);
  const slotW = (W - pad * 2) / months.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 28}`} style={{ width: '100%', height: H + 28 }}>
      {/* y gridlines */}
      {[0, 20, 40, 60, 80].map(v => {
        const y = pad + H - (v / mx) * H;
        return (
          <g key={v}>
            <line x1={pad} y1={y} x2={W - 10} y2={y} stroke="#f0f0f0" strokeWidth="1" />
            <text x={pad - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#9ca3af">{v}</text>
          </g>
        );
      })}
      {months.map((m, i) => {
        const slotX = pad + i * slotW + slotW / 2;
        const hA = (teamA[i] / mx) * H;
        const hB = (teamB[i] / mx) * H;
        return (
          <g key={m}>
            <rect x={slotX - bw - gap / 2} y={pad + H - hA} width={bw} height={hA} rx="3" fill="#2563eb" />
            <rect x={slotX + gap / 2} y={pad + H - hB} width={bw} height={hB} rx="3" fill="#f59e0b" />
            <text x={slotX} y={pad + H + 14} textAnchor="middle" fontSize="9" fill="#9ca3af">{m}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Horizontal bar chart ──────────────────────────────────────────────────── */
function HBar({ label, val, max, color, valLabel }: { label: string; val: number; max: number; color: string; valLabel: string }) {
  const pct = (val / max) * 100;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{label}</div>
      <div style={{ position: 'relative', height: 10, background: '#e5e7eb', borderRadius: 6, overflow: 'visible' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 6, position: 'relative', transition: 'width 1s ease' }}>
          <span style={{ position: 'absolute', right: -22, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>{valLabel}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Radar chart for "current subject" style ───────────────────────────────── */
function SubjectRadar({ scores, labels }: { scores: number[]; labels: string[] }) {
  const n = scores.length, cx = 100, cy = 100, R = 72;
  const pt = (i: number, frac: number) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    return { x: cx + frac * R * Math.cos(a), y: cy + frac * R * Math.sin(a) };
  };
  const polygon = (frac: number) => Array.from({ length: n }, (_, i) => pt(i, frac)).map(p => `${p.x},${p.y}`).join(' ');
  const userPts = scores.map((s, i) => pt(i, s / 100));
  return (
    <svg viewBox="0 0 200 200" style={{ width: '100%', height: 170 }}>
      <defs>
        <linearGradient id="rdr" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      {[0.33, 0.66, 1].map(f => <polygon key={f} points={polygon(f)} fill="none" stroke="#e5e7eb" strokeWidth="1" />)}
      {Array.from({ length: n }, (_, i) => { const e = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={e.x} y2={e.y} stroke="#e5e7eb" strokeWidth="1" />; })}
      <polygon points={userPts.map(p => `${p.x},${p.y}`).join(' ')} fill="url(#rdr)" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
      {labels.map((l, i) => { const lp = pt(i, 1.28); return <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="600" fill="#6b7280">{l}</text>; })}
    </svg>
  );
}

/* ─── Gauge ─────────────────────────────────────────────────────────────────── */
function GaugeMeter({ score }: { score: number }) {
  const r = 52, circ = Math.PI * r, dash = (score / 100) * circ, color = scoreColor(score);
  return (
    <svg viewBox="0 0 130 80" style={{ width: '100%', maxWidth: 160 }}>
      <path d="M 13 68 A 52 52 0 0 1 117 68" fill="none" stroke="#f0f0f0" strokeWidth="11" strokeLinecap="round" />
      <path d="M 13 68 A 52 52 0 0 1 117 68" fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} style={{ transition: 'stroke-dasharray 1.4s ease' }} />
      <text x="65" y="62" textAnchor="middle" fontSize="24" fontWeight="800" fill={color}>{score}</text>
      <text x="65" y="74" textAnchor="middle" fontSize="7" fontWeight="700" fill="#9ca3af" style={{ letterSpacing: '1px' }}>RISK SCORE</text>
    </svg>
  );
}

/* ─── Mini progress bar ─────────────────────────────────────────────────────── */
function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ background: '#f0f0f0', borderRadius: 4, height: 5, overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, background: color, height: '100%', borderRadius: 4, transition: 'width 1s ease' }} />
    </div>
  );
}

/* ─── Nightingale Rose Chart ────────────────────────────────────────────────── */
function NightingaleChart({ data }: { data: Array<{ name: string; score: number }> }) {
  const cx = 55, cy = 55, minR = 12, maxR = 40;
  const segments = data.length;
  const angleSlice = (Math.PI * 2) / segments;

  const getColor = (score: number) => score > 60 ? '#ef4444' : score > 40 ? '#f59e0b' : '#2563eb';
  const maxScore = Math.max(...data.map(d => d.score), 100);

  const petals = data.map((d, i) => {
    const angle = i * angleSlice - Math.PI / 2;
    const radius = minR + (d.score / maxScore) * (maxR - minR);

    const angle1 = angle - angleSlice / 2.2;
    const angle2 = angle + angleSlice / 2.2;

    const x1 = cx + minR * Math.cos(angle1);
    const y1 = cy + minR * Math.sin(angle1);
    const x2 = cx + minR * Math.cos(angle2);
    const y2 = cy + minR * Math.sin(angle2);
    const x3 = cx + radius * Math.cos(angle);
    const y3 = cy + radius * Math.sin(angle);

    return { x1, y1, x2, y2, x3, y3, color: getColor(d.score), score: d.score };
  });

  const labels = data.map((d, i) => {
    const angle = i * angleSlice - Math.PI / 2;
    const labelR = maxR + 8;
    return {
      x: cx + labelR * Math.cos(angle),
      y: cy + labelR * Math.sin(angle),
      name: d.name,
      score: d.score
    };
  });

  return (
    <svg viewBox="0 0 120 120" style={{ width: '100%', height: 'auto' }}>
      {[0.33, 0.66, 1].map(frac => (
        <circle
          key={`circle-${frac}`}
          cx={cx}
          cy={cy}
          r={minR + (maxR - minR) * frac}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="0.5"
          strokeDasharray="1,1"
        />
      ))}

      {data.map((_, i) => {
        const angle = i * angleSlice - Math.PI / 2;
        const x2 = cx + (maxR + 3) * Math.cos(angle);
        const y2 = cy + (maxR + 3) * Math.sin(angle);
        return (
          <line
            key={`line-${i}`}
            x1={cx}
            y1={cy}
            x2={x2}
            y2={y2}
            stroke="#f0f0f0"
            strokeWidth="0.4"
          />
        );
      })}

      {petals.map((petal, i) => (
        <path
          key={`petal-${i}`}
          d={`M ${petal.x1} ${petal.y1} L ${petal.x3} ${petal.y3} L ${petal.x2} ${petal.y2} Q ${cx} ${cy} ${petal.x1} ${petal.y1}`}
          fill={petal.color}
          fillOpacity="0.7"
          stroke={petal.color}
          strokeWidth="0.8"
          style={{ transition: 'all 0.6s ease' }}
        />
      ))}

      <circle cx={cx} cy={cy} r={4} fill="#111827" />

      {labels.map((label, i) => (
        <g key={`label-${i}`}>
          <text
            x={label.x}
            y={label.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="6"
            fontWeight="600"
            fill="#374151"
          >
            {label.name.split(' ')[0]}
          </text>
          <text
            x={label.x}
            y={label.y + 5}
            textAnchor="middle"
            fontSize="5"
            fontWeight="700"
            fill={getColor(label.score)}
          >
            {Math.round(label.score)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ─── Drill-Down Modal ─────────────────────────────────────────────────────── */
function DrillDownModal({
  title,
  subtitle,
  domains,
  onClose,
}: {
  title: string;
  subtitle?: string;
  domains: [string, { score: number; name: string; weight: number; tier: number }][];
  onClose: () => void;
}) {
  const sorted = [...domains].sort(([, a], [, b]) => b.score - a.score);
  const getColor = (s: number) =>
    s >= 70 ? '#dc2626' : s >= 55 ? '#f97316' : s >= 40 ? '#eab308' : s >= 25 ? '#84cc16' : '#22c55e';
  const getLabel = (s: number) =>
    s >= 70 ? 'CRITICAL' : s >= 55 ? 'HIGH' : s >= 40 ? 'MODERATE' : s >= 25 ? 'LOW' : 'MINIMAL';
  const getBg = (s: number) =>
    s >= 70 ? 'linear-gradient(135deg,#dc2626,#b91c1c)' :
      s >= 55 ? 'linear-gradient(135deg,#f97316,#ea580c)' :
        s >= 40 ? 'linear-gradient(135deg,#eab308,#ca8a04)' :
          s >= 25 ? 'linear-gradient(135deg,#84cc16,#65a30d)' :
            'linear-gradient(135deg,#22c55e,#16a34a)';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(10,14,26,0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn .18s ease',
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes slideUp { from { opacity:0; transform:translateY(24px) scale(.97); } to { opacity:1; transform:none; } }
        .dd-row:hover { background: #f8faff !important; }
        .dd-close:hover { background: rgba(239,68,68,.12) !important; color:#dc2626 !important; }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 16, width: '92vw', maxWidth: 780,
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 32px 80px rgba(0,0,0,.35)', overflow: 'hidden',
          animation: 'slideUp .22s ease',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', background: 'linear-gradient(135deg,#1e1b4b,#312e81)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ color: 'white', fontSize: 15, fontWeight: 800, letterSpacing: -.2 }}>{title}</div>
            {subtitle && <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 10, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button
            className="dd-close"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,.1)', border: 'none', color: 'white',
              borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 15,
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s',
            }}
          >×</button>
        </div>

        {/* Summary bar */}
        <div style={{
          padding: '10px 20px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
          display: 'flex', gap: 20, flexShrink: 0,
        }}>
          {(['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'MINIMAL'] as const).map((lbl) => {
            const cnt = sorted.filter(([, d]) => getLabel(d.score) === lbl).length;
            const clr = lbl === 'CRITICAL' ? '#dc2626' : lbl === 'HIGH' ? '#f97316' : lbl === 'MODERATE' ? '#eab308' : lbl === 'LOW' ? '#84cc16' : '#22c55e';
            return (
              <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: clr, display: 'inline-block' }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: '#374151' }}>{cnt} {lbl}</span>
              </div>
            );
          })}
          <span style={{ marginLeft: 'auto', fontSize: 9, color: '#9ca3af', fontWeight: 600 }}>{sorted.length} domains · Click a row for tooltip</span>
        </div>

        {/* Domain rows */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '10px 20px' }}>
          {sorted.map(([id, d], idx) => {
            const col = getColor(d.score);
            const lbl = getLabel(d.score);
            const bg = getBg(d.score);
            const safety = Math.round(100 - d.score);
            return (
              <div
                key={id}
                className="dd-row"
                style={{
                  display: 'grid', gridTemplateColumns: '24px 1fr 110px 54px 68px',
                  alignItems: 'center', gap: 12, padding: '7px 8px',
                  borderRadius: 8, marginBottom: 3, background: 'white',
                  transition: 'background .15s', cursor: 'default',
                }}
              >
                {/* Rank */}
                <div style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af', textAlign: 'center' }}>{idx + 1}</div>

                {/* Name + bar */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#111827', marginBottom: 3 }}>{d.name}</div>
                  <div style={{ position: 'relative', height: 6, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      width: `${d.score}%`, height: '100%', borderRadius: 4,
                      background: bg, transition: 'width 1s ease',
                    }} />
                  </div>
                </div>

                {/* Score bar label */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 8, color: '#6b7280' }}>Risk {d.score}%</span>
                  <span style={{ fontSize: 8, color: '#22c55e' }}>Safe {safety}%</span>
                </div>

                {/* Numeric score */}
                <div style={{ fontSize: 14, fontWeight: 800, color: col, textAlign: 'right' }}>{Math.round(d.score)}%</div>

                {/* Badge */}
                <div style={{
                  padding: '2px 7px', borderRadius: 10, fontSize: 8, fontWeight: 700,
                  color: 'white', textAlign: 'center', background: col,
                  whiteSpace: 'nowrap',
                }}>{lbl}</div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 20px', borderTop: '1px solid #e5e7eb', background: '#f9fafb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <span style={{ fontSize: 9, color: '#9ca3af' }}>Scores represent risk level — lower safety % = higher risk</span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 18px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >Close</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   APP
══════════════════════════════════════════════════════════════════════════════ */
function App() {
  const [step, setStep] = useState<Step>('onboarding');
  const [metadata, setMetadata] = useState<Metadata>({ name: '', companyName: '', email: '', stage: 'seed', vertical: 'saas-b2b', usesAi: false, physicalProduct: false });
  const [sessionQuestions, setSessionQuestions] = useState<any[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [responses, setResponses] = useState<Response[]>([]);
  const [result, setResult] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sliderValue, setSliderValue] = useState(3);
  const [currentAnswered, setCurrentAnswered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [modal, setModal] = useState<{ title: string; subtitle?: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [serverSessionId, setServerSessionId] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [adminData, setAdminData] = useState<any[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [supabaseSaveStatus, setSupabaseSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pdfUploadStatus, setPdfUploadStatus] = useState<'idle' | 'generating' | 'uploading' | 'done' | 'error'>('idle');
  const [reportPdfBusy, setReportPdfBusy] = useState(false);
  const [dashTheme, setDashTheme] = useState<'light' | 'dark'>('light');
  const [showEarlyBirdsPopup, setShowEarlyBirdsPopup] = useState(false);
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const openModal = (title: string, subtitle?: string) => setModal({ title, subtitle });
  const closeModal = () => setModal(null);

  useEffect(() => {
    const saved = localStorage.getItem('risk_assessment_session');
    if (saved) {
      try {
        const p = JSON.parse(saved);
        if (p.step === 'assessment') {
          setMetadata(p.metadata);
          setSessionQuestions(p.sessionQuestions);
          setCurrentQIndex(p.currentQIndex);
          setResponses(p.responses || []);
          setSliderValue(p.sliderValue || 3);
          const currentQ = p.sessionQuestions[p.currentQIndex];
          const hasAnswer = currentQ && p.responses?.some((r: Response) => r.questionId === currentQ.id);
          setCurrentAnswered(!!hasAnswer);
          setStep('assessment');
        }
      } catch { localStorage.removeItem('risk_assessment_session'); }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (step === 'assessment') localStorage.setItem('risk_assessment_session', JSON.stringify({ step, metadata, sessionQuestions, currentQIndex, responses, sliderValue }));
    // Once the assessment is completed we don't persist the results dashboard.
    // This ensures that closing and reopening the tab restarts the app at the
    // onboarding screen instead of resuming on the previous dashboard.
    else localStorage.removeItem('risk_assessment_session');
  }, [step, metadata, sessionQuestions, currentQIndex, responses, sliderValue, result]);

  /* ── Payment return: hydrate the paid flag + dashboard, keep across refreshes ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const sessionFromUrl = params.get('session');

    // Restore the results dashboard saved for a paid session (see snapshot effect
    // below). This is only ever consumed for a paid/returning session, so an
    // ordinary reopen still starts fresh.
    const restoreSnapshot = (): boolean => {
      try {
        const snap = localStorage.getItem('risk_result_snapshot');
        if (snap) {
          const { metadata: m, result: r } = JSON.parse(snap);
          if (r) { setMetadata(m); setResult(r); setStep('results'); return true; }
        }
      } catch { /* ignore malformed snapshot */ }
      return false;
    };

    // 1. Handle the redirect coming back from /payment-status.
    if (payment) {
      if (payment === 'success') {
        setPaid(true);
        setPaymentError(null);
        if (sessionFromUrl) {
          setServerSessionId(sessionFromUrl);
          localStorage.setItem('risk_payment_session', sessionFromUrl);
        }
        restoreSnapshot();
      } else if (payment === 'failed') {
        setPaid(false);
        setPaymentError('Payment could not be verified. Please try again.');
        restoreSnapshot(); // bring them back to the dashboard to retry
      }
      // Strip the payment params so a refresh doesn't re-trigger this.
      params.delete('payment');
      params.delete('session');
      const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
      window.history.replaceState({}, document.title, clean);
    }

    // 2. Re-hydrate paid state from the DB so a manual refresh doesn't re-lock.
    const knownSession = sessionFromUrl || localStorage.getItem('risk_payment_session');
    if (knownSession) {
      (async () => {
        try {
          const res = await fetch(`${API_URL}/api/session/${encodeURIComponent(knownSession)}/payment`);
          if (res.ok) {
            const data = await res.json();
            if (data.paid) {
              setPaid(true);
              if (!payment) restoreSnapshot();
            } else if (!payment) {
              localStorage.removeItem('risk_result_snapshot'); // unpaid → don't keep a stale dashboard
            }
          }
        } catch { /* offline — ignore */ }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the dashboard for a paid session so refreshes keep it unlocked.
  useEffect(() => {
    if (paid && result) {
      localStorage.setItem('risk_result_snapshot', JSON.stringify({ metadata, result }));
    }
  }, [paid, result, metadata]);

  /* ── Admin view: ?admin=KEY loads every user's saved assessment ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('admin');
    if (!key) return;
    setAdminMode(true);
    setIsLoading(false);
    setAdminLoading(true);
    // Remove the key from the address bar so it isn't left in history/Referer.
    params.delete('admin');
    window.history.replaceState({}, document.title, window.location.pathname + (params.toString() ? `?${params}` : ''));
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/assessments`, { headers: { 'x-admin-key': key } });
        if (!res.ok) {
          setAdminError(res.status === 401 ? 'Invalid admin key.' : 'Failed to load assessments.');
        } else {
          const data = await res.json();
          setAdminData(data.assessments || []);
        }
      } catch {
        setAdminError('Could not reach the server.');
      }
      setAdminLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open one user's saved dashboard from the admin list. Prefer the full stored
  // result object; fall back to reconstruction from the summary columns.
  const openAdminAssessment = (row: any) => {
    const u = row.users || {};
    const m = row.metadata_json || {};
    setMetadata({
      name: m.name || u.name || '', companyName: m.companyName || u.company_name || '', email: m.email || u.email || '',
      stage: m.stage || u.stage || 'seed', vertical: m.vertical || u.vertical || 'saas-b2b',
      usesAi: m.usesAi ?? false, physicalProduct: m.physicalProduct ?? false,
    });
    setResult(row.result_json || reconstructResultFromRow(row));
    setStep('results');
    window.scrollTo(0, 0);
  };

  // Return from a dashboard to the admin list.
  const backToAdminList = () => { setResult(null); setStep('onboarding'); };

  const handleRegisterAndStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metadata.name || !metadata.companyName || !metadata.email) return alert('Please fill all fields');
    setIsGenerating(true);

    // Create server session for Supabase persistence
    try {
      const res = await fetch(`${API_URL}/api/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: metadata.name,
          email: metadata.email,
          companyName: metadata.companyName,
          stage: metadata.stage,
          vertical: metadata.vertical,
          usesAi: metadata.usesAi,
          physicalProduct: metadata.physicalProduct,
        }),
      });
      const data = await res.json();
      setServerSessionId(data.sessionId);
      if (data.sessionId) localStorage.setItem('risk_payment_session', data.sessionId);
      console.log('✅ Server session created:', data.sessionId);
    } catch (err) {
      console.warn('⚠️ Could not reach backend server, continuing offline:', err);
    }

    // Generate client-side questions and start assessment
    setSessionQuestions(generateUniqueAssessment(metadata));
    setStep('assessment');
    setCurrentQIndex(0);
    setResponses([]);
    setSliderValue(3);
    setIsGenerating(false);
  };

  /* ── Look up a profile by email and resume where they left off ── */
  const loginByEmail = async (email: string): Promise<'ok' | 'notfound' | 'error'> => {
    try {
      const profileRes = await fetch(`${API_URL}/api/user/${encodeURIComponent(email)}`);
      if (profileRes.status === 404) return 'notfound';
      if (!profileRes.ok) return 'error';

      const profile = await profileRes.json();
      const loadedMetadata: Metadata = {
        name: profile.name,
        companyName: profile.company_name,
        email: profile.email,
        stage: profile.stage,
        vertical: profile.vertical,
        usesAi: profile.uses_ai,
        physicalProduct: profile.physical_product,
      };
      setMetadata(loadedMetadata);

      const historyRes = await fetch(`${API_URL}/api/user/${encodeURIComponent(email)}/assessments`);
      const historyData = historyRes.ok ? await historyRes.json() : { assessments: [] };
      const latest = historyData.assessments?.[0];

      if (latest) {
        setResult(latest.result_json || reconstructResultFromRow(latest));
        setStep('results');
      } else {
        // No past assessment yet — go straight into a new one with their known profile
        setSessionQuestions(generateUniqueAssessment(loadedMetadata));
        setStep('assessment');
        setCurrentQIndex(0);
        setResponses([]);
        setSliderValue(3);
      }
      return 'ok';
    } catch (err) {
      console.error('❌ Login failed:', err);
      return 'error';
    }
  };

  /* ── Returning user: look up their profile and pick up where they left off ── */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail) return;
    setLoginLoading(true);
    setLoginError(null);
    const result = await loginByEmail(loginEmail);
    if (result === 'notfound') setLoginError('No account found for this email. Try signing up instead.');
    else if (result === 'error') setLoginError('Could not reach server. Please try again.');
    setLoginLoading(false);
  };

  /* ── Continue with Google via Supabase Auth (redirects to Google) ── */
  const handleGoogleAuth = async () => {
    if (!supabase) {
      setLoginError('Google sign-in is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, and enable Google under Supabase → Authentication → Providers.');
      return;
    }
    setLoginError(null);
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      console.error('❌ Google sign-in failed:', error);
      setLoginError('Google sign-in could not start. Please try again.');
      setGoogleLoading(false);
    }
    // On success the browser redirects to Google; the return is handled on load.
  };

  /* ── Finish a Google sign-in after Supabase redirects back with a session ── */
  useEffect(() => {
    if (!supabase) return;
    const returning = window.location.hash.includes('access_token') || window.location.search.includes('code=');
    // Only auto-resume the account when the user is actually coming back from a
    // Google OAuth redirect. On a normal reopen we must NOT silently restore the
    // persisted Supabase session and jump to the previous results dashboard —
    // reopening the app should start fresh at the onboarding screen so the user
    // can take the assessment again.
    if (!returning) return;
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!active || !user?.email) return;
      const email = user.email;
      const name: string = user.user_metadata?.full_name || user.user_metadata?.name || '';
      setGoogleLoading(true);
      setMetadata(m => ({ ...m, name: name || m.name, email }));
      setLoginEmail(email);
      const result = await loginByEmail(email);
      if (!active) return;
      if (result === 'notfound') { setAuthMode('signup'); setLoginError(null); }
      else if (result === 'error') { setLoginError('Could not reach server. Please try again.'); }
      setGoogleLoading(false);
      if (returning) window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Send a single response to the backend (fire-and-forget) ── */
  const sendResponseToServer = (domainId: string, questionIndex: number, value: number) => {
    if (!serverSessionId) return;
    fetch(`${API_URL}/api/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: serverSessionId,
        domain: domainId,
        questionIndex,
        value,
      }),
    }).catch(err => console.warn('⚠️ Failed to send response to server:', err));
  };

  /* ── Save completed assessment to Supabase via backend ── */
  const saveToSupabase = async () => {
    if (!metadata) return;
    setSupabaseSaveStatus('saving');
    try {
      const res = await fetch(`${API_URL}/api/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: serverSessionId,
          metadata,
          responses: responses.map(r => ({ domain: r.domainId, value: r.value })),
          result, // full dashboard object so it is stored verbatim in Supabase
        }),
      });
      const data = await res.json();
      if (data.assessmentId) {
        console.log('✅ Assessment saved to Supabase! ID:', data.assessmentId, 'User ID:', data.userId);
        setSupabaseSaveStatus('saved');
        // Capture a JPG of the rendered dashboard and store it (payment-independent).
        captureAndUploadDashboard(data.assessmentId, data.uploadToken);
      } else {
        console.error('❌ Supabase save returned no assessmentId:', data);
        setSupabaseSaveStatus('error');
      }
    } catch (err) {
      console.error('❌ Failed to save to Supabase:', err);
      setSupabaseSaveStatus('error');
    }
  };

  /* ── Snapshot the on-screen dashboard to a JPG and upload it to Supabase ── */
  const captureAndUploadDashboard = async (assessmentId: number, uploadToken?: string) => {
    if (!metadata) return;
    // Let the dashboard finish its entrance animation before capturing.
    await new Promise((r) => setTimeout(r, 900));
    const el = document.getElementById('risk-dashboard-capture');
    if (!el) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(el, {
        backgroundColor: '#f4f5f7',
        scale: Math.min(2, window.devicePixelRatio || 1.5),
        useCORS: true,
        logging: false,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
        // html2canvas re-triggers CSS animations on the cloned DOM and snapshots
        // before they finish, so entrance-animated cards (.fi, opacity:0) render
        // blank. Disable animations/transitions and force them visible.
        onclone: (doc: Document) => {
          const style = doc.createElement('style');
          style.textContent =
            '*{animation:none !important;transition:none !important;}' +
            '.fi{opacity:1 !important;transform:none !important;}' +
            '.res-root{height:auto !important;overflow:visible !important;}';
          doc.head.appendChild(style);
        },
      });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const imageBase64 = dataUrl.split(',')[1];
      const filename = `dashboard_${(metadata.companyName || 'user').replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.jpg`;

      const res = await fetch(`${API_URL}/api/upload-dashboard-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: metadata.email, assessmentId, imageBase64, filename, token: uploadToken }),
      });
      const data = await res.json();
      if (data.success) console.log('✅ Dashboard image stored:', data.url);
      else console.warn('⚠️ Dashboard image upload failed:', data.error);
    } catch (err) {
      console.warn('⚠️ Dashboard capture failed:', err);
    }
  };

  /* ── Generate the report PDF and upload it to Supabase; returns its URL ── */
  const generateAndUploadReport = async (): Promise<string | null> => {
    if (!result || !metadata) return null;
    setPdfUploadStatus('generating');
    // Generate the PDF (template design, rasterized; also triggers a local
    // download via doc.save). Uses the same real data as the dashboard.
    const { generateReportPdf } = await import('./utils/reportPdf');
    const { blob, filename } = await generateReportPdf(result, metadata);
    console.log('✅ PDF generated locally:', filename);

    setPdfUploadStatus('uploading');
    const base64: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    try {
      const res = await fetch(`${API_URL}/api/upload-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: metadata.email, assessmentId: null, pdfBase64: base64, filename, sessionId: serverSessionId }),
      });
      const data = await res.json();
      if (data.success) {
        console.log('✅ PDF uploaded to Supabase:', data.path, `(${(data.fileSize / 1024).toFixed(1)} KB)`);
        setPdfUploadStatus('done');
        return data.url || null;
      }
      console.error('❌ PDF upload failed:', data.error);
      setPdfUploadStatus('error');
      return null;
    } catch (uploadErr) {
      console.error('❌ PDF upload error:', uploadErr);
      setPdfUploadStatus('error');
      return null;
    }
  };

  /* ── Download the designed report as a PDF (template layout, real data) ──
     Also stores a copy of every generated report in our database: this calls
     generateAndUploadReport(), which triggers the local .pdf download AND
     uploads the same PDF to Supabase (pdf-reports storage + pdf_reports table). */
  const handleDownloadReportPdf = async () => {
    if (!result || !metadata || reportPdfBusy) return;
    setReportPdfBusy(true);
    try {
      await generateAndUploadReport(); // local download + persist a copy to the DB
    } catch (err) {
      console.error('❌ PDF report generation/upload failed:', err);
    } finally {
      setReportPdfBusy(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!result || !metadata) return;

    // Already paid (this session or re-hydrated from the DB) → deliver the report.
    if (paid) {
      setShowEarlyBirdsPopup(true);
      try {
        await generateAndUploadReport();
      } catch (err) {
        console.error('❌ Report preparation failed:', err);
      }
      return;
    }

    // Payment gateway temporarily disabled — deliver the report without checkout.
    setPaymentError(null);
    setPaid(true);
    setShowEarlyBirdsPopup(true);
    try {
      await generateAndUploadReport();
    } catch (err) {
      console.error('❌ Report preparation failed:', err);
    }

    // Not paid yet → run Razorpay checkout.
    // setPaymentError(null);
    // await startRazorpayCheckout({
    //   apiUrl: API_URL,
    //   name: metadata.name,
    //   email: metadata.email,
    //   companyName: metadata.companyName,
    //   sessionId: serverSessionId,
    //   assessmentId: null,
    //   // User closed the modal without paying — stay on the dashboard.
    //   onDismiss: () => {
    //     setPdfUploadStatus('idle');
    //   },
    //   // Payment could not be started / failed — surface an inline message.
    //   onFailure: (reason) => {
    //     console.warn('⚠️ Payment failed:', reason);
    //     setPaymentError('Payment could not be completed. Please try again.');
    //   },
    //   // Success handler runs in our page context: save the dashboard so it
    //   // survives the round-trip, then redirect the top-level window to the
    //   // external Payment Hub with the Razorpay identifiers appended.
    //   onSuccess: (response) => {
    //     try {
    //       localStorage.setItem('risk_result_snapshot', JSON.stringify({ metadata, result }));
    //     } catch { /* ignore quota errors */ }
    //     window.location.href = buildHubRedirectUrl(response);
    //   },
    // });
  };

  /* ── Straight-lining detection ── */
  const detectStraightLining = (allResponses: { questionId: string; domainId: string; value: number }[]): boolean => {
    if (allResponses.length < 5) return false;
    // Count frequency of each answer value
    const freq: Record<number, number> = {};
    allResponses.forEach(r => { freq[r.value] = (freq[r.value] || 0) + 1; });
    const maxFreq = Math.max(...Object.values(freq));
    const ratio = maxFreq / allResponses.length;
    // If 80%+ of answers are the same value → straight-lining
    return ratio >= 0.8;
  };

  const handleNext = () => {
    if (!currentAnswered) return;
    const cq = sessionQuestions[currentQIndex];
    const updated = [...responses, { questionId: cq.id, domainId: cq.domainId, value: sliderValue }];
    setResponses(updated);
    sendResponseToServer(cq.domainId, currentQIndex, sliderValue);
    if (currentQIndex < sessionQuestions.length - 1) { setCurrentQIndex(p => p + 1); setSliderValue(3); setCurrentAnswered(false); }
    else if (detectStraightLining(updated)) { setStep('retest'); }
    else { const r = calculateRiskScore(updated, metadata); setResult(r); setStep('results'); setTimeout(() => saveToSupabase(), 500); }
  };

  const handleSelectOption = (value: number) => {
    setCurrentAnswered(true);
    const cq = sessionQuestions[currentQIndex];
    const updated = [...responses, { questionId: cq.id, domainId: cq.domainId, value: value }];
    setResponses(updated);
    sendResponseToServer(cq.domainId, currentQIndex, value);
    if (currentQIndex < sessionQuestions.length - 1) {
      setCurrentQIndex(p => p + 1);
      setSliderValue(3);
      setCurrentAnswered(false);
    } else if (detectStraightLining(updated)) {
      setStep('retest');
    } else {
      const r = calculateRiskScore(updated, metadata);
      setResult(r);
      setStep('results');
      setTimeout(() => saveToSupabase(), 500);
    }
  };

  const handleRetake = () => {
    setResponses([]);
    setCurrentQIndex(0);
    setSliderValue(3);
    setSessionQuestions(generateUniqueAssessment(metadata));
    setStep('assessment');
  };

  const handlePrev = () => {
    if (currentQIndex > 0) {
      setCurrentQIndex(p => p - 1);
      const pq = sessionQuestions[currentQIndex - 1];
      const pr = responses.find(r => r.questionId === pq.id);
      setSliderValue(pr ? pr.value : 3);
      setCurrentAnswered(!!pr);
    }
  };

  const handleReset = () => {
    localStorage.removeItem('risk_assessment_session');
    localStorage.removeItem('risk_result_snapshot');
    localStorage.removeItem('risk_payment_session');
    setPaid(false); setPaymentError(null);
    setStep('onboarding'); setResult(null); setResponses([]); setSessionQuestions([]); setCurrentQIndex(0);
  };

  const SHARED_STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Roboto', system-ui, sans-serif; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
  `;

  /* ── LOADING ── */
  if (isLoading || isGenerating) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', animation: 'spin 0.8s linear infinite', marginBottom: 16 }} />
      <p style={{ color: '#9ca3af', fontSize: 13 }}>{isGenerating ? 'Generating assessment…' : 'Loading…'}</p>
    </div>
  );

  /* ── ADMIN: list every user's saved assessment ── */
  if (adminMode && step !== 'results') return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Roboto', system-ui, sans-serif", padding: '24px 16px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Risk Assessments — Admin</h1>
          <span style={{ fontSize: 13, color: '#64748b' }}>{adminData.length} record{adminData.length === 1 ? '' : 's'}</span>
        </div>

        {adminLoading && <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading assessments…</div>}
        {adminError && <div style={{ padding: 16, background: '#fef2f2', color: '#b91c1c', borderRadius: 10, fontSize: 14 }}>⚠️ {adminError}</div>}

        {!adminLoading && !adminError && adminData.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No assessments found yet.</div>
        )}

        {!adminLoading && !adminError && adminData.length > 0 && (
          <div style={{ overflowX: 'auto', background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Name</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Company</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Email</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Score</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Rating</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Dashboard JPG</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Date</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}></th>
                </tr>
              </thead>
              <tbody>
                {adminData.map((row: any, i: number) => {
                  const u = row.users || {};
                  return (
                    <tr key={row.id ?? i} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>{u.name || '—'}</td>
                      <td style={{ padding: '10px 14px', color: '#334155' }}>{u.company_name || '—'}</td>
                      <td style={{ padding: '10px 14px', color: '#64748b' }}>{u.email || '—'}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: scoreColor(row.score) }}>{row.score}</td>
                      <td style={{ padding: '10px 14px', color: '#334155' }}>{row.rating}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {row.dashboard_image_url ? (
                          <a href={row.dashboard_image_url} target="_blank" rel="noopener noreferrer">
                            <img src={row.dashboard_image_url} alt="dashboard" style={{ width: 90, height: 'auto', borderRadius: 6, border: '1px solid #e2e8f0', display: 'block' }} />
                          </a>
                        ) : (
                          <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <button
                          onClick={() => openAdminAssessment(row)}
                          style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: 'white', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
                        >
                          View dashboard
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  /* ── RETEST PROMPT ── */
  if (step === 'retest') return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      background: 'linear-gradient(180deg, #fef2f2 0%, #fff7ed 30%, #fffbeb 60%, #f9fafb 100%)',
      padding: 24, textAlign: 'center',
    }}>
      <style>{SHARED_STYLES + `
        @keyframes retestPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @keyframes retestFadeIn { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:none; } }
        @keyframes retestShake { 0%,100% { transform: translateX(0); } 10%,30%,50%,70%,90% { transform: translateX(-4px); } 20%,40%,60%,80% { transform: translateX(4px); } }
      `}</style>

      {/* Warning Icon */}
      <div style={{
        width: 90, height: 90, borderRadius: '50%',
        background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 32px rgba(245,158,11,.35)',
        animation: 'retestPulse 2s ease infinite, retestFadeIn .5s ease',
        marginBottom: 28,
      }}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>

      {/* Title */}
      <h1 style={{
        fontSize: 28, fontWeight: 800, color: '#0f172a',
        marginBottom: 10, letterSpacing: -0.3,
        animation: 'retestFadeIn .6s ease .1s both',
      }}>
        Response Pattern Detected
      </h1>

      {/* Description */}
      <p style={{
        fontSize: 15, color: '#64748b', fontWeight: 400,
        maxWidth: 520, lineHeight: 1.7, marginBottom: 12,
        animation: 'retestFadeIn .6s ease .2s both',
      }}>
        Our analysis detected that you selected <strong style={{ color: '#d97706' }}>the same or very similar answers</strong> for the majority of the assessment questions.
      </p>

      {/* Info card */}
      <div style={{
        background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12,
        padding: '16px 24px', maxWidth: 480, marginBottom: 28,
        animation: 'retestFadeIn .6s ease .3s both',
      }}>
        <p style={{ fontSize: 13, color: '#92400e', fontWeight: 600, marginBottom: 8 }}>
          ⚠️ Why does this matter?
        </p>
        <p style={{ fontSize: 12, color: '#78716c', lineHeight: 1.6 }}>
          Consistent identical responses suggest the answers may not accurately reflect your organization's unique risk profile. This can lead to <strong>unreliable scores</strong> and <strong>misleading recommendations</strong>. For accurate results, please consider each question carefully.
        </p>
      </div>

      {/* Detected pattern visual */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 32,
        animation: 'retestFadeIn .6s ease .35s both',
        flexWrap: 'wrap', justifyContent: 'center', maxWidth: 360,
      }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{
            width: 28, height: 28, borderRadius: 6,
            background: i < 10 ? 'linear-gradient(135deg, #f59e0b, #fbbf24)' : '#e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, color: i < 10 ? 'white' : '#94a3b8',
            animation: i < 10 ? 'retestShake .6s ease ' + (0.4 + i * 0.05) + 's both' : 'none',
          }}>
            {i < 10 ? '3' : '?'}
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 16, animation: 'retestFadeIn .6s ease .5s both', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={handleRetake}
          style={{
            padding: '14px 36px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #0891b2, #0ea5e9)',
            color: 'white', fontSize: 15, fontWeight: 700,
            cursor: 'pointer', transition: 'all .3s ease',
            boxShadow: '0 4px 18px rgba(14,165,233,.35)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(14,165,233,.45)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 18px rgba(14,165,233,.35)'; }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
          </svg>
          Retake Assessment
        </button>

        <button
          onClick={handleReset}
          style={{
            padding: '14px 28px', borderRadius: 12,
            border: '1.5px solid #e2e8f0', background: 'white',
            color: '#64748b', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', transition: 'all .3s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#334155'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#64748b'; }}
        >
          Back to Home
        </button>
      </div>

      {/* Footer note */}
      <p style={{
        fontSize: 10, color: '#94a3b8', marginTop: 28,
        fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5,
        animation: 'retestFadeIn .6s ease .6s both',
      }}>
        Assessment Integrity • Powered by Infopace Analytics
      </p>
    </div>
  );

  /* ── ONBOARDING ── */
  if (step === 'onboarding') return (
    <div className="ip-shell" style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      background: '#0b1220',
      position: 'relative',
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&display=swap');`}</style>
      <style>{`
        @keyframes gravityFloat1 {
          0% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
          10% { opacity: 0.6; }
          90% { opacity: 0.6; }
          100% { transform: translateY(-100vh) rotate(360deg); opacity: 0; }
        }
        @keyframes gravityFloat2 {
          0% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
          15% { opacity: 0.4; }
          85% { opacity: 0.4; }
          100% { transform: translateY(-100vh) rotate(-270deg); opacity: 0; }
        }
        @keyframes gravityBounce {
          0% { transform: translateY(100vh) scale(1); opacity: 0; }
          10% { opacity: 0.7; }
          25% { transform: translateY(60vh) scale(1.1); }
          40% { transform: translateY(85vh) scale(0.9); }
          55% { transform: translateY(50vh) scale(1.05); }
          70% { transform: translateY(75vh) scale(0.95); }
          85% { transform: translateY(65vh) scale(1); }
          100% { transform: translateY(100vh) scale(1); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(1.1); }
        }
        .gravity-orb-1 { position: absolute; width: 280px; height: 280px; border-radius: 50%; background: radial-gradient(circle, rgba(14,165,233,0.12) 0%, transparent 70%); animation: gravityFloat1 18s linear infinite; pointer-events: none; z-index: 0; }
        .gravity-orb-2 { position: absolute; width: 180px; height: 180px; border-radius: 50%; background: radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%); animation: gravityFloat2 22s linear infinite; pointer-events: none; z-index: 0; }
        .gravity-orb-3 { position: absolute; width: 120px; height: 120px; border-radius: 50%; background: radial-gradient(circle, rgba(6,182,212,0.15) 0%, transparent 70%); animation: gravityBounce 12s ease-in infinite; pointer-events: none; z-index: 0; }
        .gravity-orb-4 { position: absolute; width: 200px; height: 200px; border-radius: 50%; background: radial-gradient(circle, rgba(245,158,11,0.08) 0%, transparent 70%); animation: gravityFloat1 25s linear infinite 5s; pointer-events: none; z-index: 0; }
        .gravity-bg { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
      `}</style>
      {/* clean split-panel background */}
      <style>{SHARED_STYLES + `
        @keyframes ipFadeIn { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:none; } }
        @keyframes ipPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(14,165,233,.18); } 50% { box-shadow: 0 0 0 10px rgba(14,165,233,0); } }

        .ip-field-wrap { position: relative; }
        .ip-field-icon {
          position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
          color: #94a3b8; pointer-events: none; display: flex; align-items: center; z-index: 2;
        }
        .ip-field {
          width: 100%; padding: 11px 40px 11px 40px; 
          background: #f1f5f9; border: 1.5px solid #e2e8f0; border-radius: 8px;
          color: #1e293b; font-size: 13px; font-family: inherit; font-weight: 500;
          outline: none; transition: all .25s ease;
        }
        .ip-field:focus { border-color: #0ea5e9; background: #ffffff; box-shadow: 0 0 0 3px rgba(14,165,233,.1); }
        .ip-field::placeholder { color: #94a3b8; font-weight: 400; }

        .ip-select {
          width: 100%; padding: 10px 14px 10px 36px;
          background: #f1f5f9; border: 1.5px solid #e2e8f0; border-radius: 8px;
          color: #1e293b; font-size: 12px; font-family: inherit; font-weight: 500;
          outline: none; transition: all .25s ease;
          appearance: none; -webkit-appearance: none; cursor: pointer;
        }
        .ip-select:focus { border-color: #0ea5e9; background: #ffffff; box-shadow: 0 0 0 3px rgba(14,165,233,.1); }

        .ip-btn {
          width: 100%; padding: 12px 24px; 
          background: linear-gradient(135deg, #0891b2 0%, #0ea5e9 50%, #38bdf8 100%);
          border: none; border-radius: 10px; color: white; 
          font-size: 14px; font-weight: 700; font-family: inherit; 
          cursor: pointer; transition: all .3s ease;
          box-shadow: 0 4px 14px rgba(14,165,233,.3);
          position: relative; overflow: hidden; letter-spacing: 0.3px;
        }
        .ip-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(14,165,233,.4); background: linear-gradient(135deg, #0e7490 0%, #0891b2 50%, #0ea5e9 100%); }
        .ip-btn:active { transform: translateY(-1px) scale(0.99); }
        .ip-btn::before { content:''; position:absolute; top:0; left:-100%; width:100%; height:100%; background:linear-gradient(90deg,transparent,rgba(255,255,255,.15),transparent); transition:left .5s ease; }
        .ip-btn:hover::before { left:100%; }

        .ip-toggle-box {
          display: flex; align-items: center; gap: 8px; padding: 8px 10px;
          background: #f8fafc; border: 1.5px solid #e2e8f0;
          border-radius: 8px; cursor: pointer; transition: all .25s ease; flex: 1;
        }
        .ip-toggle-box:hover { border-color: #cbd5e1; background: #f1f5f9; }

        .ip-checkbox { width: 15px; height: 15px; accent-color: #0891b2; cursor: pointer; flex-shrink: 0; }

        .ip-footer-link { color: #64748b; font-size: 11px; font-weight: 500; text-decoration: none; transition: color .2s; cursor: pointer; }
        .ip-footer-link:hover { color: #0891b2; }

        /* ── Responsive: compact on short screens ── */
        @media (max-height: 750px) {
          .ip-field { padding: 9px 36px 9px 36px; font-size: 12px; }
          .ip-select { padding: 8px 12px 8px 32px; font-size: 11px; }
          .ip-btn { padding: 10px 20px; font-size: 13px; }
          .ip-toggle-box { padding: 6px 8px; gap: 6px; }
          .ip-checkbox { width: 14px; height: 14px; }
          .ip-form-gap { gap: 10px !important; }
          .ip-logo-area { margin-bottom: 16px !important; }
          .ip-logo-img { height: 65px !important; }
          .ip-welcome-h1 { font-size: 22px !important; margin-bottom: 3px !important; }
          .ip-welcome-sub { font-size: 12px !important; margin-bottom: 14px !important; }
          .ip-consent-box { padding: 8px 10px !important; }
          .ip-consent-box p { margin-bottom: 6px !important; font-size: 9px !important; }
          .ip-consent-box label span { font-size: 11px !important; }
          .ip-security-notice { margin-top: 10px !important; padding-top: 8px !important; }
          .ip-main-content { padding: 12px 20px 8px !important; }
          .ip-footer { padding: 10px 24px !important; }
          .ip-field-label { font-size: 11px !important; margin-bottom: 4px !important; }
        }

        @media (max-height: 600px) {
          .ip-field { padding: 7px 34px 7px 34px; font-size: 11px; border-radius: 6px; }
          .ip-select { padding: 6px 10px 6px 30px; font-size: 10px; border-radius: 6px; }
          .ip-btn { padding: 8px 16px; font-size: 12px; border-radius: 8px; }
          .ip-toggle-box { padding: 5px 7px; border-radius: 6px; }
          .ip-toggle-box span { font-size: 10px !important; }
          .ip-form-gap { gap: 7px !important; }
          .ip-logo-area { margin-bottom: 10px !important; }
          .ip-logo-img { height: 52px !important; }
          .ip-welcome-h1 { font-size: 18px !important; margin-bottom: 2px !important; }
          .ip-welcome-sub { font-size: 11px !important; margin-bottom: 10px !important; }
          .ip-consent-box { padding: 6px 8px !important; }
          .ip-consent-box p { margin-bottom: 4px !important; font-size: 8px !important; }
          .ip-consent-box label { margin-bottom: 4px !important; }
          .ip-consent-box label span { font-size: 10px !important; line-height: 1.3 !important; }
          .ip-security-notice { margin-top: 6px !important; padding-top: 6px !important; }
          .ip-security-notice p { font-size: 8px !important; }
          .ip-main-content { padding: 8px 16px 4px !important; }
          .ip-footer { padding: 6px 16px !important; }
          .ip-field-label { font-size: 10px !important; margin-bottom: 3px !important; }
        }

        /* ── Responsive: narrow screens (mobile) ── */
        @media (max-width: 480px) {
          .ip-stage-grid { grid-template-columns: 1fr !important; }
          .ip-toggle-row { flex-direction: column !important; }
          .ip-main-content { padding: 16px 12px 8px !important; }
          .ip-footer { padding: 10px 12px !important; flex-direction: column !important; align-items: center !important; text-align: center; }
        }
      `}</style>

      {/* ── Redesign styles ── */}
      <style>{`
        /* white inputs to match the reference card */
        .ip-field { width:100%; padding:10px 14px 10px 40px; background:#fff; border:1.5px solid #e2e8f0; border-radius:10px; color:#1e293b; font-size:13px; font-family:inherit; font-weight:500; outline:none; transition:all .2s ease; }
        .ip-field:focus { border-color:#2563eb; background:#fff; box-shadow:0 0 0 3px rgba(37,99,235,.12); }
        .ip-field::placeholder { color:#94a3b8; font-weight:400; }
        .ip-select { width:100%; padding:10px 14px 10px 36px; background:#fff; border:1.5px solid #e2e8f0; border-radius:10px; color:#1e293b; font-size:12px; font-family:inherit; font-weight:500; outline:none; transition:all .2s ease; appearance:none; -webkit-appearance:none; cursor:pointer; }
        .ip-select:focus { border-color:#2563eb; background:#fff; box-shadow:0 0 0 3px rgba(37,99,235,.12); }
        .ip-btn { width:100%; padding:11px 24px; background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 55%,#3b82f6 100%); border:none; border-radius:11px; color:#fff; font-size:14px; font-weight:700; font-family:inherit; cursor:pointer; transition:all .25s ease; box-shadow:0 8px 20px rgba(37,99,235,.28); position:relative; overflow:hidden; letter-spacing:.3px; }
        .ip-btn:hover { transform:translateY(-2px); box-shadow:0 12px 28px rgba(37,99,235,.36); background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 55%,#3b82f6 100%); }
        .ip-btn:active { transform:translateY(0) scale(.99); }
        .ip-toggle-box { display:flex; align-items:center; gap:8px; padding:8px 12px; background:#fff; border:1.5px solid #e2e8f0; border-radius:10px; cursor:pointer; transition:all .2s ease; flex:1; }
        .ip-toggle-box:hover { border-color:#93c5fd; background:#f8fbff; }
        .ip-checkbox { accent-color:#2563eb; }

        /* split layout */
        .ip-split { flex:1; display:flex; min-height:0; }
        .ip-left { width:40%; max-width:600px; padding:56px 52px; display:flex; flex-direction:column; justify-content:center; position:relative; overflow:hidden; color:#fff;
          background: radial-gradient(1100px 560px at 12% -10%, rgba(37,99,235,.22), transparent 60%), linear-gradient(160deg,#0b1220 0%,#0f1e3c 55%,#0a1526 100%); }
        .ip-left::after { content:''; position:absolute; inset:0; background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px); background-size:44px 44px; -webkit-mask-image:radial-gradient(circle at 28% 42%,#000,transparent 78%); mask-image:radial-gradient(circle at 28% 42%,#000,transparent 78%); pointer-events:none; }
        .ip-left > * { position:relative; z-index:1; }
        .ip-cursor-field { position:absolute; inset:0; z-index:0; pointer-events:none; }
        .ip-logo-chip { position:absolute; top:30px; left:52px; z-index:3; display:flex; align-items:center; }
        .ip-logo-chip img { height:54px; width:auto; display:block; filter:drop-shadow(0 2px 10px rgba(0,0,0,.6)); }
        .ip-card-logo { display:none; }
        .ip-eyebrow { font-size:12px; letter-spacing:3px; text-transform:uppercase; color:#5b8def; font-weight:700; margin-bottom:22px; }
        .ip-display { font-family:'Playfair Display',Georgia,serif; font-size:46px; line-height:1.08; font-weight:600; margin-bottom:22px; letter-spacing:-.5px; }
        .ip-lede { font-size:15px; line-height:1.7; color:#9fb0d0; max-width:430px; margin-bottom:44px; }
        .ip-stats { display:flex; flex-direction:column; gap:24px; }
        .ip-stat-num { font-size:34px; font-weight:800; color:#fff; letter-spacing:-1px; line-height:1; }
        .ip-stat-label { font-size:13px; color:#8296bd; margin-top:6px; }
        .ip-copyright { position:absolute; bottom:24px; left:52px; font-size:11px; color:#5a6c93; z-index:1; }

        /* right / form */
        .ip-right { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding:26px 32px; overflow:auto;
          background:#eef4fb; background-image:linear-gradient(rgba(37,99,235,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(37,99,235,.05) 1px,transparent 1px); background-size:34px 34px; }
        .ip-card { width:100%; max-width:520px; background:#fff; border:1px solid #e6eef8; border-radius:18px; padding:26px 30px 20px; box-shadow:0 24px 60px rgba(15,30,60,.12); animation:ipFadeIn .5s ease; }
        .ip-card-h1 { font-size:23px; font-weight:800; color:#0f172a; letter-spacing:-.4px; margin-bottom:3px; }
        .ip-card-sub { font-size:13px; color:#64748b; margin-bottom:14px; }
        .ip-name-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .ip-confid { text-align:center; margin-top:12px; font-size:10px; font-weight:700; letter-spacing:2.5px; color:#94a3b8; text-transform:uppercase; }
        .ip-google-btn { width:100%; display:flex; align-items:center; justify-content:center; gap:10px; padding:9px 16px; background:#fff; border:1.5px solid #dbe1ea; border-radius:11px; color:#1f2937; font-size:14px; font-weight:600; font-family:inherit; cursor:pointer; transition:all .18s ease; }
        .ip-google-btn:hover { background:#f8fafc; border-color:#c3ccd9; box-shadow:0 2px 8px rgba(15,30,60,.08); }
        .ip-google-btn:disabled { opacity:.65; cursor:default; }
        .ip-or { display:flex; align-items:center; margin:10px 0 0; }
        .ip-or span { padding:0 12px; color:#94a3b8; font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; }
        .ip-or::before, .ip-or::after { content:''; height:1px; flex:1; background:#e6eef8; }

        @media (max-width: 900px) {
          .ip-left { display:none; }
          .ip-right { padding:26px 16px; }
          .ip-card-logo { display:flex; justify-content:center; margin-bottom:18px; }
          .ip-card-logo img { height:44px; width:auto; }
        }
        @media (max-width: 560px) {
          .ip-card { padding:24px 20px; }
          .ip-name-grid { grid-template-columns:1fr; }
        }
      `}</style>

      {/* ── Split panels ── */}
      <div className="ip-split">

        {/* ── Left marketing panel ── */}
        <div className="ip-left">
          <CursorField className="ip-cursor-field" />
          <div className="ip-logo-chip">
            <img src="/infopace-logo-300x128.webp" alt="Infopace — Commitment to Excellence" />
          </div>
          <div className="ip-eyebrow">Enterprise Risk Assessment</div>
          <h1 className="ip-display">Know your risk<br />before it finds you.</h1>
          <p className="ip-lede">
            Our engine maps your business stage, vertical, and model — then surfaces a
            personalised vulnerability brief within minutes.
          </p>
          <div className="ip-stats">
            <div><div className="ip-stat-num">3×</div><div className="ip-stat-label">Faster than a manual risk audit</div></div>
            <div><div className="ip-stat-num">50+</div><div className="ip-stat-label">Risk signals analysed per assessment</div></div>
            <div><div className="ip-stat-num">5 mins</div><div className="ip-stat-label">From inputs to a full risk dashboard</div></div>
          </div>
          <div className="ip-copyright">© Infopace. Commitment to Excellence.</div>
        </div>

        {/* ── Right form panel ── */}
        <div className="ip-right">
          <div className="ip-card">
            <div className="ip-card-logo">
              <img src="/infopace-logo-300x128.webp" alt="Infopace — Commitment to Excellence" />
            </div>
            <h2 className="ip-card-h1">{authMode === 'signup' ? 'Personal details' : 'Welcome back'}</h2>
            <p className="ip-card-sub">{authMode === 'signup' ? 'Stored securely. Never shared.' : 'Enter your email to continue.'}</p>

            {/* ── Sign Up / Log In toggle ── */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, background: '#eef2f7', borderRadius: 11, padding: 4 }}>
              <button
                type="button"
                onClick={() => { setAuthMode('signup'); setLoginError(null); }}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, transition: 'all .15s',
                  background: authMode === 'signup' ? 'white' : 'transparent',
                  color: authMode === 'signup' ? '#0f172a' : '#64748b',
                  boxShadow: authMode === 'signup' ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                }}
              >Sign Up</button>
              <button
                type="button"
                onClick={() => { setAuthMode('login'); setLoginError(null); }}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, transition: 'all .15s',
                  background: authMode === 'login' ? 'white' : 'transparent',
                  color: authMode === 'login' ? '#0f172a' : '#64748b',
                  boxShadow: authMode === 'login' ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                }}
              >Log In</button>
            </div>

            {/* ── Continue with Google ── */}
            <button type="button" onClick={handleGoogleAuth} disabled={googleLoading} className="ip-google-btn">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              {googleLoading ? 'Connecting…' : 'Continue with Google'}
            </button>

            {loginError && (
              <div style={{ marginTop: 10, fontSize: 11.5, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 10px', lineHeight: 1.35 }}>
                {loginError}
              </div>
            )}

            <div className="ip-or"><span>or</span></div>

          {authMode === 'signup' && (
          <form onSubmit={handleRegisterAndStart} className="ip-form-gap" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* ── Full Name + Company (two-up, like the reference) ── */}
            <div className="ip-name-grid">
            {/* ── Full Name ── */}
            <div>
              <label className="ip-field-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                Full Name
              </label>
              <div className="ip-field-wrap">
                <span className="ip-field-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <input type="text" placeholder="Jane Smith" value={metadata.name}
                  onChange={e => setMetadata({ ...metadata, name: e.target.value })} required className="ip-field" />
              </div>
            </div>

            {/* ── Company Name ── */}
            <div>
              <label className="ip-field-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                Company Name
              </label>
              <div className="ip-field-wrap">
                <span className="ip-field-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" />
                    <line x1="9" y1="9" x2="9" y2="9.01" /><line x1="9" y1="13" x2="9" y2="13.01" />
                    <line x1="9" y1="17" x2="9" y2="17.01" />
                  </svg>
                </span>
                <input type="text" placeholder="Acme Corporation" value={metadata.companyName}
                  onChange={e => setMetadata({ ...metadata, companyName: e.target.value })} required className="ip-field" />
              </div>
            </div>
            </div>

            {/* ── Email Address ── */}
            <div>
              <label className="ip-field-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                Email Address
              </label>
              <div className="ip-field-wrap">
                <span className="ip-field-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M22 7l-10 6L2 7" />
                  </svg>
                </span>
                <input type="email" placeholder="you@example.com" value={metadata.email}
                  onChange={e => setMetadata({ ...metadata, email: e.target.value })} required className="ip-field" />
              </div>
            </div>

            {/* ── Business Stage & Vertical (side by side) ── */}
            <div className="ip-stage-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="ip-field-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                  Business Stage
                </label>
                <div className="ip-field-wrap">
                  <span className="ip-field-icon" style={{ left: 10 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                  </span>
                  <select value={metadata.stage} onChange={e => setMetadata({ ...metadata, stage: e.target.value as BusinessStage })} className="ip-select">
                    <option value="pre-seed">Pre-Seed</option>
                    <option value="seed">Seed</option>
                    <option value="series-a">Series A</option>
                    <option value="series-b">Series B</option>
                    <option value="series-c+">Series C+</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="ip-field-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                  Industry Vertical
                </label>
                <div className="ip-field-wrap">
                  <span className="ip-field-icon" style={{ left: 10 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                    </svg>
                  </span>
                  <select value={metadata.vertical} onChange={e => setMetadata({ ...metadata, vertical: e.target.value as Vertical })} className="ip-select">
                    <option value="saas-b2b">SaaS B2B</option>
                    <option value="fintech">Fintech</option>
                    <option value="healthtech">Healthtech</option>
                    <option value="hardware">Hardware</option>
                    <option value="consumer">Consumer</option>
                    <option value="deeptech">Deeptech</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ── Toggle options ── */}
            <div className="ip-toggle-row" style={{ display: 'flex', gap: 10 }}>
              <label className="ip-toggle-box">
                <input type="checkbox" className="ip-checkbox" checked={metadata.usesAi}
                  onChange={e => setMetadata({ ...metadata, usesAi: e.target.checked })} />
                <span style={{ fontSize: 11, color: '#334155', fontWeight: 500 }}>Uses AI</span>
              </label>
              <label className="ip-toggle-box">
                <input type="checkbox" className="ip-checkbox" checked={metadata.physicalProduct}
                  onChange={e => setMetadata({ ...metadata, physicalProduct: e.target.checked })} />
                <span style={{ fontSize: 11, color: '#334155', fontWeight: 500 }}>Physical Product</span>
              </label>
            </div>

            {/* ── Consent & Agreement ── */}
            <div className="ip-consent-box" style={{
              background: '#f0f9ff', border: '1.5px solid #e0f2fe', borderRadius: 8,
              padding: '8px 12px',
            }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: '#0e7490', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                Consent & Agreement
              </p>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer', marginBottom: 5 }}>
                <input type="checkbox" required className="ip-checkbox" style={{ marginTop: 2 }} />
                <span style={{ fontSize: 11, color: '#475569', lineHeight: 1.4 }}>
                  I agree to the <span style={{ fontWeight: 600, color: '#0891b2' }}>Privacy Policy</span> and understand how my data will be processed
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer' }}>
                <input type="checkbox" required className="ip-checkbox" style={{ marginTop: 2 }} />
                <span style={{ fontSize: 11, color: '#475569', lineHeight: 1.4 }}>
                  I accept the <span style={{ fontWeight: 600, color: '#0891b2' }}>Terms of Service</span> and agree to participate in this assessment
                </span>
              </label>
            </div>

            {/* ── Sign In Button ── */}
            <button type="submit" className="ip-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              Sign In
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </form>
          )}

          {authMode === 'login' && (
          <form onSubmit={handleLogin} className="ip-form-gap" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label className="ip-field-label" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                Email Address
              </label>
              <div className="ip-field-wrap">
                <span className="ip-field-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M22 7l-10 6L2 7" />
                  </svg>
                </span>
                <input type="email" placeholder="you@example.com" value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)} required className="ip-field" />
              </div>
            </div>

            <button type="submit" disabled={loginLoading} className="ip-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: loginLoading ? 0.7 : 1 }}>
              {loginLoading ? 'Logging in…' : 'Log In'}
              {!loginLoading && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              )}
            </button>
          </form>
          )}

            {/* ── Confidentiality line ── */}
            <div className="ip-confid">Encrypted · Confidential · Never Sold</div>
          </div>
        </div>
      </div>
    </div>
  );

  /* ── ASSESSMENT ── */
  if (step === 'assessment' && sessionQuestions.length > 0) {
    const cq = sessionQuestions[currentQIndex];
    const progress = ((currentQIndex + 1) / sessionQuestions.length) * 100;
    const riskLabels = ['Critical Risk', 'Elevated Risk', 'Neutral', 'Low Risk', 'Minimal Risk'];
    const riskColors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];
    const riskValueIndex = Math.min(4, Math.max(0, Math.round(sliderValue) - 1));

    return (
      <div style={{
        minHeight: '100vh',
        width: '100vw',
        background: '#f3f4f6',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        position: 'relative',
        overflow: 'auto'
      }}>
        <style>{`
          @keyframes slideIn { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:none; } }
          .assess-logo-desktop { display: block; }
          @media (max-width: 600px) {
            .assess-logo-desktop { display: none; }
            .assess-body { padding: 14px 12px !important; align-items: flex-start !important; }
            .assess-inner { height: auto !important; }
            .assess-question { font-size: 18px !important; }
            .assess-card { flex: unset !important; min-height: 180px !important; }
            .assess-nav { margin-top: 14px !important; }
            .assess-badge { margin-bottom: 8px !important; }
          }
          @media (max-width: 400px) {
            .assess-question { font-size: 16px !important; }
            .assess-card { min-height: 160px !important; }
          }
        `}</style>
        {/* Watermarks - Graphical */}
        {/* Large Risk Shield - Center Background */}
        <svg style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 400,
          height: 400,
          opacity: 0.08,
          pointerEvents: 'none',
          zIndex: 1
        }} viewBox="0 0 200 200">
          {/* Shield shape */}
          <defs>
            <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0ea9c8" />
              <stop offset="100%" stopColor="#1f2937" />
            </linearGradient>
          </defs>
          <path d="M 100 20 L 160 60 L 160 110 Q 100 160 100 160 Q 100 160 40 110 L 40 60 Z"
            fill="none" stroke="url(#shieldGrad)" strokeWidth="3" strokeLinejoin="round" />
          {/* Risk indicator circle */}
          <circle cx="100" cy="90" r="25" fill="none" stroke="url(#shieldGrad)" strokeWidth="2" />
          <circle cx="100" cy="90" r="15" fill="url(#shieldGrad)" opacity="0.3" />
        </svg>

        {/* Top Right - Risk Meter Gauge */}
        <svg style={{
          position: 'fixed',
          top: 40,
          right: 40,
          width: 120,
          height: 120,
          opacity: 0.12,
          pointerEvents: 'none',
          zIndex: 1
        }} viewBox="0 0 100 100">
          {/* Gauge background */}
          <circle cx="50" cy="60" r="40" fill="none" stroke="#e5e7eb" strokeWidth="2" />
          {/* Risk gradient arc */}
          <path d="M 20 60 A 40 40 0 0 1 80 60" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
          {/* Needle */}
          <line x1="50" y1="60" x2="50" y2="25" stroke="#0ea9c8" strokeWidth="2" strokeLinecap="round" />
          <circle cx="50" cy="60" r="4" fill="#0ea9c8" />
        </svg>

        {/* Bottom Left - Risk Grid Pattern */}
        <svg style={{
          position: 'fixed',
          bottom: 40,
          left: 40,
          width: 100,
          height: 100,
          opacity: 0.1,
          pointerEvents: 'none',
          zIndex: 1
        }} viewBox="0 0 100 100">
          {/* Grid cells with risk colors */}
          <rect x="10" y="10" width="20" height="20" fill="none" stroke="#ef4444" strokeWidth="1.5" />
          <rect x="35" y="10" width="20" height="20" fill="none" stroke="#f97316" strokeWidth="1.5" />
          <rect x="60" y="10" width="20" height="20" fill="none" stroke="#eab308" strokeWidth="1.5" />
          <rect x="10" y="35" width="20" height="20" fill="none" stroke="#84cc16" strokeWidth="1.5" />
          <rect x="35" y="35" width="20" height="20" fill="none" stroke="#22c55e" strokeWidth="1.5" />
          <rect x="60" y="35" width="20" height="20" fill="none" stroke="#0ea9c8" strokeWidth="1.5" />
          <rect x="10" y="60" width="20" height="20" fill="none" stroke="#ef4444" strokeWidth="1.5" />
          <rect x="35" y="60" width="20" height="20" fill="none" stroke="#f97316" strokeWidth="1.5" />
          <rect x="60" y="60" width="20" height="20" fill="none" stroke="#1f2937" strokeWidth="1.5" />
        </svg>

        {/* Bottom Right - Assessment Badge */}
        <div style={{
          position: 'fixed',
          bottom: 40,
          right: 40,
          opacity: 0.12,
          pointerEvents: 'none',
          zIndex: 1
        }}>
          <svg width="100" height="100" viewBox="0 0 100 100">
            {/* Circle */}
            <circle cx="50" cy="50" r="45" fill="none" stroke="#0ea9c8" strokeWidth="2" />
            {/* Checkmark */}
            <path d="M 35 50 L 45 60 L 65 40" fill="none" stroke="#0ea9c8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {/* Outer accent circle */}
            <circle cx="50" cy="50" r="48" fill="none" stroke="#0ea9c8" strokeWidth="1" strokeDasharray="5,5" />
          </svg>
        </div>

        {/* Top Left - Certification Badge */}
        <svg style={{
          position: 'fixed',
          top: 40,
          left: 40,
          width: 90,
          height: 90,
          opacity: 0.1,
          pointerEvents: 'none',
          zIndex: 1
        }} viewBox="0 0 100 100">
          {/* Ribbon background */}
          <path d="M 30 20 L 70 20 L 75 40 L 50 50 L 25 40 Z" fill="none" stroke="#0ea9c8" strokeWidth="2" strokeLinejoin="round" />
          {/* Star in center */}
          <polygon points="50,30 55,45 70,45 58,55 63,70 50,60 37,70 42,55 30,45 45,45" fill="none" stroke="#0ea9c8" strokeWidth="1.5" strokeLinejoin="round" />
          {/* Bottom accent line */}
          <line x1="35" y1="80" x2="65" y2="80" stroke="#0ea9c8" strokeWidth="1.5" strokeLinecap="round" />
        </svg>

        {/* Center Top - Risk Level Indicator */}
        <svg style={{
          position: 'fixed',
          top: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 110,
          height: 110,
          opacity: 0.09,
          pointerEvents: 'none',
          zIndex: 1
        }} viewBox="0 0 100 100">
          {/* Concentric circles */}
          <circle cx="50" cy="50" r="40" fill="none" stroke="#ef4444" strokeWidth="2" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="#f97316" strokeWidth="2" />
          <circle cx="50" cy="50" r="20" fill="none" stroke="#eab308" strokeWidth="2" />
          <circle cx="50" cy="50" r="10" fill="none" stroke="#0ea9c8" strokeWidth="2" />
          {/* Center dot */}
          <circle cx="50" cy="50" r="3" fill="#0ea9c8" />
        </svg>

        {/* Right Side - Ascending Arrow/Progress */}
        <svg style={{
          position: 'fixed',
          right: 40,
          bottom: '50%',
          transform: 'translateY(50%)',
          width: 80,
          height: 120,
          opacity: 0.1,
          pointerEvents: 'none',
          zIndex: 1
        }} viewBox="0 0 60 120">
          {/* Step indicators */}
          <rect x="10" y="90" width="15" height="25" fill="none" stroke="#ef4444" strokeWidth="1.5" />
          <rect x="27" y="70" width="15" height="45" fill="none" stroke="#f97316" strokeWidth="1.5" />
          <rect x="44" y="50" width="15" height="65" fill="none" stroke="#22c55e" strokeWidth="1.5" />
          {/* Arrow */}
          <path d="M 35 30 L 45 45 L 25 45" fill="none" stroke="#0ea9c8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Left Side - Data Points Pattern */}
        <svg style={{
          position: 'fixed',
          left: 40,
          bottom: '50%',
          transform: 'translateY(50%)',
          width: 80,
          height: 120,
          opacity: 0.08,
          pointerEvents: 'none',
          zIndex: 1
        }} viewBox="0 0 60 120">
          {/* Scattered data points connected by lines */}
          <circle cx="15" cy="100" r="2" fill="#ef4444" />
          <circle cx="30" cy="80" r="2" fill="#f97316" />
          <circle cx="45" cy="90" r="2" fill="#eab308" />
          <circle cx="25" cy="60" r="2" fill="#84cc16" />
          <circle cx="40" cy="70" r="2" fill="#22c55e" />
          <circle cx="50" cy="50" r="2" fill="#0ea9c8" />
          {/* Connection lines */}
          <line x1="15" y1="100" x2="30" y2="80" stroke="#e5e7eb" strokeWidth="0.8" />
          <line x1="30" y1="80" x2="45" y2="90" stroke="#e5e7eb" strokeWidth="0.8" />
          <line x1="25" y1="60" x2="40" y2="70" stroke="#e5e7eb" strokeWidth="0.8" />
          <line x1="40" y1="70" x2="50" y2="50" stroke="#e5e7eb" strokeWidth="0.8" />
        </svg>

        {/* Left Edge - Vertical Accent Bar */}
        <div style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: 4,
          height: '100%',
          background: 'linear-gradient(180deg, #0ea9c8 0%, transparent 20%, transparent 80%, #0ea9c8 100%)',
          opacity: 0.15,
          pointerEvents: 'none',
          zIndex: 1
        }} />

        {/* Middle Left - Domain Categories */}
        <svg style={{
          position: 'fixed',
          left: 20,
          top: '30%',
          width: 70,
          height: 150,
          opacity: 0.09,
          pointerEvents: 'none',
          zIndex: 1
        }} viewBox="0 0 50 150">
          {/* Category boxes */}
          <rect x="5" y="10" width="40" height="18" fill="none" stroke="#0ea9c8" strokeWidth="1" />
          <rect x="5" y="35" width="40" height="18" fill="none" stroke="#f97316" strokeWidth="1" />
          <rect x="5" y="60" width="40" height="18" fill="none" stroke="#22c55e" strokeWidth="1" />
          <rect x="5" y="85" width="40" height="18" fill="none" stroke="#eab308" strokeWidth="1" />
          <rect x="5" y="110" width="40" height="18" fill="none" stroke="#ef4444" strokeWidth="1" />
          {/* Connecting line on left */}
          <line x1="2" y1="10" x2="2" y2="130" stroke="#0ea9c8" strokeWidth="1" opacity="0.5" />
        </svg>

        {/* Bottom Left Extended - Wave Pattern */}
        <svg style={{
          position: 'fixed',
          left: 0,
          bottom: 0,
          width: 120,
          height: 100,
          opacity: 0.07,
          pointerEvents: 'none',
          zIndex: 1
        }} viewBox="0 0 120 100">
          {/* Wave lines */}
          <path d="M 0 80 Q 15 70 30 80 T 60 80 T 90 80 T 120 80" fill="none" stroke="#0ea9c8" strokeWidth="1.5" />
          <path d="M 0 90 Q 15 80 30 90 T 60 90 T 90 90 T 120 90" fill="none" stroke="#0ea9c8" strokeWidth="1" opacity="0.6" />
          {/* Decorative dots at bottom */}
          <circle cx="20" cy="100" r="1.5" fill="#ef4444" />
          <circle cx="40" cy="100" r="1.5" fill="#0ea9c8" />
          <circle cx="60" cy="100" r="1.5" fill="#22c55e" />
          <circle cx="80" cy="100" r="1.5" fill="#f97316" />
          <circle cx="100" cy="100" r="1.5" fill="#eab308" />
        </svg>

        {/* Bottom Center - Assessment Label */}
        <svg style={{
          position: 'fixed',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 130,
          height: 50,
          opacity: 0.11,
          pointerEvents: 'none',
          zIndex: 1
        }} viewBox="0 0 150 50">
          {/* Frame */}
          <rect x="10" y="8" width="130" height="34" fill="none" stroke="#0ea9c8" strokeWidth="1.5" rx="4" />
          {/* Corner accents */}
          <line x1="15" y1="8" x2="20" y2="8" stroke="#0ea9c8" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="10" y1="8" x2="10" y2="15" stroke="#0ea9c8" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="135" y1="8" x2="130" y2="8" stroke="#0ea9c8" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="140" y1="8" x2="140" y2="15" stroke="#0ea9c8" strokeWidth="1.5" strokeLinecap="round" />
          {/* Center icon - checklist */}
          <circle cx="30" cy="25" r="8" fill="none" stroke="#0ea9c8" strokeWidth="1" />
          <path d="M 27 24 L 30 27 L 33 24" fill="none" stroke="#0ea9c8" strokeWidth="1.2" strokeLinecap="round" />
        </svg>

        {/* Header */}
        <div style={{
          background: '#e0f7ff',
          borderBottom: '1px solid #e5e7eb',
          zIndex: 20,
          flexShrink: 0,
        }}>
          {/* Top row: question info + logo (desktop only) + progress */}
          <div style={{
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            {/* Left: question counter */}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 2 }}>
                Assessment Progress
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', whiteSpace: 'nowrap' }}>
                Question {currentQIndex + 1} <span style={{ fontSize: 13, color: '#9ca3af' }}>/ {sessionQuestions.length}</span>
              </div>
            </div>

            {/* Center: Logo – only shown on desktop via CSS class */}
            <img
              className="assess-logo-desktop"
              src="infopace-logo-300x128.webp"
              alt="Company Logo"
              style={{ height: 52, objectFit: 'contain' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />

            {/* Right: progress % */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0ea9c8', lineHeight: 1 }}>{Math.round(progress)}%</div>
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>Complete</div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 4, background: '#c7e8f5' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: '#0ea9c8', transition: 'width 0.4s ease' }} />
          </div>
        </div>

        {/* Main Content */}
        <div className="assess-body" style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 48px',
          overflow: 'auto'
        }}>
          <div className="assess-inner" style={{
            width: '100%',
            maxWidth: 700,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            position: 'relative',
            zIndex: 10
          }}>

            {/* Domain Badge */}
            <div className="assess-badge" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 12,
              padding: '6px 12px',
              background: '#ffffff',
              border: `2px solid #0ea9c8`,
              borderRadius: 16,
              width: 'fit-content',
              animation: 'slideIn 0.6s ease-out'
            }}>
              <span style={{ fontSize: 12, color: '#0ea9c8', fontWeight: 700 }}>●</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#0ea9c8', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {cq.domainName}
              </span>
            </div>

            {/* Question Text */}
            <h2 className="assess-question" style={{
              fontSize: 26,
              fontWeight: 700,
              color: '#1f2937',
              lineHeight: 1.35,
              marginBottom: 8,
              letterSpacing: -0.4,
              animation: 'slideIn 0.7s ease-out 0.1s both',
              margin: 0
            }}>
              {cq.text}
            </h2>

            {/* Help Text */}
            <p style={{
              fontSize: 13,
              color: '#6b7280',
              lineHeight: 1.5,
              marginBottom: 20,
              fontStyle: 'italic',
              animation: 'slideIn 0.7s ease-out 0.2s both',
              margin: 0
            }}>

            </p>

            {/* White Card - Slider */}
            <div className="assess-card" style={{
              background: '#ffffff',
              borderRadius: 12,
              padding: '24px 18px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              border: '1px solid #e5e7eb',
              animation: 'slideIn 0.7s ease-out 0.3s both',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 14,
              minHeight: 0
            }}>

              {/* Slider Labels */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#ef4444',
                  textTransform: 'uppercase',
                  letterSpacing: 0.2
                }}>
                  Critical
                </span>
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: 0.2
                }}>
                  Neutral
                </span>
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#0ea9c8',
                  textTransform: 'uppercase',
                  letterSpacing: 0.2
                }}>
                  Low
                </span>
              </div>

              {/* Slider */}
              <style>{`
                input[type=range] {
                  -webkit-appearance: none;
                  width: 100%;
                  height: 6px;
                  border-radius: 6px;
                  background: linear-gradient(to right, #ef4444 0%, #f97316 20%, #eab308 50%, #84cc16 80%, #22c55e 100%);
                  outline: none;
                  cursor: pointer;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
                  margin: 0;
                  padding: 0;
                }
                input[type=range]::-webkit-slider-thumb {
                  -webkit-appearance: none;
                  width: 18px;
                  height: 18px;
                  border-radius: 50%;
                  background: #1f2937;
                  border: 2px solid white;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                  cursor: pointer;
                  transition: all 0.2s ease;
                }
                input[type=range]::-webkit-slider-thumb:hover {
                  transform: scale(1.1);
                  box-shadow: 0 3px 10px rgba(0,0,0,0.25);
                }
                input[type=range]::-moz-range-thumb {
                  width: 18px;
                  height: 18px;
                  border-radius: 50%;
                  background: #1f2937;
                  border: 2px solid white;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                  cursor: pointer;
                }
                input[type=range]::-moz-range-track {
                  background: transparent;
                  border: none;
                }
              `}</style>

              <input
                type="range"
                min="1"
                max="5"
                step="0.1"
                value={sliderValue}
                onChange={e => { setSliderValue(parseFloat(e.target.value)); setCurrentAnswered(true); }}
                onMouseUp={e => handleSelectOption(Math.round(parseFloat((e.target as HTMLInputElement).value)))}
                onTouchEnd={e => handleSelectOption(Math.round(parseFloat((e.target as HTMLInputElement).value)))}
                style={{ width: '100%' }}
              />

              {/* Risk Level Badge */}
              <div style={{
                textAlign: 'center'
              }}>
                <span style={{
                  display: 'inline-block',
                  padding: '5px 14px',
                  borderRadius: 14,
                  background: riskColors[riskValueIndex],
                  color: '#ffffff',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 0.3,
                  textTransform: 'uppercase',
                  boxShadow: `0 2px 8px ${riskColors[riskValueIndex]}40`
                }}>
                  {riskLabels[riskValueIndex]}
                </span>
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="assess-nav" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginTop: 20,
              animation: 'slideIn 0.7s ease-out 0.4s both',
              flexShrink: 0
            }}>
              <button
                onClick={handlePrev}
                disabled={currentQIndex === 0}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: currentQIndex === 0 ? 'not-allowed' : 'pointer',
                  background: '#ffffff',
                  color: currentQIndex === 0 ? '#d1d5db' : '#1f2937',
                  border: `2px solid ${currentQIndex === 0 ? '#e5e7eb' : '#d1d5db'}`,
                  transition: 'all 0.3s ease',
                  opacity: currentQIndex === 0 ? 0.6 : 1,
                  textTransform: 'uppercase',
                  letterSpacing: 0.2
                }}
                onMouseEnter={e => {
                  if (currentQIndex !== 0) {
                    e.currentTarget.style.borderColor = '#1f2937';
                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                Previous
              </button>

              <button
                onClick={handleNext}
                disabled={!currentAnswered}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: currentAnswered ? 'pointer' : 'not-allowed',
                  background: currentAnswered ? '#0ea9c8' : '#9ca3af',
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: currentAnswered ? '0 3px 10px rgba(14, 169, 200, 0.3)' : 'none',
                  transition: 'all 0.3s ease',
                  textTransform: 'uppercase',
                  letterSpacing: 0.2,
                  opacity: currentAnswered ? 1 : 0.6
                }}
                onMouseEnter={e => {
                  if (currentAnswered) {
                    e.currentTarget.style.background = '#0a94af';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(14, 169, 200, 0.4)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = currentAnswered ? '#0ea9c8' : '#9ca3af';
                  e.currentTarget.style.boxShadow = currentAnswered ? '0 3px 10px rgba(14, 169, 200, 0.3)' : 'none';
                }}
              >
                {currentQIndex === sessionQuestions.length - 1 ? 'Analyze Results' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════════
     RESULTS DASHBOARD  –  matching reference design
  ══════════════════════════════════════════════════════════════════════════ */
  if (step === 'results' && result) {
    const benchmark = getBenchmarkData(metadata, result.score, result.domainScores);
    // All numeric KPIs come from the shared reportMetrics module so the
    // dashboard and the generated reports (PDF + HTML) can never drift apart.
    const rm = deriveReportMetrics(result, metadata);
    const domains = rm.domains as [string, { score: number; name: string; weight: number; tier: number }][];
    const sorted = rm.sorted as typeof domains;
    const criticalFlags = rm.criticalFlags;
    const orangeFlags = rm.orangeFlags;
    const highPerformers = rm.highPerformers;
    const riskExposure = rm.riskExposure;

    /* radar data – all domains for the spider chart with benchmark */
    const radarDomains = domains.slice(0, 10);
    const radarLabels = radarDomains.map(([, d]) => d.name.replace(' Risk', '').replace('Cyber-Physical', 'Cyber-P.'));
    const radarScores = radarDomains.map(([, d]) => d.score);
    const radarBench = radarDomains.map(([, d]) => Math.min(100, d.score * (0.8 + Math.random() * 0.4)));

    /* best & worst domains (shared source of truth) */
    const strongest = rm.strongest as typeof domains[number];
    const weakest = rm.weakest as typeof domains[number];

    /* heat map – pick 8 domains spread across score range for color variety */
    const heatMapDomains = (() => {
      if (domains.length <= 8) return domains;
      const step = domains.length / 8;
      return Array.from({ length: 8 }, (_, i) => domains[Math.min(Math.floor(i * step), domains.length - 1)]);
    })();

    /* top priority risks from flags */
    const priorityRisks = result.flags.slice(0, 3);

    /* benchmark comparison – top 4 domains */
    const benchDomains = sorted.slice(0, 4);

    /* action plan items based on risk profile */
    const month1Actions = sorted.slice(0, 2).map(([, d]) => `Fix ${d.name.toLowerCase()}`);
    const month2Actions = sorted.slice(2, 4).map(([, d]) => `Improve ${d.name.toLowerCase().split(' ')[0]} areas`);

    /* validity score + confidence label (shared source of truth) */
    const validityScore = rm.validityScore;
    const confidenceLabel = rm.confidenceLabel;

    /* ── THEME TOKENS (light / dark) ── */
    const dark = dashTheme === 'dark';
    const T = {
      pageBg: dark ? '#0b1220' : '#eef1f6',
      cardBg: dark ? '#151d2e' : '#ffffff',
      cardBorder: dark ? '#26314a' : '#e7ebf2',
      cardShadow: dark ? '0 1px 3px rgba(0,0,0,.5)' : '0 1px 6px rgba(16,24,40,.06)',
      title: dark ? '#f1f5f9' : '#0f172a',
      text: dark ? '#e2e8f0' : '#1f2937',
      sub: dark ? '#94a3b8' : '#6b7280',
      muted: dark ? '#64748b' : '#9ca3af',
      grid: dark ? '#2d3a54' : '#e5e7eb',
      gridSoft: dark ? '#212c42' : '#f0f0f0',
      chipBg: dark ? 'rgba(255,255,255,.06)' : '#f3f4f6',
    };

    /* KPI card definitions – colored per metric, theme-aware tints */
    const kpiCards = [
      { label: 'Overall Score', value: `${result.score}%`, accent: dark ? '#4ade80' : '#16a34a', tint: dark ? 'rgba(34,197,94,.10)' : '#ecfdf5', ring: dark ? 'rgba(34,197,94,.35)' : '#bbf7d0', icon: 'gauge', onClick: () => openModal('Overall Score – All 18 Domains', `Composite risk score: ${result.score}% · Click a domain row for detail`) },
      { label: 'Risk Exposure', value: `${riskExposure}%`, accent: dark ? '#fbbf24' : '#d97706', tint: dark ? 'rgba(234,179,8,.10)' : '#fffbeb', ring: dark ? 'rgba(234,179,8,.35)' : '#fde68a', icon: 'warn', onClick: () => openModal('Risk Exposure – All Domains', `Risk exposure: ${riskExposure}% · Sorted highest risk first`) },
      { label: 'High Performers', value: `${highPerformers || 1}`, accent: dark ? '#4ade80' : '#16a34a', tint: dark ? 'rgba(34,197,94,.10)' : '#ecfdf5', ring: dark ? 'rgba(34,197,94,.35)' : '#bbf7d0', icon: 'users', onClick: () => openModal('High Performers – Low-Risk Domains', `${highPerformers || 1} domain(s) with score ≤ 30% (low risk)`) },
      { label: 'Critical Issues', value: `${criticalFlags + orangeFlags}`, accent: dark ? '#f87171' : '#dc2626', tint: dark ? 'rgba(239,68,68,.10)' : '#fef2f2', ring: dark ? 'rgba(239,68,68,.35)' : '#fecaca', icon: 'alert', onClick: () => openModal('Critical & Flagged Issues – All Domains', `${criticalFlags} critical · ${orangeFlags} elevated flags across all domains`) },
      { label: 'Domains', value: `${domains.length}`, accent: dark ? '#60a5fa' : '#2563eb', tint: dark ? 'rgba(59,130,246,.10)' : '#eff6ff', ring: dark ? 'rgba(59,130,246,.35)' : '#bfdbfe', icon: 'grid', onClick: () => openModal('All Assessed Domains', `Full breakdown of all ${domains.length} domains`) },
    ];
    const kpiIcon = (name: string, color: string) => {
      const p = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
      switch (name) {
        case 'gauge': return <svg {...p}><path d="M12 14l4-4" /><circle cx="12" cy="14" r="8" /><path d="M4 14a8 8 0 0 1 16 0" /></svg>;
        case 'warn': return <svg {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></svg>;
        case 'users': return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
        case 'alert': return <svg {...p}><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12" y2="16" /></svg>;
        default: return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>;
      }
    };

    /* Domain Performance Trend – smooth 6-month ramp to each top domain's current score */
    const trendSeries = sorted.slice(0, 3).map(([, d], idx) => {
      const trendColors = dark ? ['#34d399', '#c084fc', '#38bdf8'] : ['#10b981', '#a855f7', '#3b82f6'];
      const target = d.score;
      const start = Math.max(4, target * (0.35 + idx * 0.05));
      const pts = Array.from({ length: 6 }, (_, m) => {
        const prog = m / 5;
        const eased = prog * prog * (3 - 2 * prog); // smoothstep
        const wobble = Math.sin((m + idx) * 1.3) * 2.5;
        return Math.max(2, Math.round(start + (target - start) * eased + (m > 0 && m < 5 ? wobble : 0)));
      });
      return { name: d.name.replace(' Risk', '').substring(0, 10), color: trendColors[idx], pts };
    });
    const trendMax = Math.max(50, ...trendSeries.flatMap(s => s.pts));

    return (
      <div id="risk-dashboard-capture" className="res-root" style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', system-ui, sans-serif", background: T.pageBg, overflow: 'hidden', transition: 'background .3s' }}>
        <style>{SHARED_STYLES + `
          ::-webkit-scrollbar { width: 0; height: 0; }
          @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
          .fi { animation: fadeUp .35s ease both; }
          .dcard { background:${T.cardBg}; border-radius:14px; padding:10px 12px; box-shadow:${T.cardShadow}; border:1px solid ${T.cardBorder}; transition:background .3s, border-color .3s; }
          .db-btn { padding:5px 11px; border-radius:16px; font-size:9px; font-weight:600; font-family:inherit; cursor:pointer; border:none; transition:all .2s; display:inline-flex; align-items:center; gap:4px; }
          .db-btn:hover { transform:translateY(-1px); box-shadow:0 2px 6px rgba(0,0,0,.18); }
          .res-kpi-grid { grid-template-columns: repeat(5, 1fr); }
          .res-main-grid { grid-template-columns: 1.15fr 1fr 1fr 1fr; grid-template-rows: 170px minmax(0, 1fr); }
          .g-radar  { grid-column: 1; grid-row: 1 / span 2; }
          .g-trend  { grid-column: 2; grid-row: 1 / span 2; }
          .g-health { grid-column: 3; grid-row: 1; }
          .g-heat   { grid-column: 4; grid-row: 1; }
          .g-bw     { grid-column: 3; grid-row: 2; }
          .g-rstack { grid-column: 4; grid-row: 2; }
          @media (max-width: 900px) {
            .res-main-grid { grid-template-columns: 1fr 1fr !important; grid-template-rows: none !important; }
            .g-radar, .g-trend, .g-health, .g-heat, .g-bw, .g-rstack { grid-column: auto !important; grid-row: auto !important; }
            .res-main-grid > * { min-height: 240px; }
          }
          @media (max-width: 768px) {
            .res-root { height: auto !important; overflow: auto !important; }
            .res-topbar { flex-wrap: wrap; height: auto !important; min-height: 40px; padding: 8px 12px !important; }
            .res-topbar-btns { flex-wrap: wrap; gap: 3px !important; }
            .res-kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
            .res-main-grid { grid-template-columns: 1fr !important; flex: unset !important; }
            .res-main-grid > * { min-height: 220px !important; }
            .res-body { padding: 10px !important; overflow: auto !important; flex: unset !important; }
            .db-btn-hide { display: none !important; }
          }
          @media (max-width: 480px) {
            .res-kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
            .res-main-grid > * { min-height: 200px !important; }
          }
        `}</style>

        {/* ── HEADER BAR ── */}
        <div className="res-topbar" style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🛡️</span>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.title, letterSpacing: -0.3 }}>Enterprise Risk Assessment Dashboard</div>
              <div style={{ fontSize: 8, color: T.muted, fontWeight: 500, letterSpacing: 0.4, textTransform: 'uppercase' }}>{metadata.companyName} · Click any element for insights</div>
            </div>
          </div>
          <div className="res-topbar-btns" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="db-btn db-btn-hide" style={{ background: dark ? 'rgba(34,197,94,.18)' : 'rgba(34,197,94,.12)', color: dark ? '#4ade80' : '#16a34a', fontSize: 8, border: `1px solid ${dark ? 'rgba(34,197,94,.3)' : '#bbf7d0'}` }}>● High Validity</span>
            {/* Theme toggle */}
            <button className="db-btn" onClick={() => setDashTheme(dark ? 'light' : 'dark')} title="Toggle theme" style={{ background: T.chipBg, color: T.text, padding: '6px 10px' }}>
              {dark ? '☀️ Light' : '🌙 Dark'}
            </button>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 9, border: '1.5px solid rgba(255,255,255,.3)' }}>
              {metadata.name.charAt(0).toUpperCase()}
            </div>
            <span style={{ color: T.text, fontSize: 9, fontWeight: 600 }}>{metadata.name.split(' ')[0]}</span>
            <button className="db-btn" onClick={handleDownloadReportPdf} disabled={reportPdfBusy} style={{ background: dark ? 'rgba(99,102,241,.9)' : '#6366f1', color: 'white' }}>{reportPdfBusy ? '⏳ Generating…' : '📄 Download PDF'}</button>
            <button className="db-btn" onClick={handleReset} style={{ background: T.chipBg, color: T.text }}>↺ Retake</button>
          </div>
        </div>

        {/* ── FIXED BODY – no scroll on desktop, scrollable on mobile ── */}
        <div className="res-body" style={{ flex: 1, overflow: 'hidden', padding: '4px 12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* ═══ ROW 1: 5 KPI Cards ═══ */}
          <div className="res-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, flexShrink: 0 }}>
            {kpiCards.map((k, i) => (
              <div key={k.label} className="fi" onClick={k.onClick} style={{ borderRadius: 14, padding: '11px 14px', background: dark ? T.cardBg : k.tint, border: `1px solid ${dark ? T.cardBorder : k.ring}`, boxShadow: T.cardShadow, position: 'relative', overflow: 'hidden', animationDelay: `${i * 0.04}s`, cursor: 'pointer', transition: 'transform .15s, box-shadow .15s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 22px ${dark ? 'rgba(0,0,0,.5)' : 'rgba(16,24,40,.12)'}`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = T.cardShadow; }}>
                {dark && <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(120deg, ${k.tint}, transparent 65%)`, pointerEvents: 'none' }} />}
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: T.sub }}>{k.label}</div>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: dark ? 'rgba(255,255,255,.05)' : '#ffffff', border: `1px solid ${k.ring}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{kpiIcon(k.icon, k.accent)}</div>
                </div>
                <div style={{ position: 'relative', fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: k.accent, marginTop: 4 }}>{k.value}</div>
                <div style={{ position: 'relative', fontSize: 8, color: T.muted, marginTop: 3, fontWeight: 500 }}>Click to drill down</div>
              </div>
            ))}
          </div>

          {/* ═══ ROW 2: 4-column layout – fills remaining height ═══ */}
          <div className="res-main-grid" style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr 1fr 1fr', gap: 8, flex: 1, minHeight: 0 }}>

            {/* ─── COLUMN 1: Domain Performance Radar ─── */}
            <div className="res-col g-radar" style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
              <div className="dcard fi" onClick={() => openModal('Domain Performance Radar – All Domains', 'Full radar breakdown across all 18 risk domains')} style={{ flex: 1, animationDelay: '.08s', display: 'flex', flexDirection: 'column', minHeight: 0, cursor: 'pointer', transition: 'box-shadow .2s, background .3s' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 0 2px ${dark ? '#818cf8' : '#6366f1'}`}
                onMouseLeave={e => e.currentTarget.style.boxShadow = T.cardShadow}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2, flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.title }}>Domain Performance</div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: T.sub, fontWeight: 600 }}>
                    <span style={{ width: 12, height: 0, borderTop: `2px dashed ${dark ? '#22d3ee' : '#f97316'}`, display: 'inline-block' }} />Benchmark
                  </span>
                </div>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 260 240" style={{ width: '100%', maxHeight: '100%' }}>
                    {(() => {
                      const n = radarDomains.length, cx = 130, cy = 120, R = 88;
                      const userColor = dark ? '#818cf8' : '#6366f1';
                      const benchColor = dark ? '#22d3ee' : '#f97316';
                      const pt = (i: number, frac: number) => {
                        const a = (2 * Math.PI * i) / n - Math.PI / 2;
                        return { x: cx + frac * R * Math.cos(a), y: cy + frac * R * Math.sin(a) };
                      };
                      const polygon = (frac: number) => Array.from({ length: n }, (_, i) => pt(i, frac)).map(p => `${p.x},${p.y}`).join(' ');
                      const userPts = radarScores.map((s, i) => pt(i, s / 100));
                      const benchPts = radarBench.map((s, i) => pt(i, s / 100));
                      return (
                        <>
                          {[0.25, 0.5, 0.75, 1].map(f => <polygon key={f} points={polygon(f)} fill="none" stroke={T.grid} strokeWidth=".8" strokeDasharray={f < 1 ? '2,2' : '0'} />)}
                          {Array.from({ length: n }, (_, i) => { const e = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={e.x} y2={e.y} stroke={T.grid} strokeWidth=".6" />; })}
                          <polygon points={benchPts.map(p => `${p.x},${p.y}`).join(' ')} fill={dark ? 'rgba(34,211,238,.10)' : 'rgba(249,115,22,.08)'} stroke={benchColor} strokeWidth="1.5" strokeDasharray="4,3" strokeLinejoin="round" />
                          <polygon points={userPts.map(p => `${p.x},${p.y}`).join(' ')} fill={dark ? 'rgba(129,140,248,.22)' : 'rgba(99,102,241,.12)'} stroke={userColor} strokeWidth="2" strokeLinejoin="round" />
                          {userPts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill={userColor} stroke={T.cardBg} strokeWidth="1.5" />)}
                          {radarLabels.map((l, i) => {
                            const lp = pt(i, 1.24);
                            return (
                              <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fontSize="7" fontWeight="600" fill={T.sub}>
                                {l}
                                <tspan x={lp.x} dy="8" fontSize="6.5" fontWeight="700" fill={T.text}>({Math.round(radarScores[i])}%)</tspan>
                              </text>
                            );
                          })}
                        </>
                      );
                    })()}
                  </svg>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexShrink: 0, paddingTop: 2 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: T.sub, fontWeight: 600 }}>
                    <span style={{ width: 10, height: 2, background: dark ? '#818cf8' : '#6366f1', borderRadius: 2, display: 'inline-block' }} />Your Score
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: T.sub, fontWeight: 600 }}>
                    <span style={{ width: 10, height: 2, background: dark ? '#22d3ee' : '#f97316', borderRadius: 2, display: 'inline-block' }} />Benchmark
                  </span>
                </div>
              </div>
            </div>

            {/* ─── COLUMN 2: Domain Performance Trend ─── */}
            <div className="res-col g-trend" style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
              <div className="dcard fi" onClick={() => openModal('Domain Performance Trend – Top Domains', 'Projected 6-month trajectory toward current domain scores')} style={{ flex: 1, animationDelay: '.12s', display: 'flex', flexDirection: 'column', minHeight: 0, cursor: 'pointer', transition: 'box-shadow .2s, background .3s' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 0 2px ${dark ? '#818cf8' : '#6366f1'}`}
                onMouseLeave={e => e.currentTarget.style.boxShadow = T.cardShadow}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.title }}>Domain Performance Trend</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexShrink: 0, margin: '4px 0 2px' }}>
                  {trendSeries.map(s => (
                    <span key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: T.sub, fontWeight: 600 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />{s.name}
                    </span>
                  ))}
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <svg viewBox="0 0 280 180" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                    {(() => {
                      const mL = 26, mR = 8, mT = 8, mB = 22;
                      const pw = 280 - mL - mR, ph = 180 - mT - mB;
                      const xAt = (m: number) => mL + (m / 5) * pw;
                      const yAt = (v: number) => mT + ph - (v / trendMax) * ph;
                      const yTicks = [0, Math.round(trendMax / 4), Math.round(trendMax / 2), Math.round(trendMax * 3 / 4), trendMax];
                      const linePath = (pts: number[]) => pts.map((v, m) => `${m === 0 ? 'M' : 'L'} ${xAt(m).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' ');
                      return (
                        <>
                          {yTicks.map((tk, i) => (
                            <g key={i}>
                              <line x1={mL} y1={yAt(tk)} x2={280 - mR} y2={yAt(tk)} stroke={T.gridSoft} strokeWidth="0.8" />
                              <text x={mL - 4} y={yAt(tk) + 2.5} textAnchor="end" fontSize="6.5" fill={T.muted}>{tk}</text>
                            </g>
                          ))}
                          {Array.from({ length: 6 }, (_, m) => (
                            <text key={m} x={xAt(m)} y={180 - 7} textAnchor="middle" fontSize="6.5" fill={T.muted}>M{m + 1}</text>
                          ))}
                          {trendSeries.map((s, si) => (
                            <g key={si}>
                              <path d={linePath(s.pts)} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                              {s.pts.map((v, m) => <circle key={m} cx={xAt(m)} cy={yAt(v)} r="2.4" fill={s.color} stroke={T.cardBg} strokeWidth="1" />)}
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>
            </div>

            {/* ─── COLUMN 3, ROW 1: Overall Health ─── */}
            <div className="dcard fi g-health" onClick={() => openModal('Overall Health – Score Per Domain', `Composite score: ${result.score}% · All 18 domains ranked`)} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0, animationDelay: '.1s', cursor: 'pointer', transition: 'box-shadow .2s, background .3s' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 0 2px ${dark ? '#818cf8' : '#6366f1'}`}
                onMouseLeave={e => e.currentTarget.style.boxShadow = T.cardShadow}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.title }}>Overall Health</div>
                <div style={{ fontSize: 8, color: T.muted, marginBottom: 2 }}>Composite score · click for breakdown</div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {(() => {
                    /* Notch gauge – 260° sweep with a 100° bottom gap, purple→cyan
                       active gradient, per the supplied Gauge design. Driven by score. */
                    const N = 54;                       // notch count (denser ring)
                    const startAngle = 140, sweep = 260;
                    const cx = 100, cy = 95, rOut = 83, rIn = 60, nW = 4.6;
                    const active = Math.round((result.score / 100) * N);
                    const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
                    const mix = (a: string, b: string, t: number) => {
                      const A = hex(a), B = hex(b);
                      return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
                    };
                    const actA = '#a855f7', actB = '#06b6d4';
                    const inaA = dark ? '#334155' : '#e2e8f0', inaB = dark ? '#38bdf8' : '#bae6fd';
                    return (
                      <svg viewBox="0 0 200 158" style={{ width: 172, height: 136 }}>
                        <defs>
                          <filter id="notchGlow" x="-30%" y="-30%" width="160%" height="160%">
                            <feGaussianBlur stdDeviation="1.6" result="b" />
                            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                          </filter>
                        </defs>
                        {Array.from({ length: N }, (_, i) => {
                          const rad = ((startAngle + sweep * (i / (N - 1))) * Math.PI) / 180;
                          const cos = Math.cos(rad), sin = Math.sin(rad);
                          const isOn = i < active;
                          const t = active > 1 ? i / (active - 1) : 0;
                          const fill = isOn ? mix(actA, actB, t) : mix(inaA, inaB, i / (N - 1));
                          const x1 = cx + rIn * cos, y1 = cy + rIn * sin;
                          const x2 = cx + rOut * cos, y2 = cy + rOut * sin;
                          return (
                            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                              stroke={fill} strokeWidth={nW} strokeLinecap="round"
                              opacity={isOn ? 1 : (dark ? 0.4 : 0.55)}
                              filter={isOn && dark ? 'url(#notchGlow)' : undefined}
                              style={{ transition: 'stroke .5s' }} />
                          );
                        })}
                        <text x={cx} y={cy - 1} textAnchor="middle" fontSize="34" fontWeight="800" fill={T.title}>{result.score}%</text>
                        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="9" fontWeight="600" fill={T.muted} style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Health</text>
                      </svg>
                    );
                  })()}
                </div>
              </div>

            {/* ─── COLUMN 3, ROW 2: Best & Worst + vs Industry Benchmark ─── */}
            <div className="dcard fi g-bw" onClick={() => openModal('Best & Worst – Full Domain Ranking', 'Complete ranking from lowest risk to highest risk')} style={{ animationDelay: '.15s', minHeight: 0, display: 'flex', flexDirection: 'column', cursor: 'pointer', transition: 'box-shadow .2s, background .3s' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 0 2px ${dark ? '#34d399' : '#10b981'}`}
                onMouseLeave={e => e.currentTarget.style.boxShadow = T.cardShadow}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.title, marginBottom: 5 }}>Best &amp; Worst Domain</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', background: dark ? 'rgba(34,197,94,.12)' : '#f0fdf4', borderRadius: 8, border: `1px solid ${dark ? 'rgba(34,197,94,.3)' : '#bbf7d0'}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 7, fontWeight: 700, color: dark ? '#4ade80' : '#16a34a', textTransform: 'uppercase', letterSpacing: 0.4 }}>Strongest</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.text }}>{strongest ? strongest[1].name : 'N/A'}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: dark ? '#4ade80' : '#16a34a' }}>{strongest ? Math.round(100 - strongest[1].score) : 0}%</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', background: dark ? 'rgba(239,68,68,.12)' : '#fef2f2', borderRadius: 8, border: `1px solid ${dark ? 'rgba(239,68,68,.3)' : '#fecaca'}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 7, fontWeight: 700, color: dark ? '#f87171' : '#dc2626', textTransform: 'uppercase', letterSpacing: 0.4 }}>Weakest</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.text }}>{weakest ? weakest[1].name : 'N/A'}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: dark ? '#f87171' : '#dc2626' }}>{weakest ? Math.round(100 - weakest[1].score) : 0}%</div>
                  </div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.title, margin: '8px 0 2px' }}>vs Industry Benchmark</div>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center' }}>
                  <svg viewBox="0 0 300 100" style={{ width: '100%', maxHeight: '100%' }}>
                    {(() => {
                      const barData = benchDomains.map(([, d]) => ({
                        name: d.name.replace(' Risk', '').substring(0, 10),
                        yours: d.score,
                        bench: Math.round(d.score * (0.85 + Math.random() * 0.3)),
                      }));
                      const maxVal = Math.max(...barData.flatMap(b => [b.yours, b.bench]));
                      const barH = 80, padL = 5, barW = 260 / barData.length;
                      return (
                        <>
                          {barData.map((b, i) => {
                            const x = padL + i * barW + barW * 0.15;
                            const w = barW * 0.28;
                            const hY = (b.yours / maxVal) * barH;
                            const hB = (b.bench / maxVal) * barH;
                            return (
                              <g key={i}>
                                <rect x={x} y={barH - hY + 5} width={w} height={hY} rx={3} fill={dark ? '#818cf8' : '#6366f1'} />
                                <rect x={x + w + 3} y={barH - hB + 5} width={w} height={hB} rx={3} fill={T.grid} />
                                <text x={x + w} y={barH + 15} textAnchor="middle" fontSize="7" fill={T.muted}>{b.name}</text>
                              </g>
                            );
                          })}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>

            {/* ─── COLUMN 4, ROW 1: Risk Heat Map ─── */}
            <div className="dcard fi g-heat" style={{ animationDelay: '.12s', minHeight: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.title }}>Risk Heat Map</div>
                <div style={{ fontSize: 8, color: T.muted, marginBottom: 5 }}>Click any cell for full breakdown</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {heatMapDomains.map(([id, d]) => {
                    const s = d.score;
                    const bg = s >= 70 ? 'linear-gradient(135deg,#dc2626,#b91c1c)' :
                      s >= 60 ? 'linear-gradient(135deg,#ef4444,#dc2626)' :
                        s >= 50 ? 'linear-gradient(135deg,#f97316,#ea580c)' :
                          s >= 40 ? 'linear-gradient(135deg,#f59e0b,#d97706)' :
                            s >= 30 ? 'linear-gradient(135deg,#eab308,#ca8a04)' :
                              s >= 20 ? 'linear-gradient(135deg,#84cc16,#65a30d)' :
                                'linear-gradient(135deg,#22c55e,#16a34a)';
                    return (
                      <div key={id}
                        onClick={() => openModal(`Risk Heat Map – ${d.name}`, `Domain score: ${Math.round(d.score)}% · All 18 domains shown`)}
                        style={{ background: bg, borderRadius: 8, padding: '7px 4px', textAlign: 'center', cursor: 'pointer', transition: 'transform .15s, box-shadow .15s', color: 'white' }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.07)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,.3)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
                        <div style={{ fontSize: 7, fontWeight: 600, opacity: .9, marginBottom: 1, lineHeight: 1.1 }}>{d.name.replace(' Risk', '').substring(0, 9)}</div>
                        <div style={{ fontSize: 11, fontWeight: 800 }}>{Math.round(d.score)}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>

            {/* ─── COLUMN 4, ROW 2: Top Priority + Validity ─── */}
            <div className="res-col g-rstack" style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
              {/* Top Priority Risks - Wave Graph */}
              <div className="dcard fi" onClick={() => openModal('Top Priority Risks – All Domains', 'All domains sorted by risk level — critical first')} style={{ animationDelay: '.18s', cursor: 'pointer', transition: 'box-shadow .2s, background .3s', display: 'flex', flexDirection: 'column', minHeight: 0 }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 0 2px ${dark ? '#818cf8' : '#6366f1'}`}
                onMouseLeave={e => e.currentTarget.style.boxShadow = T.cardShadow}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.title }}>Top Priority Risks</div>
                <div style={{ fontSize: 8, color: T.muted, marginBottom: 4 }}>Wave pattern intensity</div>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {priorityRisks.length > 0 ? (() => {
                    const w = 240, h = 100;
                    const margin = { left: 45, right: 20, top: 6, bottom: 16 };
                    const plotW = w - margin.left - margin.right;
                    const plotH = h - margin.top - margin.bottom;
                    const data = priorityRisks.map((r, i) => ({
                      domain: r.domain,
                      type: r.type,
                      amplitude: 15 - i * 4,
                      frequency: 1.5 + i * 0.3,
                      phase: i * Math.PI / 3,
                      baseline: margin.top + (i + 0.5) * (plotH / priorityRisks.length)
                    }));
                    const xScale = (x: number) => margin.left + (x / 100) * plotW;
                    const color = (type: string) => type === 'CRITICAL' ? (dark ? '#f87171' : '#dc2626') : (dark ? '#fb923c' : '#ea580c');
                    const generateWave = (amplitude: number, frequency: number, phase: number, baseline: number) => {
                      let path = `M ${margin.left} ${baseline}`;
                      for (let x = 0; x <= 100; x += 2) {
                        const angle = (x / 100) * Math.PI * 2 * frequency + phase;
                        const y = baseline + Math.sin(angle) * amplitude;
                        path += ` L ${xScale(x)} ${y}`;
                      }
                      return path;
                    };
                    const generateWaveArea = (amplitude: number, frequency: number, phase: number, baseline: number) => {
                      let path = `M ${margin.left} ${baseline}`;
                      for (let x = 0; x <= 100; x += 2) {
                        const angle = (x / 100) * Math.PI * 2 * frequency + phase;
                        const y = baseline + Math.sin(angle) * amplitude;
                        path += ` L ${xScale(x)} ${y}`;
                      }
                      path += ` L ${w - margin.right} ${baseline} Z`;
                      return path;
                    };
                    return (
                      <svg width={w} height={h} style={{ maxWidth: '100%', height: 'auto' }} viewBox={`0 0 ${w} ${h}`}>
                        {data.map((d, i) => (
                          <g key={`area-${i}`}>
                            <path d={generateWaveArea(d.amplitude, d.frequency, d.phase, d.baseline)} fill={color(d.type)} fillOpacity={0.15} stroke="none" />
                          </g>
                        ))}
                        {data.map((d, i) => (
                          <g key={`wave-${i}`}>
                            <path d={generateWave(d.amplitude, d.frequency, d.phase, d.baseline)} fill="none" stroke={color(d.type)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                          </g>
                        ))}
                        {data.map((d, i) => (
                          <line key={`baseline-${i}`} x1={margin.left} y1={d.baseline} x2={w - margin.right} y2={d.baseline} stroke={T.gridSoft} strokeWidth={0.8} opacity={0.6} />
                        ))}
                        {data.map((d, i) => (
                          <text key={`label-${i}`} x={margin.left - 4} y={d.baseline + 3} textAnchor="end" fontSize="7" fill={T.sub} fontWeight="600">
                            {d.domain.replace(' Risk', '').substring(0, 15)}
                          </text>
                        ))}
                      </svg>
                    );
                  })() : (
                    <div style={{ textAlign: 'center', fontSize: 9, color: dark ? '#4ade80' : '#16a34a', fontWeight: 600 }}>✅ No critical risks detected!</div>
                  )}
                </div>
              </div>

              {/* Validity & Benchmarks – Radial */}
              <div className="dcard fi" onClick={() => openModal('Validity & Benchmarks – All Domains', `Validity: ${validityScore}% · ${confidenceLabel} · full domain breakdown`)} style={{ flex: 1, animationDelay: '.24s', minHeight: 0, display: 'flex', flexDirection: 'column', cursor: 'pointer', transition: 'box-shadow .2s, background .3s' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 0 2px ${dark ? '#34d399' : '#10b981'}`}
                onMouseLeave={e => e.currentTarget.style.boxShadow = T.cardShadow}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.title }}>Validity &amp; Benchmarks</div>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {(() => {
                    const cx = 75, cy = 75, strokeW = 7, gap = 2;
                    const radialColors = ['#6366f1', '#f59e0b', '#ef4444', '#10b981'];
                    const radialData = benchDomains.slice(0, 4).map(([, d], i) => ({
                      value: Math.round(d.score),
                      color: radialColors[i],
                      r: 65 - i * (strokeW + gap),
                    }));
                    return (
                      <svg viewBox="0 0 150 150" style={{ width: '100%', maxHeight: '100%' }}>
                        {radialData.map((d, i) => (
                          <circle key={`bg-${i}`} cx={cx} cy={cy} r={d.r} fill="none" stroke={T.gridSoft} strokeWidth={strokeW} />
                        ))}
                        {radialData.map((d, i) => {
                          const circ = 2 * Math.PI * d.r;
                          const dash = (d.value / 100) * circ;
                          return (
                            <circle key={`arc-${i}`} cx={cx} cy={cy} r={d.r} fill="none" stroke={d.color} strokeWidth={strokeW}
                              strokeLinecap="round"
                              strokeDasharray={`${dash} ${circ}`}
                              transform={`rotate(-90 ${cx} ${cy})`}
                              style={{ transition: 'stroke-dasharray 1s ease' }} />
                          );
                        })}
                        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="18" fontWeight="800" fill={T.title}>{validityScore}%</text>
                        <text x={cx} y={cy + 9} textAnchor="middle" fontSize="6" fontWeight="600" fill={dark ? '#4ade80' : '#16a34a'}>{confidenceLabel}</text>
                      </svg>
                    );
                  })()}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', flexShrink: 0, paddingTop: 2 }}>
                  {benchDomains.slice(0, 4).map(([id, d], i) => {
                    const radialColors = ['#6366f1', '#f59e0b', '#ef4444', '#10b981'];
                    return (
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: radialColors[i], display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 7, color: T.text, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name.replace(' Risk', '').substring(0, 9)}</span>
                        <span style={{ fontSize: 7, fontWeight: 700, color: radialColors[i], marginLeft: 'auto' }}>{Math.round(d.score)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ═══ ROW 3: 90-Day Action Plan ═══ */}
          <div className="dcard fi" style={{ animationDelay: '.26s', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.title }}>90-Day Action Plan</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { m: 'Month 1', c: dark ? '#818cf8' : '#6366f1', items: [{ dot: '#ef4444', t: `Fix ${criticalFlags + orangeFlags} critical risks` }, { dot: '#ef4444', t: 'External: urgent' }] },
                { m: 'Month 2', c: dark ? '#818cf8' : '#6366f1', items: [{ dot: '#f59e0b', t: 'Improve average areas' }, { dot: '#8b5cf6', t: 'Strategic: train' }] },
                { m: 'Month 3', c: dark ? '#818cf8' : '#6366f1', items: [{ dot: '#10b981', t: 'Embed practices' }, { dot: '#10b981', t: 'Reassessment' }] },
              ].map((col, ci) => (
                <div key={ci} style={{ borderLeft: ci > 0 ? `1px solid ${T.cardBorder}` : 'none', paddingLeft: ci > 0 ? 16 : 0 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: col.c, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{col.m}</div>
                  {col.items.map((it, ii) => (
                    <div key={ii} style={{ fontSize: 9, color: T.text, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: it.dot, display: 'inline-block', flexShrink: 0 }} />{it.t}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ── DRILL-DOWN MODAL ── */}
        {modal && (
          <DrillDownModal
            title={modal.title}
            subtitle={modal.subtitle}
            domains={domains}
            onClose={closeModal}
          />
        )}

        {/* ── EARLY BIRDS POPUP ── */}
        {adminMode && (
          <button
            onClick={backToAdminList}
            style={{
              position: 'fixed', top: 16, left: 16, zIndex: 10000,
              background: '#0f172a', color: 'white', border: 'none', borderRadius: 10,
              padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 6px 20px rgba(0,0,0,.25)',
            }}
          >
            ← All results
          </button>
        )}

        {paymentError && (
          <div
            onClick={() => setPaymentError(null)}
            style={{
              position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
              background: '#ef4444', color: 'white', padding: '10px 18px', borderRadius: 10,
              fontSize: 13, fontWeight: 600, zIndex: 10000, cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(239,68,68,.35)',
            }}
          >
            ⚠️ {paymentError} <span style={{ opacity: 0.8, marginLeft: 6 }}>✕</span>
          </div>
        )}

        {showEarlyBirdsPopup && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 31, 63, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            animation: 'fadeIn 0.3s ease',
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #001f3f 0%, #0ea5e9 100%)',
              borderRadius: 16,
              padding: '32px',
              maxWidth: 420,
              boxShadow: '0 20px 60px rgba(14, 165, 233, 0.3)',
              color: 'white',
              textAlign: 'center',
              animation: 'slideUp 0.4s ease',
            }}>
              <div style={{
                fontSize: 48,
                marginBottom: 16,
              }}>⭐</div>
              <h2 style={{
                fontSize: 24,
                fontWeight: 700,
                marginBottom: 12,
                letterSpacing: '-0.5px',
              }}>Perks of Early Birds</h2>
              <p style={{
                fontSize: 14,
                lineHeight: '1.6',
                marginBottom: 24,
                opacity: 0.95,
                color: 'rgba(255, 255, 255, 0.95)',
              }}>
                By downloading this report early, you're joining an exclusive group of founders taking proactive control of their risk landscape. This commitment puts you ahead of the curve in building a resilient company.
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 20,
              }}>
                <div style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  borderRadius: 8,
                  padding: 12,
                  backdropFilter: 'blur(10px)',
                }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>🎯</div>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>Priority Access</div>
                </div>
                <div style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  borderRadius: 8,
                  padding: 12,
                  backdropFilter: 'blur(10px)',
                }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>🚀</div>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>Exclusive Insights</div>
                </div>
              </div>
              <p style={{
                fontSize: 12,
                opacity: 0.85,
                marginBottom: 16,
                color: 'rgba(255, 255, 255, 0.9)',
              }}>Your PDF is being prepared and will download shortly...</p>
              <div style={{
                fontSize: 12,
                fontWeight: 500,
                opacity: 0.8,
                animation: 'pulse 2s infinite',
              }}>⏳ Processing your report</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Loading…</div>;
}

export default App;
