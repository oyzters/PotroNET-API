import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createSupabaseClient } from '../lib/supabase';

// GET /search
export async function searchAll(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const q = (req.query.q as string || '').trim();
    if (!q || q.length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const searchPattern = `%${q}%`;

        const [usersRes, professorsRes, resourcesRes, tutoringRes] = await Promise.all([
            supabase.from('profiles').select('id, full_name, avatar_url, email, career:careers(id, name)')
                .eq('is_banned', false).or(`full_name.ilike.${searchPattern},email.ilike.${searchPattern}`).limit(10),
            supabase.from('professors').select('id, full_name, department, avg_rating, total_reviews, career:careers(id, name)')
                .eq('is_approved', true).ilike('full_name', searchPattern).limit(10),
            supabase.from('resources').select('id, title, resource_type, subject_name, career:careers(id, name)')
                .or(`title.ilike.${searchPattern},subject_name.ilike.${searchPattern}`).limit(10),
            supabase.from('tutoring_offers').select('id, subject_name, description, tutor:profiles!tutoring_offers_tutor_id_fkey(id, full_name)')
                .eq('is_active', true).ilike('subject_name', searchPattern).limit(10),
        ]);

        return res.status(200).json({
            users: usersRes.data || [], professors: professorsRes.data || [],
            resources: resourcesRes.data || [], tutoring: tutoringRes.data || [],
        });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}
