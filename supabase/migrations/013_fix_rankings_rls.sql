-- ============================================
-- PotroNET – Fix Rankings RLS Migration 013
-- Fixes: View public.user_rankings defined with SECURITY DEFINER
-- Run this in your Supabase SQL Editor
-- ============================================

-- Drop the old SECURITY DEFINER view if it exists
DROP VIEW IF EXISTS public.user_rankings;

-- Recreate as a regular view with SECURITY INVOKER (default for Postgres)
-- This makes the view respect the RLS policies of the querying user,
-- not the view creator. The rankings query is already done in the API
-- via profiles table directly, so this view is just for legacy/DB tooling.
CREATE VIEW public.user_rankings
  WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.full_name,
  p.avatar_url,
  p.reputation,
  p.semester,
  p.career_id,
  p.is_banned,
  COALESCE(p.reputation, 0) * 2 AS popularity_score,
  c.name AS career_name
FROM public.profiles p
LEFT JOIN public.careers c ON c.id = p.career_id
WHERE p.is_banned = false;

-- Grant select to authenticated role
GRANT SELECT ON public.user_rankings TO authenticated;
GRANT SELECT ON public.user_rankings TO anon;
