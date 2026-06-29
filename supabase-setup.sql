-- =============================================
-- Share Bill - Supabase Database Setup
-- Run this SQL in Supabase SQL Editor (fresh project)
-- For an EXISTING database, run supabase-migration.sql instead.
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
  -- planning: group created, chat only, no bill yet
  -- active:   admin set prices, members can pay / mark done
  -- closed:   bill finished
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create members table (the bill split rows)
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

-- 3. Create messages table (group chat — scoped to one group)
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  is_owner BOOLEAN NOT NULL DEFAULT false,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_groups_code ON groups(group_code);
CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id);
CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id, created_at);

-- 5. Enable Row Level Security (RLS) - Allow all for simplicity (no auth)
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies - Allow all operations (no auth required)
DROP POLICY IF EXISTS "Allow all on groups" ON groups;
CREATE POLICY "Allow all on groups" ON groups
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on members" ON members;
CREATE POLICY "Allow all on members" ON members
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on messages" ON messages;
CREATE POLICY "Allow all on messages" ON messages
  FOR ALL USING (true) WITH CHECK (true);

-- 7. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE members;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
