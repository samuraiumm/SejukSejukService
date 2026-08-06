-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/rkvsionrhvtekuvobwjg/sql/new)
ALTER TABLE service_completions ADD COLUMN IF NOT EXISTS started_at timestamptz;
