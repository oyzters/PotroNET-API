-- ============================================================
-- 014: Fix user_rankings view RLS (Security Invoker)
-- ============================================================

DROP VIEW IF EXISTS public.user_rankings;

CREATE VIEW public.user_rankings WITH (security_invoker = on) AS
SELECT
    p.id, p.full_name, p.avatar_url, p.reputation,
    p.friends_count, p.followers_count, p.following_count,
    p.semester, p.career_id,
    c.name AS career_name,
    (p.reputation * 2 + p.friends_count * 3 + p.followers_count) AS popularity_score
FROM public.profiles p
LEFT JOIN public.careers c ON p.career_id = c.id
WHERE p.is_banned = false
ORDER BY (p.reputation * 2 + p.friends_count * 3 + p.followers_count) DESC;
