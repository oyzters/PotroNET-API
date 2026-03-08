import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { createSupabaseClient } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const search = req.query.search as string;

        let query = supabase
            .from('profiles')
            .select(`
        id, full_name, avatar_url, email, bio, semester, reputation, role,
        career:careers(id, name)
      `)
            .eq('is_banned', false)
            .order('full_name');

        if (search) {
            query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
        }

        const { data, error } = await query.limit(50);

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json({ profiles: data });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
