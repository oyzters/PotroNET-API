-- Cascade audit fixes: convert NO ACTION foreign keys to SET NULL.
-- Rationale: these are nullable references where deleting the referenced row
-- should not block the parent row from being deleted (e.g., deleting a career
-- shouldn't block deleting anything; deleting an admin shouldn't block
-- historical records). Content stays, reference just nulls out.

-- profiles.career_id → careers(id)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_career_id_fkey;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_career_id_fkey
    FOREIGN KEY (career_id) REFERENCES public.careers(id) ON DELETE SET NULL;

-- professors.career_id → careers(id)
ALTER TABLE public.professors DROP CONSTRAINT IF EXISTS professors_career_id_fkey;
ALTER TABLE public.professors
    ADD CONSTRAINT professors_career_id_fkey
    FOREIGN KEY (career_id) REFERENCES public.careers(id) ON DELETE SET NULL;

-- professor_requests.career_id → careers(id)
ALTER TABLE public.professor_requests DROP CONSTRAINT IF EXISTS professor_requests_career_id_fkey;
ALTER TABLE public.professor_requests
    ADD CONSTRAINT professor_requests_career_id_fkey
    FOREIGN KEY (career_id) REFERENCES public.careers(id) ON DELETE SET NULL;

-- professor_requests.reviewed_by → profiles(id)
ALTER TABLE public.professor_requests DROP CONSTRAINT IF EXISTS professor_requests_reviewed_by_fkey;
ALTER TABLE public.professor_requests
    ADD CONSTRAINT professor_requests_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- polls.career_id → careers(id)
ALTER TABLE public.polls DROP CONSTRAINT IF EXISTS polls_career_id_fkey;
ALTER TABLE public.polls
    ADD CONSTRAINT polls_career_id_fkey
    FOREIGN KEY (career_id) REFERENCES public.careers(id) ON DELETE SET NULL;

-- reports.reviewed_by → profiles(id)
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reviewed_by_fkey;
ALTER TABLE public.reports
    ADD CONSTRAINT reports_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- resources.career_id → careers(id)
ALTER TABLE public.resources DROP CONSTRAINT IF EXISTS resources_career_id_fkey;
ALTER TABLE public.resources
    ADD CONSTRAINT resources_career_id_fkey
    FOREIGN KEY (career_id) REFERENCES public.careers(id) ON DELETE SET NULL;

-- tutor_requests.reviewed_by → profiles(id)
ALTER TABLE public.tutor_requests DROP CONSTRAINT IF EXISTS tutor_requests_reviewed_by_fkey;
ALTER TABLE public.tutor_requests
    ADD CONSTRAINT tutor_requests_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
