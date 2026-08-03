require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { calculateScore } = require('./scoringEngine');
const supabase = require('./supabaseClient');

// ── Razorpay config (server-enforced price; never trust the client for amount) ──
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const RAZORPAY_AMOUNT = parseInt(process.env.RAZORPAY_AMOUNT || '100', 10); // in paise — ₹1 (override with RAZORPAY_AMOUNT)
const RAZORPAY_CURRENCY = process.env.RAZORPAY_CURRENCY || 'INR';

const ADMIN_KEY = process.env.ADMIN_KEY || '';
// Secret used to sign short-lived upload tokens; reuses the Razorpay secret if a
// dedicated APP_SECRET is not set.
const APP_SECRET = process.env.APP_SECRET || RAZORPAY_KEY_SECRET || '';
// Comma-separated allowlist of browser origins permitted to call the API.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  'https://risk.infopaceindia.co.in,http://localhost:5173,http://localhost:3000')
  .split(',').map((s) => s.trim()).filter(Boolean);

// ── Security helpers ──────────────────────────────────────────────────────────
// Constant-time compare that tolerates unequal-length inputs.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

const isEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isStr = (v, max = 300) => typeof v === 'string' && v.length > 0 && v.length <= max;

// Strip anything that could escape the intended storage folder.
function safeFilename(name, fallback) {
  const base = String(name || '').split(/[\\/]/).pop() || '';        // drop path segments
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '_').slice(0, 120);
  return cleaned || fallback;
}
const safeSegment = (v) => String(v || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);

// Short-lived signed token (HMAC) authorising a follow-up upload.
function signToken(payload) {
  if (!APP_SECRET) return '';
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', APP_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyToken(token) {
  if (!token || !APP_SECRET) return null;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', APP_SECRET).update(body).digest('base64url');
  if (!safeEqual(expected, sig)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

const app = express();
app.set('trust proxy', 1); // behind Render's proxy — needed for correct rate-limit IPs
app.use(helmet());
app.use(cors({
  origin(origin, cb) {
    // Allow same-origin / server-to-server (no Origin header) and allowlisted origins.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
}));

// Body limits: small by default; the upload routes opt into a larger limit first
// (express.json skips a body it has already parsed).
app.use('/api/upload-pdf', express.json({ limit: '12mb' }));
app.use('/api/upload-dashboard-image', express.json({ limit: '12mb' }));
app.use(express.json({ limit: '1mb' }));

// Rate limiting: a general cap for everything, tighter caps for sensitive routes.
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
const sensitiveLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });
app.use(generalLimiter);

const sessions = {};

app.post('/api/start', (req, res) => {
  const sessionId = uuidv4();
  sessions[sessionId] = { responses: [], metadata: req.body, createdAt: new Date() };
  res.json({ sessionId, status: 'ready' });
});

app.post('/api/respond', (req, res) => {
  const { sessionId, domain, questionIndex, value } = req.body;
  if (!sessions[sessionId]) return res.status(404).json({ error: 'Session invalid' });
  
  sessions[sessionId].responses.push({ domain, questionIndex, value, timestamp: Date.now() });
  res.json({ accepted: true });
});

app.post('/api/complete', async (req, res) => {
  const { sessionId, metadata: bodyMetadata, responses: bodyResponses, result: bodyResult } = req.body;
  const session = sessions[sessionId];
  // The in-memory session is wiped on every backend restart/redeploy, so fall
  // back to the metadata/responses the client already has in state.
  const metadata = session ? session.metadata : bodyMetadata;
  const responses = session ? session.responses : bodyResponses;
  if (!metadata || !responses) return res.status(404).json({ error: 'Assessment data not found' });
  if (!isEmail(metadata.email) || !isStr(metadata.name, 200) || !isStr(metadata.companyName, 200)) {
    return res.status(400).json({ error: 'Invalid assessment metadata' });
  }
  if (!Array.isArray(responses) || responses.length > 500) {
    return res.status(400).json({ error: 'Invalid responses' });
  }

  const result = calculateScore(responses, metadata);

  try {
    // Save user to Supabase if not exists
    let userId = null;
    const { data: existingUser, error: userFetchError } = await supabase
      .from('users')
      .select('id')
      .eq('email', metadata.email)
      .single();

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create new user
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert([
          {
            name: metadata.name,
            email: metadata.email,
            company_name: metadata.companyName,
            stage: metadata.stage,
            vertical: metadata.vertical,
            uses_ai: metadata.usesAi,
            physical_product: metadata.physicalProduct
          }
        ])
        .select('id')
        .single();
      
      if (userError) {
        console.error('User creation error:', userError);
        return res.status(500).json({ error: 'Failed to save user' });
      }
      userId = newUser.id;
    }
    
    // Save assessment to Supabase
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .insert([
        {
          user_id: userId,
          score: result.score,
          rating: result.rating,
          domain_scores: result.domainScores,
          flags: result.flags,
          polycrisis_triggered: result.polycrisisTriggered,
          high_risk_count: result.highRiskCount,
          // Full dashboard object as computed on the client (falls back to the
          // server-computed result), plus a metadata snapshot, so the exact
          // dashboard can be reloaded verbatim.
          result_json: bodyResult || result,
          metadata_json: metadata
        }
      ])
      .select('id')
      .single();
    
    if (assessmentError) {
      console.error('Assessment creation error:', assessmentError);
      return res.status(500).json({ error: 'Failed to save assessment' });
    }
    
    console.log(`✅ Assessment saved: User ${userId}, Assessment ${assessment.id}`);

    delete sessions[sessionId]; // Clear session after completion
    // Short-lived token authorising the dashboard-image upload that follows.
    const uploadToken = signToken({ assessmentId: assessment.id, email: metadata.email, exp: Date.now() + 30 * 60 * 1000 });
    res.json({ ...result, assessmentId: assessment.id, userId, uploadToken });
  } catch (error) {
    console.error('Error saving to Supabase:', error);
    res.status(500).json({ error: 'Failed to save assessment' });
  }
});

