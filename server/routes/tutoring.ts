import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../lib/auth';
import { createSupabaseClient, getSupabaseAdmin } from '../lib/supabase';
import { sendPush } from '../lib/push';

// GET|POST /tutoring
export async function tutoringIndex(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') return tutoringGet(req, res);
    if (req.method === 'POST') return tutoringPost(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function tutoringGet(req: VercelRequest, res: VercelResponse) {
    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const subject = req.query.subject as string;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        let query = supabase.from('tutoring_offers')
            .select(`*, tutor:profiles!tutoring_offers_tutor_id_fkey(id, full_name, avatar_url, email, reputation, career:careers(id, name))`, { count: 'exact' })
            .eq('is_active', true).order('created_at', { ascending: false }).range(offset, offset + limit - 1);

        if (subject) query = query.ilike('subject_name', `%${subject}%`);

        const { data, error, count } = await query;
        if (error) return res.status(400).json({ error: error.message });

        return res.status(200).json({
            offers: data,
            pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
        });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

async function tutoringPost(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const { subject_name, description, schedule, max_students } = req.body;
    if (!subject_name) return res.status(400).json({ error: 'subject_name is required' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase.from('tutoring_offers')
            .insert({ tutor_id: user.id, subject_name, description: description || '', schedule: schedule || '', max_students: max_students || 5 })
            .select(`*, tutor:profiles!tutoring_offers_tutor_id_fkey(id, full_name, avatar_url, email)`).single();
        if (error) return res.status(400).json({ error: error.message });
        return res.status(201).json({ offer: data });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

// GET|POST /tutoring/requests
export async function tutoringRequests(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    if (req.method === 'GET') {
        try {
            const supabase = createSupabaseClient(req.headers.authorization);
            const { data, error } = await supabase.from('tutor_requests').select('*')
                .eq('user_id', user.id).order('created_at', { ascending: false });
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ requests: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'POST') {
        const { subject_name, description } = req.body;
        if (!subject_name) return res.status(400).json({ error: 'subject_name is required' });

        try {
            const supabase = createSupabaseClient(req.headers.authorization);
            const { data, error } = await supabase.from('tutor_requests')
                .insert({ user_id: user.id, subject_name, description: description || '' }).select().single();
            if (error) return res.status(400).json({ error: error.message });
            return res.status(201).json({ request: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// GET|POST /tutoring/sessions
export async function tutoringSessions(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    if (req.method === 'GET') {
        try {
            const admin = getSupabaseAdmin();
            const { data, error } = await admin.from('tutoring_sessions')
                .select(`*, student:profiles!tutoring_sessions_student_id_fkey(id, full_name, avatar_url), tutor:profiles!tutoring_sessions_tutor_id_fkey(id, full_name, avatar_url), offer:tutoring_offers!tutoring_sessions_offer_id_fkey(id, subject_name)`)
                .or(`student_id.eq.${user.id},tutor_id.eq.${user.id}`)
                .order('session_date', { ascending: true });
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ sessions: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'POST') {
        const { offer_id, session_date, time_start, time_end, location, notes } = req.body;
        if (!offer_id || !session_date || !time_start || !time_end) {
            return res.status(400).json({ error: 'offer_id, session_date, time_start, time_end are required' });
        }

        try {
            const admin = getSupabaseAdmin();

            // Get tutor_id from the offer
            const { data: offer, error: offerErr } = await admin.from('tutoring_offers')
                .select('id, tutor_id, subject_name').eq('id', offer_id).single();
            if (offerErr || !offer) return res.status(404).json({ error: 'Oferta no encontrada' });

            if (offer.tutor_id === user.id) {
                return res.status(400).json({ error: 'No puedes solicitar tu propia tutoría' });
            }

            const { data, error } = await admin.from('tutoring_sessions')
                .insert({
                    offer_id, student_id: user.id, tutor_id: offer.tutor_id,
                    session_date, time_start, time_end,
                    location: location || '', notes: notes || '',
                })
                .select(`*, student:profiles!tutoring_sessions_student_id_fkey(id, full_name, avatar_url), tutor:profiles!tutoring_sessions_tutor_id_fkey(id, full_name, avatar_url), offer:tutoring_offers!tutoring_sessions_offer_id_fkey(id, subject_name)`)
                .single();
            if (error) return res.status(400).json({ error: error.message });

            // Notify tutor
            const { data: student } = await admin.from('profiles').select('full_name').eq('id', user.id).single();
            const tutTitle = `${student?.full_name || 'Un estudiante'} solicitó una sesión de ${offer.subject_name}`;
            const tutBody = `Fecha: ${session_date}, ${time_start}–${time_end}`;
            await admin.from('notifications').insert({
                user_id: offer.tutor_id,
                type: 'tutoring',
                title: tutTitle,
                body: tutBody,
            });
            sendPush(offer.tutor_id, 'tutoring', {
                title: tutTitle,
                body: tutBody,
                url: '/tutoring',
            }).catch(() => {});

            return res.status(201).json({ session: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// PATCH /tutoring/sessions/:id
export async function tutoringSessionById(req: VercelRequest, res: VercelResponse, id: string) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

    const { status } = req.body;
    if (!status || !['confirmed', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'status must be confirmed, completed, or cancelled' });
    }

    try {
        const admin = getSupabaseAdmin();
        const { data: session, error: fetchErr } = await admin.from('tutoring_sessions')
            .select('*').eq('id', id).single();
        if (fetchErr || !session) return res.status(404).json({ error: 'Sesión no encontrada' });

        // Only tutor can confirm/complete; both can cancel
        if ((status === 'confirmed' || status === 'completed') && user.id !== session.tutor_id) {
            return res.status(403).json({ error: 'Solo el tutor puede confirmar o completar la sesión' });
        }
        if (status === 'cancelled' && user.id !== session.tutor_id && user.id !== session.student_id) {
            return res.status(403).json({ error: 'No autorizado' });
        }

        const { data, error } = await admin.from('tutoring_sessions')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select(`*, student:profiles!tutoring_sessions_student_id_fkey(id, full_name, avatar_url), tutor:profiles!tutoring_sessions_tutor_id_fkey(id, full_name, avatar_url), offer:tutoring_offers!tutoring_sessions_offer_id_fkey(id, subject_name)`)
            .single();
        if (error) return res.status(400).json({ error: error.message });

        // Notify the other party
        const notifyUserId = user.id === session.tutor_id ? session.student_id : session.tutor_id;
        const { data: actor } = await admin.from('profiles').select('full_name').eq('id', user.id).single();
        const statusLabels: Record<string, string> = { confirmed: 'confirmó', completed: 'completó', cancelled: 'canceló' };
        const stTitle = `${actor?.full_name || 'Alguien'} ${statusLabels[status]} la sesión de tutoría`;
        const stBody = `Fecha: ${session.session_date}`;
        await admin.from('notifications').insert({
            user_id: notifyUserId,
            type: 'tutoring',
            title: stTitle,
            body: stBody,
        });
        sendPush(notifyUserId, 'tutoring', {
            title: stTitle,
            body: stBody,
            url: '/tutoring',
        }).catch(() => {});

        return res.status(200).json({ session: data });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}
