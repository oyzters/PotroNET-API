-- ============================================
-- PotroNET MVP - Initial Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. CAREERS TABLE
-- ============================================
CREATE TABLE public.careers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed all 37 ITSON careers
INSERT INTO public.careers (name) VALUES
  ('Licenciatura en Administración'),
  ('Licenciatura en Administración de Empresas Turísticas'),
  ('Licenciatura en Administración Estratégica'),
  ('Licenciatura en Arquitectura'),
  ('Licenciatura en Ciencias de la Educación'),
  ('Licenciatura en Ciencias del Ejercicio Físico'),
  ('Licenciatura en Comunicación y Gestión de Medios Digitales'),
  ('Licenciatura en Contaduría Pública'),
  ('Licenciatura en Contaduría Pública Modalidad Mixta'),
  ('Licenciatura en Dirección de la Cultura Física y el Deporte'),
  ('Licenciatura en Diseño Gráfico'),
  ('Licenciatura en Derecho'),
  ('Licenciatura en Economía y Finanzas'),
  ('Licenciatura en Educación Artística y Gestión Cultural'),
  ('Licenciatura en Educación Infantil'),
  ('Licenciatura en Educación Inicial y Gestión de Instituciones'),
  ('Licenciatura en Emprendimiento e Innovación'),
  ('Licenciatura en Enfermería'),
  ('Licenciatura en Gastronomía'),
  ('Licenciatura en Mercadotecnia'),
  ('Licenciatura en Nutrición'),
  ('Licenciatura en Psicología'),
  ('Licenciatura en Tecnología de Alimentos'),
  ('Ingeniería en Biosistemas'),
  ('Ingeniería en Biotecnología'),
  ('Ingeniería en Ciencias Ambientales'),
  ('Ingeniería Civil'),
  ('Ingeniería Electromecánica'),
  ('Ingeniería en Electrónica'),
  ('Ingeniería Industrial y de Sistemas'),
  ('Ingeniería en Logística'),
  ('Ingeniería en Manufactura'),
  ('Ingeniería en Mecatrónica'),
  ('Ingeniería Química'),
  ('Ingeniería en Software'),
  ('Medicina Veterinaria y Zootecnia'),
  ('Profesional Asociado en Desarrollo Infantil');

-- ============================================
-- 2. PROFILES TABLE (extends auth.users)
-- ============================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  career_id UUID REFERENCES public.careers(id),
  semester INTEGER DEFAULT 1 CHECK (semester >= 1 AND semester <= 12),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'sudo')),
  reputation INTEGER DEFAULT 0,
  is_banned BOOLEAN DEFAULT FALSE,
  interests TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 3. PUBLICATIONS TABLE
-- ============================================
CREATE TABLE public.publications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  tags TEXT[] DEFAULT '{}',
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. PUBLICATION LIKES TABLE
-- ============================================
CREATE TABLE public.publication_likes (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  publication_id UUID REFERENCES public.publications(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, publication_id)
);

-- Function to update likes_count
CREATE OR REPLACE FUNCTION public.update_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.publications SET likes_count = likes_count + 1 WHERE id = NEW.publication_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.publications SET likes_count = likes_count - 1 WHERE id = OLD.publication_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_like_change
  AFTER INSERT OR DELETE ON public.publication_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_likes_count();

-- ============================================
-- 5. FRIENDSHIPS TABLE
-- ============================================
CREATE TABLE public.friendships (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  requester_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  addressee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id)
);

-- ============================================
-- 6. ROW LEVEL SECURITY POLICIES
-- ============================================

-- Profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Publications RLS
ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Publications are viewable by everyone"
  ON public.publications FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create publications"
  ON public.publications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own publications"
  ON public.publications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own publications"
  ON public.publications FOR DELETE
  USING (auth.uid() = user_id);

-- Publication Likes RLS
ALTER TABLE public.publication_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes are viewable by everyone"
  ON public.publication_likes FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can like"
  ON public.publication_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own likes"
  ON public.publication_likes FOR DELETE
  USING (auth.uid() = user_id);

-- Friendships RLS
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own friendships"
  ON public.friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Users can send friend requests"
  ON public.friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Addressee can update friendship status"
  ON public.friendships FOR UPDATE
  USING (auth.uid() = addressee_id);

-- Careers RLS
ALTER TABLE public.careers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Careers are viewable by everyone"
  ON public.careers FOR SELECT
  USING (true);

-- ============================================
-- 7. INDEXES
-- ============================================
CREATE INDEX idx_publications_user_id ON public.publications(user_id);
CREATE INDEX idx_publications_created_at ON public.publications(created_at DESC);
CREATE INDEX idx_publications_tags ON public.publications USING GIN(tags);
CREATE INDEX idx_profiles_career_id ON public.profiles(career_id);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_friendships_requester ON public.friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON public.friendships(addressee_id);

-- ============================================
-- 8. UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_publications_updated_at
  BEFORE UPDATE ON public.publications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_friendships_updated_at
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
