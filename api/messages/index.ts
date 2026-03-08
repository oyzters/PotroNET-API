import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser } from '../../lib/auth';
import { createSupabaseClient } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    if (req.method === 'GET') return handleGet(req, res, user.id);
    if (req.method === 'POST') return handlePost(req, res, user.id);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse, userId: string) {
    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        // Get all conversations (distinct users messaged)
        const { data: sent } = await supabase
            .from('messages')
            .select('receiver_id')
            .eq('sender_id', userId);

        const { data: received } = await supabase
            .from('messages')
            .select('sender_id')
            .eq('receiver_id', userId);

        const contactIds = new Set<string>();
        sent?.forEach(m => contactIds.add(m.receiver_id));
        received?.forEach(m => contactIds.add(m.sender_id));

        if (contactIds.size === 0) {
            return res.status(200).json({ conversations: [] });
        }

        // Get profiles of contacts
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, email')
            .in('id', Array.from(contactIds));

        // Get last message and unread count for each contact
        const conversations = await Promise.all(
            (profiles || []).map(async (profile) => {
                const { data: lastMsg } = await supabase
                    .from('messages')
                    .select('content, created_at, sender_id')
                    .or(`and(sender_id.eq.${userId},receiver_id.eq.${profile.id}),and(sender_id.eq.${profile.id},receiver_id.eq.${userId})`)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                const { count: unread } = await supabase
                    .from('messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('sender_id', profile.id)
                    .eq('receiver_id', userId)
                    .eq('is_read', false);

                return {
                    user: profile,
                    lastMessage: lastMsg,
                    unread: unread || 0,
                };
            })
        );

        conversations.sort((a, b) => {
            const aTime = a.lastMessage?.created_at || '';
            const bTime = b.lastMessage?.created_at || '';
            return bTime.localeCompare(aTime);
        });

        return res.status(200).json({ conversations });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handlePost(req: VercelRequest, res: VercelResponse, userId: string) {
    const { receiver_id, content } = req.body;

    if (!receiver_id || !content?.trim()) {
        return res.status(400).json({ error: 'receiver_id and content are required' });
    }

    if (content.length > 1000) {
        return res.status(400).json({ error: 'El mensaje no puede exceder 1000 caracteres' });
    }

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase
            .from('messages')
            .insert({
                sender_id: userId,
                receiver_id,
                content: content.trim(),
            })
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });
        return res.status(201).json({ message: data });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
