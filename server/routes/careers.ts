import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createSupabaseClient } from '../lib/supabase';

// GET /careers
export async function listCareers(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase.from('careers').select('*').order('name');
        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ careers: data });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}
