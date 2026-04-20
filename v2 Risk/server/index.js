require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { calculateScore } = require('./scoringEngine');
const supabase = require('./supabaseClient');

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
  const { sessionId } = req.body;
  const session = sessions[sessionId];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  
  const result = calculateScore(session.responses, session.metadata);
  
  try {
    // Save user to Supabase if not exists
    let userId = null;
    const { data: existingUser, error: userFetchError } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.metadata.email)
      .single();
    
    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create new user
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert([
          {
            name: session.metadata.name,
            email: session.metadata.email,
            company_name: session.metadata.companyName,
            stage: session.metadata.stage,
            vertical: session.metadata.vertical,
            uses_ai: session.metadata.usesAi,
            physical_product: session.metadata.physicalProduct
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

app.listen(3001, () => console.log('✅ Backend running on http://localhost:3001'));
console.log('🔗 Supabase connected via', process.env.SUPABASE_URL ? 'environment variables' : 'fallback');