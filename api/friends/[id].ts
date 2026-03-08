import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser } from '../../lib/auth';
import { createSupabaseClient } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const { id } = req.query;

    if (req.method === 'PATCH') return handlePatch(req, res, user.id, id as string);
    if (req.method === 'DELETE') return handleDelete(req, res, user.id, id as string);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function handlePatch(req: VercelRequest, res: VercelResponse, userId: string, friendshipId: string) {
    const { status } = req.body;
    if (!['accepted', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Status must be accepted or rejected' });
    }

    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        const { data: friendship } = await supabase
            .from('friendships')
            .select('*')
            .eq('id', friendshipId)
            .single();

        if (!friendship) return res.status(404).json({ error: 'Solicitud no encontrada' });
        if (friendship.addressee_id !== userId) {
            return res.status(403).json({ error: 'Solo el destinatario puede responder' });
        }

        const { data, error } = await supabase
            .from('friendships')
            .update({ status })
            .eq('id', friendshipId)
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ friendship: data });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handleDelete(req: VercelRequest, res: VercelResponse, userId: string, friendshipId: string) {
    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        const { data: friendship } = await supabase
            .from('friendships')
            .select('*')
            .eq('id', friendshipId)
            .single();

        if (!friendship) return res.status(404).json({ error: 'Amistad no encontrada' });
        if (friendship.requester_id !== userId && friendship.addressee_id !== userId) {
            return res.status(403).json({ error: 'No tienes permisos' });
        }

        const { error } = await supabase
            .from('friendships')
            .delete()
            .eq('id', friendshipId);

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ message: 'Amistad eliminada' });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
