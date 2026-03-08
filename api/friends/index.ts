import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser } from '../../lib/auth';
import { createSupabaseClient, supabaseAdmin } from '../../lib/supabase';

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
        const type = req.query.type as string || 'accepted';

        if (type === 'pending') {
            const { data, error } = await supabase
                .from('friendships')
                .select(`
                    *,
                    requester:profiles!friendships_requester_id_fkey(id, full_name, avatar_url, email)
                `)
                .eq('addressee_id', userId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ requests: data });
        }

        if (type === 'sent') {
            const { data, error } = await supabase
                .from('friendships')
                .select(`
                    *,
                    addressee:profiles!friendships_addressee_id_fkey(id, full_name, avatar_url, email)
                `)
                .eq('requester_id', userId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ requests: data });
        }

        // Accepted friends
        const { data: asRequester } = await supabase
            .from('friendships')
            .select(`
                id,
                friend:profiles!friendships_addressee_id_fkey(id, full_name, avatar_url, email, bio, career:careers(id, name))
            `)
            .eq('requester_id', userId)
            .eq('status', 'accepted');

        const { data: asAddressee } = await supabase
            .from('friendships')
            .select(`
                id,
                friend:profiles!friendships_requester_id_fkey(id, full_name, avatar_url, email, bio, career:careers(id, name))
            `)
            .eq('addressee_id', userId)
            .eq('status', 'accepted');

        const friends = [
            ...(asRequester || []).map(f => ({ friendshipId: f.id, ...f.friend })),
            ...(asAddressee || []).map(f => ({ friendshipId: f.id, ...f.friend })),
        ];

        return res.status(200).json({ friends });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handlePost(req: VercelRequest, res: VercelResponse, userId: string) {
    // Accept both addressee_id and receiver_id (used by ProfilePage follow button)
    const addressee_id = req.body.addressee_id || req.body.receiver_id;
    if (!addressee_id) return res.status(400).json({ error: 'addressee_id is required' });
    if (addressee_id === userId) return res.status(400).json({ error: 'No puedes enviarte solicitud a ti mismo' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        // Check if friendship already exists
        const { data: existing } = await supabase
            .from('friendships')
            .select('*')
            .or(`and(requester_id.eq.${userId},addressee_id.eq.${addressee_id}),and(requester_id.eq.${addressee_id},addressee_id.eq.${userId})`)
            .limit(1);

        if (existing && existing.length > 0) {
            return res.status(400).json({ error: 'Ya existe una solicitud o amistad con este usuario' });
        }

        const { data, error } = await supabase
            .from('friendships')
            .insert({ requester_id: userId, addressee_id })
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });

        // Notify the receiver about the friend request
        const { data: sender } = await supabaseAdmin
            .from('profiles')
            .select('full_name')
            .eq('id', userId)
            .single();
        await supabaseAdmin.from('notifications').insert({
            user_id: addressee_id,
            type: 'friend_request',
            title: `${sender?.full_name || 'Alguien'} te envió una solicitud de amistad`,
            body: 'Revisa tus solicitudes de amistad',
            content: `${sender?.full_name || 'Alguien'} te envió una solicitud de amistad`,
            reference_id: data.id,
            is_read: false,
        });

        return res.status(201).json({ friendship: data });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
