require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { calculateScore } = require('./scoringEngine');
const supabase = require('./supabaseClient');

// ── Razorpay config (server-enforced price; never trust the client for amount) ──
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const RAZORPAY_AMOUNT = parseInt(process.env.RAZORPAY_AMOUNT || '100', 10); // in paise — ₹1 (override with RAZORPAY_AMOUNT)
const RAZORPAY_CURRENCY = process.env.RAZORPAY_CURRENCY || 'INR';

// Constant-time compare that tolerates unequal-length inputs.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

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
  const { sessionId, metadata: bodyMetadata, responses: bodyResponses } = req.body;
  const session = sessions[sessionId];
  // The in-memory session is wiped on every backend restart/redeploy, so fall
  // back to the metadata/responses the client already has in state.
  const metadata = session ? session.metadata : bodyMetadata;
  const responses = session ? session.responses : bodyResponses;
  if (!metadata || !responses) return res.status(404).json({ error: 'Assessment data not found' });

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
          high_risk_count: result.highRiskCount
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
    res.json({ ...result, assessmentId: assessment.id, userId });
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
      .select('id, score, rating, created_at, domain_scores, flags')
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
// Upload PDF to Supabase Storage
app.post('/api/upload-pdf', async (req, res) => {
  const { email, assessmentId, pdfBase64, filename } = req.body;
  
  if (!email || !pdfBase64 || !filename) {
    return res.status(400).json({ error: 'Missing required fields: email, pdfBase64, filename' });
  }
  
  try {
    // Convert base64 to buffer
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    
    // Generate unique storage path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const storagePath = `${email.replace('@', '_at_')}/${timestamp}_${filename}`;
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('pdf-reports')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });
    
    if (uploadError) {
      console.error('❌ PDF upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload PDF', details: uploadError.message });
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
      return res.status(502).json({ error: 'Failed to create order', details: order?.error?.description });
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

app.listen(3001, () => console.log('✅ Backend running on http://localhost:3001'));
console.log('🔗 Supabase connected via', process.env.SUPABASE_URL ? 'environment variables' : 'fallback');