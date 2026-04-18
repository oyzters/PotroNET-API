import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../lib/auth';
import { createSupabaseClient, supabaseAdmin } from '../lib/supabase';
import { sendEmail } from '../lib/email';
import { firstMessageTemplate, firstMessageOfDayTemplate } from '../lib/email-templates';
import { sendPush } from '../lib/push';

// GET|POST /messages
export async function messagesIndex(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    if (req.method === 'GET') return messagesGet(req, res, user.id);
    if (req.method === 'POST') return messagesPost(req, res, user.id);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function messagesGet(req: VercelRequest, res: VercelResponse, userId: string) {
    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        const { data: sent } = await supabase.from('messages').select('receiver_id').eq('sender_id', userId);
        const { data: received } = await supabase.from('messages').select('sender_id').eq('receiver_id', userId);

        const contactIds = new Set<string>();
        sent?.forEach(m => contactIds.add(m.receiver_id));
        received?.forEach(m => contactIds.add(m.sender_id));

        if (contactIds.size === 0) return res.status(200).json({ conversations: [] });

        const { data: profiles } = await supabase
            .from('profiles').select('id, full_name, avatar_url, email').in('id', Array.from(contactIds));

        // Check mutual follows for all contacts at once
        const contactArray = Array.from(contactIds);
        const { data: userFollows } = await supabase
            .from('follows').select('following_id').eq('follower_id', userId).in('following_id', contactArray);
        const { data: followsUser } = await supabase
            .from('follows').select('follower_id').eq('following_id', userId).in('follower_id', contactArray);
        const iFollowSet = new Set((userFollows || []).map(f => f.following_id));
        const followsMeSet = new Set((followsUser || []).map(f => f.follower_id));

        const conversations = await Promise.all(
            (profiles || []).map(async (profile) => {
                const { data: lastMsg } = await supabase
                    .from('messages').select('content, created_at, sender_id')
                    .or(`and(sender_id.eq.${userId},receiver_id.eq.${profile.id}),and(sender_id.eq.${profile.id},receiver_id.eq.${userId})`)
                    .order('created_at', { ascending: false }).limit(1).single();

                const { count: unread } = await supabase
                    .from('messages').select('*', { count: 'exact', head: true })
                    .eq('sender_id', profile.id).eq('receiver_id', userId).eq('is_read', false);

                const isMutual = iFollowSet.has(profile.id) && followsMeSet.has(profile.id);

                return { user: profile, lastMessage: lastMsg, unread: unread || 0, is_request: !isMutual };
            })
        );

        conversations.sort((a, b) => {
            const aTime = a.lastMessage?.created_at || '';
            const bTime = b.lastMessage?.created_at || '';
            return bTime.localeCompare(aTime);
        });

        return res.status(200).json({ conversations });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

async function messagesPost(req: VercelRequest, res: VercelResponse, userId: string) {
    const { receiver_id, content, reply_to } = req.body;
    if (!receiver_id || !content?.trim()) return res.status(400).json({ error: 'receiver_id and content are required' });
    if (content.length > 1000) return res.status(400).json({ error: 'El mensaje no puede exceder 1000 caracteres' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        // Check if they are mutual follows (friends)
        const { data: mutualCheck } = await supabaseAdmin
            .from('follows').select('id')
            .eq('follower_id', userId).eq('following_id', receiver_id)
            .maybeSingle();
        const { data: reverseCheck } = await supabaseAdmin
            .from('follows').select('id')
            .eq('follower_id', receiver_id).eq('following_id', userId)
            .maybeSingle();
        const isFriends = !!mutualCheck && !!reverseCheck;

        const insertData: any = {
            sender_id: userId, receiver_id, content: content.trim(),
            is_message_request: !isFriends,
        };
        if (reply_to) insertData.reply_to = reply_to;

        const { data, error } = await supabase
            .from('messages').insert(insertData).select().single();
        if (error) return res.status(400).json({ error: error.message });

        // Disparar emails en background (sin bloquear la respuesta)
        triggerMessageEmails(userId, receiver_id, content.trim()).catch(() => {});

        // Disparar push notification en background
        triggerMessagePush(userId, receiver_id, content.trim()).catch(() => {});

        return res.status(201).json({ message: data });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

async function triggerMessagePush(senderId: string, receiverId: string, content: string) {
    const { data: sender } = await supabaseAdmin.from('profiles').select('full_name').eq('id', senderId).single();
    const preview = content.length > 120 ? content.slice(0, 120) + '…' : content;
    await sendPush(receiverId, 'message', {
        title: sender?.full_name || 'Nuevo mensaje',
        body: preview,
        url: `/messages/${senderId}`,
        tag: `msg-${senderId}`,
    });
}

async function triggerMessageEmails(senderId: string, receiverId: string, content: string) {
    // Obtener datos del sender y receiver
    const [{ data: sender }, { data: receiver }] = await Promise.all([
        supabaseAdmin.from('profiles').select('full_name').eq('id', senderId).single(),
        supabaseAdmin.from('profiles').select('full_name, email').eq('id', receiverId).single(),
    ]);

    if (!receiver?.email || !sender?.full_name) return;

    const preview = content.length > 120 ? content.slice(0, 120) + '…' : content;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    // Contar mensajes previos entre estos dos usuarios (ever)
    const { count: totalPrev } = await supabaseAdmin
        .from('messages').select('*', { count: 'exact', head: true })
        .eq('sender_id', senderId).eq('receiver_id', receiverId);

    // Trigger 1: primer mensaje ever (count era 0 antes de este insert, ahora es 1)
    if (totalPrev === 1) {
        await sendEmail(
            receiver.email,
            `${sender.full_name} te envió su primer mensaje en PotroNET`,
            firstMessageTemplate(sender.full_name, preview)
        );
        return; // No enviar también el "primer del día" si ya enviamos el "primero ever"
    }

    // Contar mensajes de hoy entre estos dos usuarios
    const { count: todayCount } = await supabaseAdmin
        .from('messages').select('*', { count: 'exact', head: true })
        .eq('sender_id', senderId).eq('receiver_id', receiverId)
        .gte('created_at', todayStart.toISOString());

    // Trigger 3: primer mensaje del día (count es 1 = este es el primero de hoy)
    if (todayCount === 1) {
        await sendEmail(
            receiver.email,
            `${sender.full_name} te escribió hoy en PotroNET`,
            firstMessageOfDayTemplate(sender.full_name, preview)
        );
    }
}

// GET /messages/:userId
export async function messagesByUser(req: VercelRequest, res: VercelResponse, targetUserId: string) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = (page - 1) * limit;

        const { data, error, count } = await supabase
            .from('messages').select('*', { count: 'exact' })
            .or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${user.id})`)
            .order('created_at', { ascending: false }).range(offset, offset + limit - 1);

        if (error) return res.status(400).json({ error: error.message });

        await supabase.from('messages').update({ is_read: true })
            .eq('sender_id', targetUserId).eq('receiver_id', user.id).eq('is_read', false);

        return res.status(200).json({
            messages: (data || []).reverse(),
            pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
        });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}
