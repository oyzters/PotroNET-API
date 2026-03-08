import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../lib/cors';
import { createSupabaseClient } from '../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase
            .from('careers')
            .select('*')
            .order('name');

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json({ careers: data });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
