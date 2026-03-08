import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser } from '../../lib/auth';
import { createSupabaseClient } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = (page - 1) * limit;

        const { data, error, count } = await supabase
            .from('messages')
            .select('*', { count: 'exact' })
            .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) return res.status(400).json({ error: error.message });

        // Mark received messages as read
        await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('sender_id', userId as string)
            .eq('receiver_id', user.id)
            .eq('is_read', false);

        return res.status(200).json({
            messages: (data || []).reverse(),
            pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
        });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
