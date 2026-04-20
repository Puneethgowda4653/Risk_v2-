-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  stage VARCHAR(50) NOT NULL,
  vertical VARCHAR(50) NOT NULL,
  uses_ai BOOLEAN DEFAULT FALSE,
  physical_product BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create assessments table
CREATE TABLE IF NOT EXISTS assessments (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  rating VARCHAR(50) NOT NULL,
  domain_scores JSONB NOT NULL,
  flags JSONB DEFAULT '[]'::JSONB,
  polycrisis_triggered BOOLEAN DEFAULT FALSE,
  high_risk_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_assessments_user_id ON assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_assessments_created_at ON assessments(created_at DESC);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;

-- Create policies (optional)
-- Allow users to read their own data
CREATE POLICY "Users can read own data" 
  ON users FOR SELECT 
  USING (auth.uid()::text = id::text);

-- Allow users to read own assessments
CREATE POLICY "Users can read own assessments" 
  ON assessments FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = assessments.user_id
  ));
