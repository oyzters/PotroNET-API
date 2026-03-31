-- ============================================
-- PotroNET – Moderation System Migration 012
-- Run this in your Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. MODERATION ACTIONS (audit log)
-- ============================================
CREATE TABLE public.moderation_actions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  moderator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'delete_publication', 'delete_comment', 'warn_user',
    'ban_user', 'unban_user', 'role_change', 'resolve_report', 'dismiss_report'
  )),
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_content_id TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'otro' CHECK (category IN (
    'spam', 'acoso', 'contenido_sexual', 'violencia', 'informacion_falsa', 'odio', 'otro'
  )),
  reason TEXT DEFAULT '',
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_moderation_actions_moderator ON public.moderation_actions(moderator_id);
CREATE INDEX idx_moderation_actions_target_user ON public.moderation_actions(target_user_id);
CREATE INDEX idx_moderation_actions_type ON public.moderation_actions(action_type);
CREATE INDEX idx_moderation_actions_created ON public.moderation_actions(created_at DESC);

-- RLS: Only admin/sudo can view, service role can insert
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sudo can view all moderation actions"
  ON public.moderation_actions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'sudo')
  );

CREATE POLICY "Admins can view moderation actions"
  ON public.moderation_actions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'sudo'))
  );

-- ============================================
-- 2. USER WARNINGS
-- ============================================
CREATE TABLE public.user_warnings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  issued_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'otro' CHECK (category IN (
    'spam', 'acoso', 'contenido_sexual', 'violencia', 'informacion_falsa', 'odio', 'otro'
  )),
  message TEXT NOT NULL,
  is_acknowledged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_warnings_user ON public.user_warnings(user_id);
CREATE INDEX idx_user_warnings_issued_by ON public.user_warnings(issued_by);
CREATE INDEX idx_user_warnings_created ON public.user_warnings(created_at DESC);

-- RLS
ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own warnings"
  ON public.user_warnings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all warnings"
  ON public.user_warnings FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'sudo'))
  );

CREATE POLICY "Users can acknowledge own warnings"
  ON public.user_warnings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 3. ENHANCE REPORTS TABLE
-- ============================================
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS resolution_note TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS resolved_content_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS content TEXT DEFAULT '';  -- snapshot of reported content

-- ============================================
-- 4. NOTIFICATION TYPE: moderation
-- ============================================
-- Alter the notifications type check constraint to include 'moderation' and 'warning'
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'message', 'publication_reply',
    'tutoring', 'professor_review', 'achievement', 'system', 'moderation', 'warning',
    'follow', 'message_request'
  ));
