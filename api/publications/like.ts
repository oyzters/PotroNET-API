import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser } from '../../lib/auth';
import { createSupabaseClient } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const user = await getAuthUser(req);
    if (!user) {
        return res.status(401).json({ error: 'No autenticado' });
    }

    const { publication_id } = req.body;
    if (!publication_id) {
        return res.status(400).json({ error: 'publication_id is required' });
    }

    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        // Check if already liked
        const { data: existing } = await supabase
            .from('publication_likes')
            .select('*')
            .eq('user_id', user.id)
            .eq('publication_id', publication_id)
            .single();

        if (existing) {
            // Unlike
            await supabase
                .from('publication_likes')
                .delete()
                .eq('user_id', user.id)
                .eq('publication_id', publication_id);

            return res.status(200).json({ liked: false });
        } else {
            // Like
            await supabase
                .from('publication_likes')
                .insert({ user_id: user.id, publication_id });

            return res.status(200).json({ liked: true });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
