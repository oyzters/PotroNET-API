-- ============================================================
-- 006: Follow System — replaces friendships
-- ============================================================

-- 1. Create follows table
CREATE TABLE public.follows (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(follower_id, following_id),
    CHECK(follower_id != following_id)
);

CREATE INDEX idx_follows_follower ON public.follows(follower_id);
CREATE INDEX idx_follows_following ON public.follows(following_id);

-- 2. Add counter columns to profiles
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS friends_count INTEGER DEFAULT 0;

-- 3. Triggers to auto-maintain counters
CREATE OR REPLACE FUNCTION update_follow_counters_on_insert()
RETURNS TRIGGER AS $$
DECLARE
    is_mutual BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM public.follows
        WHERE follower_id = NEW.following_id AND following_id = NEW.follower_id
    ) INTO is_mutual;

    UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE public.profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;

    IF is_mutual THEN
        UPDATE public.profiles SET friends_count = friends_count + 1 WHERE id IN (NEW.follower_id, NEW.following_id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_follow_counters_on_delete()
RETURNS TRIGGER AS $$
DECLARE
    was_mutual BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM public.follows
        WHERE follower_id = OLD.following_id AND following_id = OLD.follower_id
    ) INTO was_mutual;

    UPDATE public.profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE public.profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;

    IF was_mutual THEN
        UPDATE public.profiles SET friends_count = GREATEST(friends_count - 1, 0) WHERE id IN (OLD.follower_id, OLD.following_id);
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_follow_insert
    AFTER INSERT ON public.follows
    FOR EACH ROW EXECUTE FUNCTION update_follow_counters_on_insert();

CREATE TRIGGER trigger_follow_delete
    AFTER DELETE ON public.follows
    FOR EACH ROW EXECUTE FUNCTION update_follow_counters_on_delete();

-- 4. Migrate existing friendship data
INSERT INTO public.follows (follower_id, following_id, created_at)
SELECT requester_id, addressee_id, created_at FROM public.friendships WHERE status = 'accepted'
ON CONFLICT DO NOTHING;

INSERT INTO public.follows (follower_id, following_id, created_at)
SELECT addressee_id, requester_id, created_at FROM public.friendships WHERE status = 'accepted'
ON CONFLICT DO NOTHING;

INSERT INTO public.follows (follower_id, following_id, created_at)
SELECT requester_id, addressee_id, created_at FROM public.friendships WHERE status = 'pending'
ON CONFLICT DO NOTHING;

-- 5. Add is_message_request to messages
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS is_message_request BOOLEAN DEFAULT false;

-- 6. Create rankings view
CREATE OR REPLACE VIEW public.user_rankings AS
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

-- 7. Update notifications type constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('friend_request', 'friend_accepted', 'message', 'publication_reply', 'tutoring', 'professor_review', 'achievement', 'system', 'follow', 'message_request'));

-- 8. RLS for follows
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follows_select" ON public.follows FOR SELECT USING (true);
CREATE POLICY "follows_insert" ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "follows_delete" ON public.follows FOR DELETE USING (auth.uid() = follower_id);
