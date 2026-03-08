-- ============================================
-- PotroNET – Migration 003: Profile Images
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Add cover_url column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cover_url TEXT DEFAULT '';

-- 2. Create storage buckets for avatars and covers
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('covers', 'covers', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies for avatars bucket
-- Allow public read
CREATE POLICY "Public avatar access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Allow authenticated users to upload their own avatar
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to update/replace their own avatar
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to delete their own avatar
CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 4. Storage policies for covers bucket
CREATE POLICY "Public cover access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'covers');

CREATE POLICY "Users can upload own cover"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'covers'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own cover"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'covers'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own cover"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'covers'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 5. Fix notifications table: add content column as alias for easier API use
--    (notifications table uses title+body; add content as computed or add column)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS content TEXT DEFAULT '';

-- Backfill: set content = title for existing rows
UPDATE public.notifications SET content = title WHERE content = '';

-- 6. Fix notifications RLS to allow system inserts via service role
-- (supabaseAdmin bypasses RLS so no extra policies needed)

-- Done! ✅
