# Supabase Setup Guide

## Quick Start

### 1. Create Supabase Account
- Go to [supabase.com](https://supabase.com)
- Sign up (free)
- Create a new project (PostgreSQL)

### 2. Get Your Credentials
- Go to Project Settings → API
- Copy:
  - **Project URL** (SUPABASE_URL)
  - **anon/public key** (SUPABASE_ANON_KEY)

### 3. Set Up Database Schema
- In Supabase Dashboard, go to SQL Editor
- Create a new query
- Copy & paste the contents from `supabase_schema.sql`
- Run the query
- ✅ Tables created!

### 4. Create .env File
In your server folder, create `.env`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
PORT=3001
```

### 5. Install Dependencies
```bash
cd server
npm install
```

### 6. Start Server
```bash
npm run dev
```

You should see:
```
✅ Backend running on http://localhost:3001
🔗 Supabase connected via environment variables
```

---

## API Endpoints

### Complete Assessment & Save
```
POST /api/complete
Body: { sessionId: "..." }

Response: {
  score: 45,
  rating: "MODERATE_RISK",
  domainScores: {...},
  flags: [],
  polycrisisTriggered: false,
  highRiskCount: 2,
  assessmentId: 123,      // NEW - ID in database
  userId: 456             // NEW - User ID in database
}
```

### Get User's Past Assessments
```
GET /api/user/:email/assessments

Response: {
  assessments: [
    {
      id: 123,
      score: 45,
      rating: "MODERATE_RISK",
      created_at: "2024-01-15T10:30:00Z",
      domain_scores: {...},
      flags: [...]
    },
    ...
  ]
}
```

### Get User Profile
```
GET /api/user/:email

Response: {
  id: 456,
  name: "Jane Smith",
  email: "jane@example.com",
  company_name: "Acme Corp",
  stage: "series-a",
  vertical: "saas-b2b",
  uses_ai: true,
  physical_product: false,
  created_at: "2024-01-10T00:00:00Z"
}
```

### Get Specific Assessment
```
GET /api/assessment/:assessmentId

Response: {
  id: 123,
  user_id: 456,
  score: 45,
  rating: "MODERATE_RISK",
  domain_scores: {...},
  flags: [...],
  polycrisis_triggered: false,
  high_risk_count: 2,
  created_at: "2024-01-15T10:30:00Z"
}
```

---

## Database Tables

### users
```
id (Primary Key)
name (VARCHAR)
email (UNIQUE)
company_name (VARCHAR)
stage (VARCHAR)
vertical (VARCHAR)
uses_ai (BOOLEAN)
physical_product (BOOLEAN)
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

### assessments
```
id (Primary Key)
user_id (Foreign Key → users.id)
score (0-100)
rating (VARCHAR)
domain_scores (JSONB)
flags (JSONB array)
polycrisis_triggered (BOOLEAN)
high_risk_count (INTEGER)
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

---

## Testing Supabase Connection

Run this in your server terminal:
```bash
node -e "const supabase = require('./supabaseClient'); console.log('✅ Supabase connected'); process.exit(0);"
```

You should see: `✅ Supabase connected`

---

## Frontend Integration

Update your React components to use the new endpoints:

```javascript
// Save assessment and get ID
const response = await fetch('http://localhost:3001/api/complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId })
});

const result = await response.json();
console.log('Assessment saved with ID:', result.assessmentId);

// Get user's past assessments
const assessments = await fetch(`http://localhost:3001/api/user/${email}/assessments`);
const data = await assessments.json();
console.log('Past assessments:', data.assessments);
```

---

## Troubleshooting

**Error: "Missing Supabase credentials"**
- Create `.env` file with SUPABASE_URL and SUPABASE_ANON_KEY

**Error: "Failed to save user"**
- Check if tables exist in Supabase
- Run supabase_schema.sql in SQL Editor

**Error: "Cannot read property 'id' of undefined"**
- Database may not be set up correctly
- Verify schema.sql was executed successfully

---

## Security Notes

- Use `.env` files and never commit them
- Add `.env` to `.gitignore`
- In production, use environment variables from your hosting platform
- Supabase has built-in Row Level Security (RLS) - configure based on your needs

---

## Next Steps

1. ✅ Set up Supabase project
2. ✅ Create database schema
3. ✅ Configure .env file
4. ✅ Install dependencies
5. ✅ Start server
6. Update React frontend to use new endpoints
7. Test end-to-end flow
8. Deploy to Render or Vercel
