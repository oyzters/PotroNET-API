-- ============================================================
-- 007: Comments table + comments_count on publications
-- ============================================================

CREATE TABLE public.publication_comments (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    publication_id UUID NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) <= 500),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_comments_publication ON public.publication_comments(publication_id);
CREATE INDEX idx_comments_user ON public.publication_comments(user_id);

ALTER TABLE public.publications
    ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;

CREATE OR REPLACE FUNCTION update_comments_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.publications SET comments_count = comments_count + 1 WHERE id = NEW.publication_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.publications SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.publication_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_comments_count
    AFTER INSERT OR DELETE ON public.publication_comments
    FOR EACH ROW EXECUTE FUNCTION update_comments_count();

ALTER TABLE public.publication_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_select" ON public.publication_comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON public.publication_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete" ON public.publication_comments FOR DELETE USING (auth.uid() = user_id);
