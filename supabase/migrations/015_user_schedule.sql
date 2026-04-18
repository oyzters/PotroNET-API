-- ============================================================
-- 015: User weekly class schedule (Lun–Vie) + visibility setting
-- ============================================================

-- ── 1. schedule_visibility en profiles ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS schedule_visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (schedule_visibility IN ('public','followers','private'));

-- ── 2. Tabla de bloques semanales ──
CREATE TABLE IF NOT EXISTS public.user_schedule (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    day_of_week   SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 5), -- 1=Lun … 5=Vie
    start_time    TIME NOT NULL,
    end_time      TIME NOT NULL,
    subject_name  TEXT NOT NULL,
    classroom     TEXT,
    professor     TEXT,
    color         TEXT NOT NULL DEFAULT 'blue',
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_user_schedule_user ON public.user_schedule(user_id);
CREATE INDEX IF NOT EXISTS idx_user_schedule_user_day ON public.user_schedule(user_id, day_of_week);

-- Trigger updated_at (reusa update_updated_at definido en 001)
DROP TRIGGER IF EXISTS set_user_schedule_updated_at ON public.user_schedule;
CREATE TRIGGER set_user_schedule_updated_at
  BEFORE UPDATE ON public.user_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 3. Row-Level Security ──
ALTER TABLE public.user_schedule ENABLE ROW LEVEL SECURITY;

-- SELECT: dueño siempre; otros según schedule_visibility y relación follow
DROP POLICY IF EXISTS user_schedule_select ON public.user_schedule;
CREATE POLICY user_schedule_select ON public.user_schedule FOR SELECT
USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = user_schedule.user_id
          AND (
              p.schedule_visibility = 'public'
              OR (
                  p.schedule_visibility = 'followers'
                  AND EXISTS (
                      SELECT 1 FROM public.follows f
                      WHERE f.follower_id = auth.uid()
                        AND f.following_id = user_schedule.user_id
                  )
              )
          )
    )
);

-- INSERT/UPDATE/DELETE: solo el dueño
DROP POLICY IF EXISTS user_schedule_insert ON public.user_schedule;
CREATE POLICY user_schedule_insert ON public.user_schedule FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_schedule_update ON public.user_schedule;
CREATE POLICY user_schedule_update ON public.user_schedule FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_schedule_delete ON public.user_schedule;
CREATE POLICY user_schedule_delete ON public.user_schedule FOR DELETE
  USING (user_id = auth.uid());
