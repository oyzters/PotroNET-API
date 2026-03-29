import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../lib/auth';
import { createSupabaseClient, supabaseAdmin, getSupabaseAdmin } from '../lib/supabase';

// GET|POST /follows
export async function followsIndex(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    if (req.method === 'GET') return followsGet(req, res, user.id);
    if (req.method === 'POST') return followsPost(req, res, user.id);
    return res.status(405).json({ error: 'Method not allowed' });
}

// GET /follows/status/:userId
export async function followStatus(req: VercelRequest, res: VercelResponse, targetId: string) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const admin = getSupabaseAdmin();

        const [{ data: iFollow }, { data: followsMe }] = await Promise.all([
            admin.from('follows').select('id').eq('follower_id', user.id).eq('following_id', targetId).maybeSingle(),
            admin.from('follows').select('id').eq('follower_id', targetId).eq('following_id', user.id).maybeSingle(),
        ]);

        let status: 'none' | 'following' | 'follows_you' | 'friends' = 'none';
        if (iFollow && followsMe) status = 'friends';
        else if (iFollow) status = 'following';
        else if (followsMe) status = 'follows_you';

        return res.status(200).json({ status });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

// DELETE /follows/:userId
export async function followById(req: VercelRequest, res: VercelResponse, targetId: string) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    if (req.method === 'DELETE') return followDelete(req, res, user.id, targetId);
    return res.status(405).json({ error: 'Method not allowed' });
}

// --- Private handlers ---

async function followsGet(req: VercelRequest, res: VercelResponse, userId: string) {
    try {
        const admin = getSupabaseAdmin();
        const type = (req.query.type as string) || 'friends';
        const targetUserId = (req.query.user_id as string) || userId;
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
        const offset = (page - 1) * limit;

        // Helper: fetch profile details for a list of user IDs
        async function getProfiles(ids: string[]) {
            if (ids.length === 0) return [];
            const { data } = await admin
                .from('profiles')
                .select('id, full_name, avatar_url, email, bio, career:careers(id, name)')
                .in('id', ids);
            return data || [];
        }

        if (type === 'followers') {
            const { data, error, count } = await admin
                .from('follows')
                .select('follower_id', { count: 'exact' })
                .eq('following_id', targetUserId)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            if (error) return res.status(400).json({ error: error.message });
            const users = await getProfiles((data || []).map(f => f.follower_id));
            return res.status(200).json({ users, pagination: { page, totalPages: Math.ceil((count || 0) / limit), total: count || 0 } });
        }

        if (type === 'following') {
            const { data, error, count } = await admin
                .from('follows')
                .select('following_id', { count: 'exact' })
                .eq('follower_id', targetUserId)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            if (error) return res.status(400).json({ error: error.message });
            const users = await getProfiles((data || []).map(f => f.following_id));
            return res.status(200).json({ users, pagination: { page, totalPages: Math.ceil((count || 0) / limit), total: count || 0 } });
        }

        // type === 'friends' — mutual follows
        const { data: iFollow } = await admin
            .from('follows')
            .select('following_id')
            .eq('follower_id', targetUserId);
        const followingIds = (iFollow || []).map(f => f.following_id);

        if (followingIds.length === 0) {
            return res.status(200).json({ users: [], pagination: { page: 1, totalPages: 0, total: 0 } });
        }

        // Who among those also follows targetUserId back?
        const { data: mutual, count } = await admin
            .from('follows')
            .select('follower_id', { count: 'exact' })
            .eq('following_id', targetUserId)
            .in('follower_id', followingIds)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        const users = await getProfiles((mutual || []).map(f => f.follower_id));
        return res.status(200).json({ users, pagination: { page, totalPages: Math.ceil((count || 0) / limit), total: count || 0 } });

    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

async function followsPost(req: VercelRequest, res: VercelResponse, userId: string) {
    const following_id = req.body.following_id;
    if (!following_id) return res.status(400).json({ error: 'following_id is required' });
    if (following_id === userId) return res.status(400).json({ error: 'No puedes seguirte a ti mismo' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        // Check if already following
        const { data: existing } = await supabase
            .from('follows').select('id')
            .eq('follower_id', userId).eq('following_id', following_id)
            .maybeSingle();
        if (existing) return res.status(400).json({ error: 'Ya sigues a este usuario' });

        const { data, error } = await supabase
            .from('follows').insert({ follower_id: userId, following_id }).select().single();
        if (error) return res.status(400).json({ error: error.message });

        // Check if now mutual (friends)
        const { data: reverse } = await supabase
            .from('follows').select('id')
            .eq('follower_id', following_id).eq('following_id', userId)
            .maybeSingle();

        const isFriends = !!reverse;

        // Send notification
        const { data: sender } = await supabaseAdmin.from('profiles').select('full_name').eq('id', userId).single();
        await supabaseAdmin.from('notifications').insert({
            user_id: following_id,
            type: 'follow',
            title: `${sender?.full_name || 'Alguien'} te empezó a seguir`,
            body: isFriends ? 'Ahora son amigos' : 'Visita su perfil',
            content: `${sender?.full_name || 'Alguien'} te empezó a seguir`,
            reference_id: data.id,
            is_read: false,
        });

        // Update is_message_request for existing messages if they just became friends
        if (isFriends) {
            await supabaseAdmin
                .from('messages')
                .update({ is_message_request: false })
                .or(`and(sender_id.eq.${userId},receiver_id.eq.${following_id}),and(sender_id.eq.${following_id},receiver_id.eq.${userId})`)
                .eq('is_message_request', true);
        }

        return res.status(201).json({ follow: data, is_friends: isFriends });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

async function followDelete(req: VercelRequest, res: VercelResponse, userId: string, targetId: string) {
    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        const { error } = await supabase
            .from('follows').delete()
            .eq('follower_id', userId).eq('following_id', targetId);
        if (error) return res.status(400).json({ error: error.message });

        return res.status(200).json({ message: 'Dejaste de seguir al usuario' });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}
