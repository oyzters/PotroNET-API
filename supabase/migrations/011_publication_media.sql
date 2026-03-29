-- 011: Publications media — multiple photos + video via external URLs
-- Each item: { type: 'image'|'video', url: string }

ALTER TABLE public.publications ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]'::jsonb;

UPDATE public.publications
SET media = jsonb_build_array(jsonb_build_object('type', 'image', 'url', image_url))
WHERE image_url IS NOT NULL AND image_url != '';
