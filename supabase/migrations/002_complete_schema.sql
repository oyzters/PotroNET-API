-- ============================================
-- PotroNET – Complete Schema Migration 002
-- Run this in your Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. PROFESSORS TABLE
-- ============================================
CREATE TABLE public.professors (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT DEFAULT '',
  department TEXT DEFAULT '',
  career_id UUID REFERENCES public.careers(id),
  avg_rating NUMERIC(3,2) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  is_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. PROFESSOR REVIEWS (anonymous evaluations)
-- ============================================
CREATE TABLE public.professor_reviews (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  professor_id UUID REFERENCES public.professors(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  teaching_quality INTEGER NOT NULL CHECK (teaching_quality >= 0 AND teaching_quality <= 5),
  clarity INTEGER NOT NULL CHECK (clarity >= 0 AND clarity <= 5),
  student_treatment INTEGER NOT NULL CHECK (student_treatment >= 0 AND student_treatment <= 5),
  exam_difficulty INTEGER NOT NULL CHECK (exam_difficulty >= 0 AND exam_difficulty <= 5),
  overall_rating NUMERIC(3,2) NOT NULL CHECK (overall_rating >= 0 AND overall_rating <= 5),
  qualities TEXT[] DEFAULT '{}',
  weaknesses TEXT[] DEFAULT '{}',
  comment TEXT DEFAULT '',
  subject_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(professor_id, user_id)
);

-- Function to update professor avg_rating
CREATE OR REPLACE FUNCTION public.update_professor_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.professors SET
    avg_rating = (SELECT COALESCE(AVG(overall_rating), 0) FROM public.professor_reviews WHERE professor_id = COALESCE(NEW.professor_id, OLD.professor_id)),
    total_reviews = (SELECT COUNT(*) FROM public.professor_reviews WHERE professor_id = COALESCE(NEW.professor_id, OLD.professor_id)),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.professor_id, OLD.professor_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_professor_review_change
  AFTER INSERT OR UPDATE OR DELETE ON public.professor_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_professor_rating();

-- ============================================
-- 3. PROFESSOR REQUESTS
-- ============================================
CREATE TABLE public.professor_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  professor_name TEXT NOT NULL,
  department TEXT DEFAULT '',
  career_id UUID REFERENCES public.careers(id),
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. CAREER SUBJECTS (materias por carrera)
-- ============================================
CREATE TABLE public.career_subjects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  career_id UUID REFERENCES public.careers(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  semester INTEGER NOT NULL CHECK (semester >= 1 AND semester <= 12),
  credits INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_career_subjects_career ON public.career_subjects(career_id);
CREATE INDEX idx_career_subjects_semester ON public.career_subjects(career_id, semester);

-- ============================================
-- 5. USER SUBJECTS (roadmap status)
-- ============================================
CREATE TABLE public.user_subjects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES public.career_subjects(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'NO_CURSADA' CHECK (status IN ('NO_CURSADA', 'CURSANDO', 'APROBADA', 'REPROBADA')),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, subject_id)
);

-- ============================================
-- 6. SUBJECT DIFFICULTY RATINGS
-- ============================================
CREATE TABLE public.subject_difficulty_ratings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES public.career_subjects(id) ON DELETE CASCADE NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('normal', 'dificil', 'muy_dificil')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, subject_id)
);

-- ============================================
-- 7. TUTOR REQUESTS (solicitar ser tutor)
-- ============================================
CREATE TABLE public.tutor_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  subject_name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 8. TUTORING OFFERS
-- ============================================
CREATE TABLE public.tutoring_offers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tutor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  subject_name TEXT NOT NULL,
  description TEXT DEFAULT '',
  schedule TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  max_students INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 9. TUTOR REVIEWS
-- ============================================
CREATE TABLE public.tutor_reviews (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tutor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  reviewer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tutor_id, reviewer_id)
);

