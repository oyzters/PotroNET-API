import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser } from '../../lib/auth';
import { createSupabaseClient } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    const { id } = req.query;

    if (req.method === 'GET') return handleGet(req, res, id as string);
    if (req.method === 'DELETE') return handleDelete(req, res, id as string);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse, id: string) {
    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase
            .from('publications')
            .select(`
        *,
        author:profiles!publications_user_id_fkey(id, full_name, avatar_url, email)
      `)
            .eq('id', id)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Publicación no encontrada' });
        }

        return res.status(200).json({ publication: data });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handleDelete(req: VercelRequest, res: VercelResponse, id: string) {
    const user = await getAuthUser(req);
    if (!user) {
        return res.status(401).json({ error: 'No autenticado' });
    }

    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        // Check if user owns the publication or is admin/sudo
        const { data: pub } = await supabase
            .from('publications')
            .select('user_id')
            .eq('id', id)
            .single();

        if (!pub) {
            return res.status(404).json({ error: 'Publicación no encontrada' });
        }

        if (pub.user_id !== user.id && user.role === 'user') {
            return res.status(403).json({ error: 'No tienes permisos para eliminar esta publicación' });
        }

        const { error } = await supabase
            .from('publications')
            .delete()
            .eq('id', id);

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json({ message: 'Publicación eliminada' });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
