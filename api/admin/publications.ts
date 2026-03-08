import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser, requireAdmin } from '../../lib/auth';
import { supabaseAdmin } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    const user = await getAuthUser(req);
    if (!requireAdmin(user)) {
        return res.status(403).json({ error: 'Se requieren permisos de administrador' });
    }

    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'DELETE') return handleDelete(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        const { data, error, count } = await supabaseAdmin
            .from('publications')
            .select(`
        *,
        author:profiles!publications_user_id_fkey(id, full_name, avatar_url, email)
      `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json({
            publications: data,
            pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
        });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
    const { publication_id } = req.body;

    if (!publication_id) {
        return res.status(400).json({ error: 'publication_id is required' });
    }

    try {
        const { error } = await supabaseAdmin
            .from('publications')
            .delete()
            .eq('id', publication_id);

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json({ message: 'Publicación eliminada' });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
