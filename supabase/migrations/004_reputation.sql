-- ============================================
-- PotroNET Migration 004
-- Reputation Calculation Triggers
-- ============================================

-- Function to update the author's reputation when their publication is liked/unliked
CREATE OR REPLACE FUNCTION public.update_reputation_on_like()
RETURNS TRIGGER AS $$
DECLARE
  author_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT user_id INTO author_id FROM public.publications WHERE id = NEW.publication_id;
    IF author_id IS NOT NULL THEN
      UPDATE public.profiles SET reputation = COALESCE(reputation, 0) + 1 WHERE id = author_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT user_id INTO author_id FROM public.publications WHERE id = OLD.publication_id;
    IF author_id IS NOT NULL THEN
      UPDATE public.profiles SET reputation = GREATEST(COALESCE(reputation, 0) - 1, 0) WHERE id = author_id;
    END IF;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_like_reputation_change
  AFTER INSERT OR DELETE ON public.publication_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_reputation_on_like();


-- Function to update a tutor's reputation when they receive a review
-- Let's say: rating >= 4 = +2 rep, rating <= 2 = -1 rep
CREATE OR REPLACE FUNCTION public.update_reputation_on_tutor_review()
RETURNS TRIGGER AS $$
DECLARE
  rep_change INTEGER := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.rating >= 4 THEN rep_change := 2;
    ELSIF NEW.rating <= 2 THEN rep_change := -1;
    END IF;
    
    IF rep_change <> 0 THEN
      UPDATE public.profiles SET reputation = GREATEST(COALESCE(reputation, 0) + rep_change, 0) WHERE id = NEW.tutor_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_tutor_review_reputation_change
  AFTER INSERT ON public.tutor_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_reputation_on_tutor_review();
