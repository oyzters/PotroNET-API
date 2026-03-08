import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser } from '../../lib/auth';
import { createSupabaseClient } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'PATCH') return handlePatch(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
    const user_id = req.query.user_id as string;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase
            .from('user_subjects')
            .select(`
                *,
                subject:career_subjects(id, name, semester, credits, career_id)
            `)
            .eq('user_id', user_id);

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ user_subjects: data });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const { subject_id, status } = req.body;
    if (!subject_id || !status) return res.status(400).json({ error: 'subject_id and status are required' });

    const validStatuses = ['NO_CURSADA', 'CURSANDO', 'APROBADA', 'REPROBADA'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        if (status === 'NO_CURSADA') {
            // Delete the record
            await supabase
                .from('user_subjects')
                .delete()
                .eq('user_id', user.id)
                .eq('subject_id', subject_id);

            return res.status(200).json({ message: 'Materia restablecida' });
        }

        const { data, error } = await supabase
            .from('user_subjects')
            .upsert({
                user_id: user.id,
                subject_id,
                status,
            }, { onConflict: 'user_id,subject_id' })
            .select(`
                *,
                subject:career_subjects(id, name, semester, credits)
            `)
            .single();

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ user_subject: data });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