-- ============================================
-- 10. RESOURCES
-- ============================================
CREATE TABLE public.resources (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  resource_type TEXT NOT NULL CHECK (resource_type IN ('pdf', 'resumen', 'presentacion', 'guia', 'examen', 'otro')),
  file_url TEXT DEFAULT '',
  career_id UUID REFERENCES public.careers(id),
  subject_name TEXT DEFAULT '',
  professor_name TEXT DEFAULT '',
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 11. REPORTS
-- ============================================
CREATE TABLE public.reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('publication', 'user', 'review')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  reviewed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 12. NOTIFICATIONS
-- ============================================
CREATE TABLE public.notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('friend_request', 'friend_accepted', 'message', 'publication_reply', 'tutoring', 'professor_review', 'achievement', 'system')),
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  reference_id TEXT DEFAULT '',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 13. MESSAGES
-- ============================================
CREATE TABLE public.messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) <= 1000),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 14. ACHIEVEMENTS
-- ============================================
CREATE TABLE public.achievements (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT '🏆',
  points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default achievements
INSERT INTO public.achievements (name, description, icon, points) VALUES
  ('Tutor Destacado', 'Has completado 10 tutorías exitosas', '📚', 100),
  ('Mejor Evaluador', 'Has evaluado a 20 profesores', '⭐', 50),
  ('Estudiante Colaborativo', 'Has compartido 15 recursos académicos', '🤝', 75),
  ('Mentor Activo', 'Has ayudado a 25 estudiantes', '🎓', 150),
  ('Primer Publicación', 'Creaste tu primera publicación', '✍️', 10),
  ('Red Social', 'Tienes 10 amigos en la plataforma', '👥', 25),
  ('Explorador', 'Has visitado todos los mapas curriculares', '🗺️', 30),
  ('Evaluador Novato', 'Has evaluado tu primer profesor', '📝', 15);

-- ============================================
-- 15. USER ACHIEVEMENTS
-- ============================================
CREATE TABLE public.user_achievements (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id UUID REFERENCES public.achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

-- ============================================
-- 16. POLLS
-- ============================================
CREATE TABLE public.polls (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  question TEXT NOT NULL,
  career_id UUID REFERENCES public.careers(id),
  is_active BOOLEAN DEFAULT TRUE,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 17. POLL OPTIONS
-- ============================================
CREATE TABLE public.poll_options (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  poll_id UUID REFERENCES public.polls(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  votes_count INTEGER DEFAULT 0
);

-- ============================================
-- 18. POLL VOTES
-- ============================================
CREATE TABLE public.poll_votes (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  poll_id UUID REFERENCES public.polls(id) ON DELETE CASCADE,
  option_id UUID REFERENCES public.poll_options(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, poll_id)
);

-- Function to update poll option vote count
CREATE OR REPLACE FUNCTION public.update_poll_votes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.poll_options SET votes_count = votes_count + 1 WHERE id = NEW.option_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.poll_options SET votes_count = votes_count - 1 WHERE id = OLD.option_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_poll_vote_change
  AFTER INSERT OR DELETE ON public.poll_votes
  FOR EACH ROW EXECUTE FUNCTION public.update_poll_votes_count();

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Professors RLS
ALTER TABLE public.professors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved professors viewable by everyone" ON public.professors FOR SELECT USING (is_approved = true);
CREATE POLICY "Admins can manage professors" ON public.professors FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'sudo'))
);

-- Professor Reviews RLS
ALTER TABLE public.professor_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reviews viewable by everyone" ON public.professor_reviews FOR SELECT USING (true);
CREATE POLICY "Auth users can create reviews" ON public.professor_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own reviews" ON public.professor_reviews FOR DELETE USING (auth.uid() = user_id);

-- Professor Requests RLS
ALTER TABLE public.professor_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own requests" ON public.professor_requests FOR SELECT USING (auth.uid() = requested_by);
CREATE POLICY "Auth users can create requests" ON public.professor_requests FOR INSERT WITH CHECK (auth.uid() = requested_by);
CREATE POLICY "Admins can view all requests" ON public.professor_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'sudo'))
);

-- Career Subjects RLS
ALTER TABLE public.career_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Subjects viewable by everyone" ON public.career_subjects FOR SELECT USING (true);

-- User Subjects RLS
ALTER TABLE public.user_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view any user subjects" ON public.user_subjects FOR SELECT USING (true);
CREATE POLICY "Users can manage own subjects" ON public.user_subjects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own subjects" ON public.user_subjects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own subjects" ON public.user_subjects FOR DELETE USING (auth.uid() = user_id);

-- Subject Difficulty RLS
ALTER TABLE public.subject_difficulty_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Difficulty ratings viewable by everyone" ON public.subject_difficulty_ratings FOR SELECT USING (true);
CREATE POLICY "Auth users can rate difficulty" ON public.subject_difficulty_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ratings" ON public.subject_difficulty_ratings FOR UPDATE USING (auth.uid() = user_id);