// ============ NEW ENDPOINTS FOR SUPABASE ============

// Get user's past assessments
app.get('/api/user/:email/assessments', async (req, res) => {
  const { email } = req.params;
  
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const { data: assessments, error: assessmentError } = await supabase
      .from('assessments')
      .select('id, score, rating, created_at, domain_scores, flags, result_json, metadata_json')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    if (assessmentError) {
      console.error('Error fetching assessments:', assessmentError);
      return res.status(500).json({ error: 'Failed to fetch assessments' });
    }
    
    res.json({ assessments });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user profile
app.get('/api/user/:email', async (req, res) => {
  const { email } = req.params;
  
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get specific assessment details
app.get('/api/assessment/:assessmentId', async (req, res) => {
  const { assessmentId } = req.params;
  
  try {
    const { data: assessment, error } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', assessmentId)
      .single();
    
    if (error || !assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    
    res.json(assessment);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});
// Upload PDF to Supabase Storage. Gated to paid sessions (the report is the
// paid item), rate-limited, size-capped and path-sanitised.
app.post('/api/upload-pdf', sensitiveLimiter, async (req, res) => {
  const { email, assessmentId, pdfBase64, filename, sessionId } = req.body || {};

  if (!isEmail(email) || !isStr(pdfBase64, 20_000_000) || !isStr(filename, 200)) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  // Authorisation: only a session whose payment is verified may store a report.
  try {
    const { data: paidRow } = await supabase
      .from('payment_sessions')
      .select('paid')
      .eq('session_id', sessionId || '')
      .eq('paid', true)
      .limit(1);
    if (!Array.isArray(paidRow) || paidRow.length === 0) {
      return res.status(402).json({ error: 'Payment required' });
    }
  } catch {
    return res.status(402).json({ error: 'Payment required' });
  }

  try {
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    if (pdfBuffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large' });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const storagePath = `${safeSegment(email.replace('@', '_at_'))}/${timestamp}_${safeFilename(filename, 'report.pdf')}`;

    const { error: uploadError } = await supabase
      .storage
      .from('pdf-reports')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ PDF upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload PDF' });
    }
    
    // Get public URL
    const { data: urlData } = supabase
      .storage
      .from('pdf-reports')
      .getPublicUrl(storagePath);
    
    // Save record in pdf_reports table
    const { data: record, error: recordError } = await supabase
      .from('pdf_reports')
      .insert([{
        user_email: email,
        assessment_id: assessmentId || null,
        filename: filename,
        storage_path: storagePath,
        public_url: urlData?.publicUrl || null,
        file_size: pdfBuffer.length,
      }])
      .select('id')
      .single();
    
    if (recordError) {
      console.warn('⚠️ PDF uploaded but record save failed:', recordError.message);
      // Still return success since the file was uploaded
    }
    
    console.log(`✅ PDF uploaded: ${storagePath} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);
    
    res.json({
      success: true,
      path: storagePath,
      url: urlData?.publicUrl || null,
      recordId: record?.id || null,
      fileSize: pdfBuffer.length,
    });
  } catch (error) {
    console.error('❌ PDF upload failed:', error);
    res.status(500).json({ error: 'Failed to upload PDF' });
  }
});

// Get all PDFs for a user
app.get('/api/user/:email/pdfs', async (req, res) => {
  const { email } = req.params;
  try {
    const { data, error } = await supabase
      .from('pdf_reports')
      .select('*')
      .eq('user_email', email)
      .order('created_at', { ascending: false });
    
    if (error) {
      return res.status(500).json({ error: 'Failed to fetch PDFs' });
    }
    res.json({ pdfs: data || [] });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ RAZORPAY PAYMENT ENDPOINTS ============

// Create a Razorpay order. The amount is fixed on the server so the client
// cannot tamper with the price. Returns the public key_id so the frontend can
// open the checkout without hard-coding it.
app.post('/api/razorpay/order', async (req, res) => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: 'Razorpay keys not configured on server' });
  }

  const { email, assessmentId, notes, sessionId: clientSessionId } = req.body || {};
  const sessionId = clientSessionId || uuidv4();

  try {
    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: RAZORPAY_AMOUNT,
        currency: RAZORPAY_CURRENCY,
        receipt: `rcpt_${Date.now()}`,
        notes: { email: email || '', assessmentId: assessmentId || '', session_id: sessionId, ...(notes || {}) },
      }),
    });

    const order = await rzpRes.json();
    if (!rzpRes.ok || !order.id) {
      console.error('❌ Razorpay order error:', order);
      return res.status(502).json({ error: 'Failed to create order' });
    }

    // Persist the order → session link so /payment-status can recover the
    // session (and so the paid flag survives page refreshes via polling).
    try {
      await supabase.from('payment_sessions').insert([
        { order_id: order.id, session_id: sessionId, email: email || null, paid: false },
      ]);
    } catch (e) {
      console.warn('⚠️ Could not persist payment_session:', e?.message || e);
    }

    console.log(`✅ Razorpay order created: ${order.id} (${order.amount} ${order.currency}) session=${sessionId}`);
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: RAZORPAY_KEY_ID, sessionId });
  } catch (error) {
    console.error('❌ Razorpay order creation failed:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Landing endpoint the external Payment Hub forwards the browser to. It verifies
// the signature server-side, marks the session paid, then redirects the user
// back to our frontend with ?session=...&payment=success|failed.
//
// The signature is an HMAC-SHA256 of `order_id|payment_id` keyed with the
// Razorpay secret, so only a genuine Razorpay-completed payment can match it.
app.get('/payment-status', async (req, res) => {
  const frontend = process.env.FRONTEND_URL || 'https://risk.infopaceindia.co.in';

  // Accept both the bare names the Hub forwards and the razorpay_-prefixed ones.
  const order_id = req.query.order_id || req.query.razorpay_order_id;
  const payment_id = req.query.payment_id || req.query.razorpay_payment_id;
  const signature = req.query.signature || req.query.razorpay_signature;

  // Recover our session id from the order (best-effort).
  let sessionId = '';
  if (order_id) {
    try {
      const { data } = await supabase
        .from('payment_sessions')
        .select('session_id')
        .eq('order_id', order_id)
        .single();
      sessionId = data?.session_id || '';
    } catch { /* not found — continue with empty session */ }
  }

  const redirectFail = () =>
    res.redirect(`${frontend}?session=${encodeURIComponent(sessionId)}&payment=failed`);

  if (!RAZORPAY_KEY_SECRET || !order_id || !payment_id || !signature) {
    console.warn('⚠️ /payment-status called with missing params or no server secret');
    return redirectFail();
  }

  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${order_id}|${payment_id}`)
    .digest('hex');

  if (!safeEqual(expected, signature)) {
    console.warn(`🚨 Signature verification FAILED (possible tampering) for order ${order_id}`);
    return redirectFail();
  }

  // Signature OK — mark the session paid.
  try {
    await supabase
      .from('payment_sessions')
      .update({ paid: true, payment_id, updated_at: new Date().toISOString() })
      .eq('order_id', order_id);
  } catch (e) {
    console.error('❌ Failed to mark session paid:', e?.message || e);
  }

  console.log(`✅ Payment verified & session ${sessionId} marked paid (order ${order_id})`);
  return res.redirect(`${frontend}?session=${encodeURIComponent(sessionId)}&payment=success`);
});

// Polled by the frontend so a page refresh can re-hydrate the paid flag.
app.get('/api/session/:sessionId/payment', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const { data } = await supabase
      .from('payment_sessions')
      .select('paid')
      .eq('session_id', sessionId)
      .eq('paid', true)
      .limit(1);
    res.json({ paid: Array.isArray(data) && data.length > 0 });
  } catch {
    res.json({ paid: false });
  }
});

// Upload a rendered JPG of the dashboard and save its URL on the assessment.
// Authorised by the short-lived upload token issued at /api/complete.
app.post('/api/upload-dashboard-image', sensitiveLimiter, async (req, res) => {
  const { email, assessmentId, imageBase64, filename, token } = req.body || {};

  if (!isEmail(email) || !isStr(imageBase64, 20_000_000) || !isStr(filename, 200)) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  // Token must be valid, unexpired, and issued for this email + assessment.
  const payload = verifyToken(token);
  if (!payload || payload.email !== email || String(payload.assessmentId) !== String(assessmentId)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    if (imageBuffer.length > 8 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large' });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const storagePath = `${safeSegment(email.replace('@', '_at_'))}/${timestamp}_${safeFilename(filename, 'dashboard.jpg')}`;

    const { error: uploadError } = await supabase
      .storage
      .from('dashboard-images')
      .upload(storagePath, imageBuffer, { contentType: 'image/jpeg', upsert: false });

    if (uploadError) {
      console.error('❌ Dashboard image upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload image' });
    }

    const { data: urlData } = supabase.storage.from('dashboard-images').getPublicUrl(storagePath);
    const publicUrl = urlData?.publicUrl || null;

    // Store the image URL on the assessment row so the admin view can show it.
    if (assessmentId) {
      const { error: updErr } = await supabase
        .from('assessments')
        .update({ dashboard_image_url: publicUrl })
        .eq('id', assessmentId);
      if (updErr) console.warn('⚠️ Could not set dashboard_image_url:', updErr.message);
    }

    console.log(`✅ Dashboard image stored: ${storagePath} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
    res.json({ success: true, url: publicUrl, path: storagePath, fileSize: imageBuffer.length });
  } catch (error) {
    console.error('❌ Dashboard image upload failed:', error);
    res.status(500).json({ error: 'Failed to upload dashboard image' });
  }
});

// ============ ADMIN ============

// List every assessment with its user, newest first. Protected by ADMIN_KEY —
// prefer the x-admin-key header (query is accepted for backwards compatibility
// but leaks into logs). Rate-limited and compared in constant time.
app.get('/api/admin/assessments', sensitiveLimiter, async (req, res) => {
  const provided = req.headers['x-admin-key'] || req.query.key || '';
  if (!ADMIN_KEY || !safeEqual(provided, ADMIN_KEY)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { data, error } = await supabase
      .from('assessments')
      .select('id, score, rating, domain_scores, flags, polycrisis_triggered, high_risk_count, result_json, metadata_json, dashboard_image_url, created_at, users(name, email, company_name, stage, vertical)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Admin assessments fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch assessments' });
    }

    res.json({ count: data?.length || 0, assessments: data || [] });
  } catch (e) {
    console.error('❌ Admin error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(3001, () => console.log('✅ Backend running on http://localhost:3001'));
console.log('🔗 Supabase connected via', process.env.SUPABASE_URL ? 'environment variables' : 'fallback');