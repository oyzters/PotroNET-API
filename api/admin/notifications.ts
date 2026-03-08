import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser } from '../../lib/auth';
import { supabaseAdmin } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (user.role !== 'sudo') return res.status(403).json({ error: 'Acceso denegado. Solo sudo puede enviar notificaciones globales.' });

    if (req.method === 'POST') return handlePost(req, res);
    if (req.method === 'GET') return handleGet(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(_req: VercelRequest, res: VercelResponse) {
    // Return recent global notifications (sent by admin) 
    const { data, error } = await supabaseAdmin
        .from('notifications')
        .select('id, content, type, created_at')
        .eq('type', 'system')
        .order('created_at', { ascending: false })
        .limit(30);

    if (error) return res.status(400).json({ error: error.message });
    // Deduplicate by content+created_at to show 1 per broadcast
    const seen = new Set<string>();
    const unique = (data || []).filter(n => {
        const key = `${n.content}-${n.created_at.substring(0, 16)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return res.status(200).json({ notifications: unique });
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
    const { message, target_type, career_id, user_id } = req.body;

    if (!message?.trim()) return res.status(400).json({ error: 'El mensaje es requerido' });
    if (!['global', 'career', 'user'].includes(target_type)) {
        return res.status(400).json({ error: 'target_type debe ser global, career o user' });
    }

    try {
        let userIds: string[] = [];

        if (target_type === 'user') {
            if (!user_id) return res.status(400).json({ error: 'user_id es requerido para target_type=user' });
            userIds = [user_id];
        } else if (target_type === 'career') {
            if (!career_id) return res.status(400).json({ error: 'career_id es requerido para target_type=career' });
            const { data } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('career_id', career_id)
                .eq('is_banned', false);
            userIds = (data || []).map(p => p.id);
        } else {
            // global
            const { data } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('is_banned', false);
            userIds = (data || []).map(p => p.id);
        }

        if (userIds.length === 0) {
            return res.status(200).json({ sent: 0, message: 'No hay usuarios en ese destino' });
        }

        // Batch insert notifications
        const notifications = userIds.map(uid => ({
            user_id: uid,
            type: 'system',
            title: message.trim(),
            body: '',
            content: message.trim(),
            is_read: false,
        }));

        // Insert in chunks of 500 to avoid request limits
        const CHUNK = 500;
        for (let i = 0; i < notifications.length; i += CHUNK) {
            await supabaseAdmin.from('notifications').insert(notifications.slice(i, i + CHUNK));
        }

        return res.status(201).json({ sent: userIds.length });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
