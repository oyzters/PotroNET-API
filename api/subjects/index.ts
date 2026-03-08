import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { createSupabaseClient } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const career_id = req.query.career_id as string;
    if (!career_id) return res.status(400).json({ error: 'career_id is required' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase
            .from('career_subjects')
            .select('*')
            .eq('career_id', career_id)
            .order('semester')
            .order('name');

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ subjects: data });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
