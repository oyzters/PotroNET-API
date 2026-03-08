import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser } from '../../lib/auth';
import { supabaseAdmin } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const user = await getAuthUser(req);
    if (!user) {
        return res.status(401).json({ error: 'No autenticado' });
    }

    try {
        const { data: profile, error } = await supabaseAdmin
            .from('profiles')
            .select(`
        *,
        career:careers(id, name)
      `)
            .eq('id', user.id)
            .single();

        if (error) {
            return res.status(404).json({ error: 'Perfil no encontrado' });
        }

        return res.status(200).json({ user: profile });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
