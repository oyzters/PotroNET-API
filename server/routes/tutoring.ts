import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../lib/auth';
import { createSupabaseClient } from '../lib/supabase';

// GET|POST /tutoring
export async function tutoringIndex(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') return tutoringGet(req, res);
    if (req.method === 'POST') return tutoringPost(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function tutoringGet(req: VercelRequest, res: VercelResponse) {
    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const subject = req.query.subject as string;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        let query = supabase.from('tutoring_offers')
            .select(`*, tutor:profiles!tutoring_offers_tutor_id_fkey(id, full_name, avatar_url, email, reputation, career:careers(id, name))`, { count: 'exact' })
            .eq('is_active', true).order('created_at', { ascending: false }).range(offset, offset + limit - 1);

        if (subject) query = query.ilike('subject_name', `%${subject}%`);

        const { data, error, count } = await query;
        if (error) return res.status(400).json({ error: error.message });

        return res.status(200).json({
            offers: data,
            pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
        });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

async function tutoringPost(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const { subject_name, description, schedule, max_students } = req.body;
    if (!subject_name) return res.status(400).json({ error: 'subject_name is required' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase.from('tutoring_offers')
            .insert({ tutor_id: user.id, subject_name, description: description || '', schedule: schedule || '', max_students: max_students || 5 })
            .select(`*, tutor:profiles!tutoring_offers_tutor_id_fkey(id, full_name, avatar_url, email)`).single();
        if (error) return res.status(400).json({ error: error.message });
        return res.status(201).json({ offer: data });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

// GET|POST /tutoring/requests
export async function tutoringRequests(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    if (req.method === 'GET') {
        try {
            const supabase = createSupabaseClient(req.headers.authorization);
            const { data, error } = await supabase.from('tutor_requests').select('*')
                .eq('user_id', user.id).order('created_at', { ascending: false });
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ requests: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'POST') {
        const { subject_name, description } = req.body;
        if (!subject_name) return res.status(400).json({ error: 'subject_name is required' });

        try {
            const supabase = createSupabaseClient(req.headers.authorization);
            const { data, error } = await supabase.from('tutor_requests')
                .insert({ user_id: user.id, subject_name, description: description || '' }).select().single();
            if (error) return res.status(400).json({ error: error.message });
            return res.status(201).json({ request: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