-- Tutor Requests RLS
ALTER TABLE public.tutor_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own tutor requests" ON public.tutor_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Auth users can request tutor" ON public.tutor_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all tutor requests" ON public.tutor_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'sudo'))
);

-- Tutoring Offers RLS
ALTER TABLE public.tutoring_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active offers viewable by everyone" ON public.tutoring_offers FOR SELECT USING (true);
CREATE POLICY "Tutors can create offers" ON public.tutoring_offers FOR INSERT WITH CHECK (auth.uid() = tutor_id);
CREATE POLICY "Tutors can update own offers" ON public.tutoring_offers FOR UPDATE USING (auth.uid() = tutor_id);
CREATE POLICY "Tutors can delete own offers" ON public.tutoring_offers FOR DELETE USING (auth.uid() = tutor_id);

-- Tutor Reviews RLS
ALTER TABLE public.tutor_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tutor reviews viewable by everyone" ON public.tutor_reviews FOR SELECT USING (true);
CREATE POLICY "Auth users can review tutors" ON public.tutor_reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

-- Resources RLS
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Resources viewable by everyone" ON public.resources FOR SELECT USING (true);
CREATE POLICY "Auth users can share resources" ON public.resources FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own resources" ON public.resources FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own resources" ON public.resources FOR DELETE USING (auth.uid() = user_id);

-- Reports RLS
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own reports" ON public.reports FOR SELECT USING (auth.uid() = reporter_id);
CREATE POLICY "Auth users can create reports" ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Admins can view all reports" ON public.reports FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'sudo'))
);

-- Notifications RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- Messages RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own messages" ON public.messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Auth users can send messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can update own sent messages" ON public.messages FOR UPDATE USING (auth.uid() = receiver_id);

-- Achievements RLS
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Achievements viewable by everyone" ON public.achievements FOR SELECT USING (true);

-- User Achievements RLS
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User achievements viewable by everyone" ON public.user_achievements FOR SELECT USING (true);

-- Polls RLS
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Polls viewable by everyone" ON public.polls FOR SELECT USING (true);
CREATE POLICY "Auth users can create polls" ON public.polls FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Poll Options RLS
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Poll options viewable by everyone" ON public.poll_options FOR SELECT USING (true);

-- Poll Votes RLS
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Poll votes viewable by everyone" ON public.poll_votes FOR SELECT USING (true);
CREATE POLICY "Auth users can vote" ON public.poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_professors_career ON public.professors(career_id);
CREATE INDEX idx_professors_approved ON public.professors(is_approved);
CREATE INDEX idx_professors_rating ON public.professors(avg_rating DESC);
CREATE INDEX idx_professor_reviews_professor ON public.professor_reviews(professor_id);
CREATE INDEX idx_professor_requests_status ON public.professor_requests(status);
CREATE INDEX idx_user_subjects_user ON public.user_subjects(user_id);
CREATE INDEX idx_tutoring_offers_active ON public.tutoring_offers(is_active);
CREATE INDEX idx_tutoring_offers_tutor ON public.tutoring_offers(tutor_id);
CREATE INDEX idx_tutor_requests_status ON public.tutor_requests(status);
CREATE INDEX idx_resources_career ON public.resources(career_id);
CREATE INDEX idx_resources_type ON public.resources(resource_type);
CREATE INDEX idx_resources_created ON public.resources(created_at DESC);
CREATE INDEX idx_reports_status ON public.reports(status);
CREATE INDEX idx_reports_type ON public.reports(report_type);
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(user_id, is_read);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_receiver ON public.messages(receiver_id);
CREATE INDEX idx_messages_conversation ON public.messages(sender_id, receiver_id, created_at DESC);
CREATE INDEX idx_polls_active ON public.polls(is_active);
CREATE INDEX idx_poll_options_poll ON public.poll_options(poll_id);

-- ============================================
-- UPDATED_AT TRIGGERS FOR NEW TABLES
-- ============================================
CREATE TRIGGER set_professors_updated_at
  BEFORE UPDATE ON public.professors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_professor_requests_updated_at
  BEFORE UPDATE ON public.professor_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_user_subjects_updated_at
  BEFORE UPDATE ON public.user_subjects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_tutor_requests_updated_at
  BEFORE UPDATE ON public.tutor_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_tutoring_offers_updated_at
  BEFORE UPDATE ON public.tutoring_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_resources_updated_at
  BEFORE UPDATE ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
