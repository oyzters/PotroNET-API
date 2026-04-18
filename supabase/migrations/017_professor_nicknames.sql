-- ============================================
-- PotroNET – Migration 017: Professor nicknames
-- Run in Supabase SQL Editor
-- ============================================

-- 1. Add nickname column to professors (admin-controlled, displayed)
ALTER TABLE public.professors ADD COLUMN IF NOT EXISTS nickname TEXT;

-- 1b. Also allow nickname when *requesting* a new professor
ALTER TABLE public.professor_requests ADD COLUMN IF NOT EXISTS nickname TEXT;

-- 2. Suggestions table: students propose, admin approves/rejects
CREATE TABLE IF NOT EXISTS public.professor_nickname_suggestions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  professor_id UUID REFERENCES public.professors(id) ON DELETE CASCADE NOT NULL,
  suggested_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  nickname TEXT NOT NULL CHECK (char_length(trim(nickname)) BETWEEN 1 AND 40),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prof_nick_sugg_professor ON public.professor_nickname_suggestions(professor_id);
CREATE INDEX IF NOT EXISTS idx_prof_nick_sugg_status ON public.professor_nickname_suggestions(status);
-- Prevent same user from submitting the exact same nickname twice for the same prof
CREATE UNIQUE INDEX IF NOT EXISTS idx_prof_nick_sugg_unique ON public.professor_nickname_suggestions(professor_id, suggested_by, lower(trim(nickname)));

ALTER TABLE public.professor_nickname_suggestions ENABLE ROW LEVEL SECURITY;

-- Anyone (even anon) can read suggestions
CREATE POLICY "Nickname suggestions viewable by everyone"
  ON public.professor_nickname_suggestions FOR SELECT USING (true);

-- Authenticated users can create their own suggestions
CREATE POLICY "Auth users can create nickname suggestions"
  ON public.professor_nickname_suggestions FOR INSERT
  WITH CHECK (auth.uid() = suggested_by);

-- Users can delete only their own pending suggestions (admin overrides via service role)
CREATE POLICY "Users can delete own pending suggestions"
  ON public.professor_nickname_suggestions FOR DELETE
  USING (auth.uid() = suggested_by AND status = 'pending');
