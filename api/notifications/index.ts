import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser } from '../../lib/auth';
import { createSupabaseClient } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    if (req.method === 'GET') return handleGet(req, res, user.id);
    if (req.method === 'PATCH') return handlePatch(req, res, user.id);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse, userId: string) {
    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        const { data, error, count } = await supabase
            .from('notifications')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) return res.status(400).json({ error: error.message });

        // Count unread
        const { count: unreadCount } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        return res.status(200).json({
            notifications: data,
            unread: unreadCount || 0,
            pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
        });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handlePatch(req: VercelRequest, res: VercelResponse, userId: string) {
    const { notification_id, mark_all_read } = req.body;

    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        if (mark_all_read) {
            await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', userId)
                .eq('is_read', false);

            return res.status(200).json({ message: 'Todas las notificaciones marcadas como leídas' });
        }

        if (!notification_id) return res.status(400).json({ error: 'notification_id is required' });

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notification_id)
            .eq('user_id', userId);

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ message: 'Notificación marcada como leída' });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
