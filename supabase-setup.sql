-- =============================================
-- Share Bill - Supabase Database Setup
-- Run this SQL in Supabase SQL Editor
-- =============================================

-- 1. Create groups table
CREATE TABLE IF NOT EXISTS groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_code VARCHAR(8) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  bank_name TEXT,
  account_number TEXT,
  account_holder TEXT,
  qr_image TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create members table
CREATE TABLE IF NOT EXISTS members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_proof TEXT,
  payment_method TEXT NOT NULL DEFAULT 'none' CHECK (payment_method IN ('none', 'transfer', 'cash')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'confirmed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_groups_code ON groups(group_code);
CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id);

-- 4. Enable Row Level Security (RLS) - Allow all for simplicity
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies - Allow all operations (no auth required)
CREATE POLICY "Allow all on groups" ON groups
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on members" ON members
  FOR ALL USING (true) WITH CHECK (true);

-- 6. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE members;
