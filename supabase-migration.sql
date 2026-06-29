-- =============================================
-- Share Bill - Migration for EXISTING databases
-- Run this in Supabase SQL Editor if you already created the old schema.
-- Safe to run multiple times.
-- =============================================

-- 1. Allow the new 'planning' status on groups
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_status_check;
ALTER TABLE groups
  ADD CONSTRAINT groups_status_check
  CHECK (status IN ('planning', 'active', 'closed'));

-- 2. Group chat messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  is_owner BOOLEAN NOT NULL DEFAULT false,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id, created_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on messages" ON messages;
CREATE POLICY "Allow all on messages" ON messages
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Realtime for chat (ignore error if already added)
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
