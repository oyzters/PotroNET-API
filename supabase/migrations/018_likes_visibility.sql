-- 018: Add show_likes_to_owner preference to user_settings
ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS show_likes_to_owner BOOLEAN NOT NULL DEFAULT true;
