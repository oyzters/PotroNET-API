CREATE TABLE public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    notification_email BOOLEAN DEFAULT true,
    dm_privacy TEXT DEFAULT 'everyone' CHECK (dm_privacy IN ('everyone', 'followers', 'friends')),
    theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_select" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "settings_insert" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "settings_update" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);
