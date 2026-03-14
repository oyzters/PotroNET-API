-- ============================================
-- PotroNET Migration 005
-- Add reply_to field to messages
-- ============================================

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages(reply_to);
