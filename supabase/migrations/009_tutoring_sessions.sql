CREATE TABLE public.tutoring_sessions (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    offer_id UUID NOT NULL REFERENCES public.tutoring_offers(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    time_start TIME NOT NULL,
    time_end TIME NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
    location TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tutoring_sessions_student ON public.tutoring_sessions(student_id);
CREATE INDEX idx_tutoring_sessions_tutor ON public.tutoring_sessions(tutor_id);
CREATE INDEX idx_tutoring_sessions_offer ON public.tutoring_sessions(offer_id);

ALTER TABLE public.tutoring_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_select" ON public.tutoring_sessions FOR SELECT USING (auth.uid() = student_id OR auth.uid() = tutor_id);
CREATE POLICY "sessions_insert" ON public.tutoring_sessions FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "sessions_update" ON public.tutoring_sessions FOR UPDATE USING (auth.uid() = tutor_id OR auth.uid() = student_id);
