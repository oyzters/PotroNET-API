-- 019: Track explicit content edits on publications
ALTER TABLE public.publications
    ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT false;
