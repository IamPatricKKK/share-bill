-- =============================================
-- Lên Kèo - Multi-invoice (hoá đơn chi tiết) upgrade
-- Run this in Supabase SQL Editor AFTER supabase-setup.sql.
-- Safe to run multiple times.
--
-- New model:
--   participants  - roster of people in a room
--   bills         - invoices (each has a date + due date)
--   bill_items    - line items of a bill (name, price, qty)
--   item_shares   - which participants split each item
--   bill_shares   - payment status per participant per bill
--
-- Every table carries group_id so Realtime can filter by room.
-- =============================================

-- 1. Participants (room roster) ----------------------------------------------
CREATE TABLE IF NOT EXISTS participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bills (invoices) --------------------------------------------------------
CREATE TABLE IF NOT EXISTS bills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  bill_date DATE,
  due_date DATE,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Bill line items ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS bill_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  qty NUMERIC NOT NULL DEFAULT 1,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Item shares (who splits each item) --------------------------------------
CREATE TABLE IF NOT EXISTS item_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES bill_items(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  UNIQUE (item_id, participant_id)
);

-- 5. Bill shares (payment status per participant per bill) -------------------
CREATE TABLE IF NOT EXISTS bill_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'confirmed')),
  payment_method TEXT NOT NULL DEFAULT 'none' CHECK (payment_method IN ('none', 'transfer', 'cash')),
  payment_proof TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bill_id, participant_id)
);

-- 6. Indexes -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_participants_group ON participants(group_id);
CREATE INDEX IF NOT EXISTS idx_bills_group ON bills(group_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_group ON bill_items(group_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_item_shares_group ON item_shares(group_id);
CREATE INDEX IF NOT EXISTS idx_item_shares_item ON item_shares(item_id);
CREATE INDEX IF NOT EXISTS idx_bill_shares_group ON bill_shares(group_id);
CREATE INDEX IF NOT EXISTS idx_bill_shares_bill ON bill_shares(bill_id);

-- 7. Row Level Security (allow all - no auth, matches existing tables) --------
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on participants" ON participants;
CREATE POLICY "Allow all on participants" ON participants FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all on bills" ON bills;
CREATE POLICY "Allow all on bills" ON bills FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all on bill_items" ON bill_items;
CREATE POLICY "Allow all on bill_items" ON bill_items FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all on item_shares" ON item_shares;
CREATE POLICY "Allow all on item_shares" ON item_shares FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all on bill_shares" ON bill_shares;
CREATE POLICY "Allow all on bill_shares" ON bill_shares FOR ALL USING (true) WITH CHECK (true);

-- 8. Realtime (ignore errors if already added) -------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE bills;
ALTER PUBLICATION supabase_realtime ADD TABLE bill_items;
ALTER PUBLICATION supabase_realtime ADD TABLE item_shares;
ALTER PUBLICATION supabase_realtime ADD TABLE bill_shares;
