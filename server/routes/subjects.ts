import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../lib/auth.js';
import { createSupabaseClient } from '../lib/supabase.js';

// GET /subjects
export async function subjectsIndex(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const career_id = req.query.career_id as string;
    if (!career_id) return res.status(400).json({ error: 'career_id is required' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase.from('career_subjects').select('*')
            .eq('career_id', career_id).order('semester').order('name');
        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ subjects: data });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

// GET|PATCH /subjects/user
export async function subjectsUser(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') {
        const user_id = req.query.user_id as string;
        if (!user_id) return res.status(400).json({ error: 'user_id is required' });

        try {
            const supabase = createSupabaseClient(req.headers.authorization);
            const { data, error } = await supabase.from('user_subjects')
                .select(`*, subject:career_subjects(id, name, semester, credits, career_id)`).eq('user_id', user_id);
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ user_subjects: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'PATCH') {
        const user = await getAuthUser(req);
        if (!user) return res.status(401).json({ error: 'No autenticado' });

        const { subject_id, status } = req.body;
        if (!subject_id || !status) return res.status(400).json({ error: 'subject_id and status are required' });

        const validStatuses = ['NO_CURSADA', 'CURSANDO', 'APROBADA', 'REPROBADA'];
        if (!validStatuses.includes(status))
            return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });

        try {
            const supabase = createSupabaseClient(req.headers.authorization);

            if (status === 'NO_CURSADA') {
                await supabase.from('user_subjects').delete().eq('user_id', user.id).eq('subject_id', subject_id);
                return res.status(200).json({ message: 'Materia restablecida' });
            }

            const { data, error } = await supabase.from('user_subjects')
                .upsert({ user_id: user.id, subject_id, status }, { onConflict: 'user_id,subject_id' })
                .select(`*, subject:career_subjects(id, name, semester, credits)`).single();
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ user_subject: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
