import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser } from '../../lib/auth';
import { createSupabaseClient } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    if (req.method === 'GET') return handleGet(req, res, user.id);
    if (req.method === 'POST') return handlePost(req, res, user.id);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse, userId: string) {
    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase
            .from('tutor_requests')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ requests: data });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handlePost(req: VercelRequest, res: VercelResponse, userId: string) {
    const { subject_name, description } = req.body;
    if (!subject_name) return res.status(400).json({ error: 'subject_name is required' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase
            .from('tutor_requests')
            .insert({
                user_id: userId,
                subject_name,
                description: description || '',
            })
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });
        return res.status(201).json({ request: data });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
