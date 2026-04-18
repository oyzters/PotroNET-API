-- Web Push subscriptions (one user can have many — different devices/browsers)
CREATE TABLE public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_used_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, endpoint)
);

CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_subs_select_own" ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "push_subs_insert_own" ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_subs_delete_own" ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- Granular push preferences per user
ALTER TABLE public.user_settings
    ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS push_follows BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS push_messages BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS push_likes BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS push_comments BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS push_tutoring BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS push_system BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS push_moderation BOOLEAN DEFAULT true;
