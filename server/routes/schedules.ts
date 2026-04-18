import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../lib/auth';
import { createSupabaseClient, supabaseAdmin } from '../lib/supabase';

const VALID_COLORS = ['blue', 'emerald', 'amber', 'red', 'violet', 'pink', 'cyan', 'orange'];
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function normalizeTime(t: string): string {
    const m = t.match(/^(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : t;
}

function timeToMinutes(t: string): number {
    const [h, m] = normalizeTime(t).split(':').map(Number);
    return h * 60 + m;
}

function validatePayload(body: Record<string, unknown>, partial = false): string | null {
    const required = ['day_of_week', 'start_time', 'end_time', 'subject_name'] as const;
    if (!partial) {
        for (const k of required) {
            if (body[k] === undefined || body[k] === null || body[k] === '') return `${k} es requerido`;
        }
    }

    if (body.day_of_week !== undefined) {
        const d = Number(body.day_of_week);
        if (!Number.isInteger(d) || d < 1 || d > 5) return 'day_of_week debe ser 1..5 (Lun–Vie)';
    }
    if (body.start_time !== undefined && typeof body.start_time === 'string' && !TIME_REGEX.test(body.start_time))
        return 'start_time debe tener formato HH:MM';
    if (body.end_time !== undefined && typeof body.end_time === 'string' && !TIME_REGEX.test(body.end_time))
        return 'end_time debe tener formato HH:MM';
    if (body.start_time && body.end_time) {
        if (timeToMinutes(body.start_time as string) >= timeToMinutes(body.end_time as string))
            return 'end_time debe ser mayor que start_time';
    }
    if (body.subject_name !== undefined && typeof body.subject_name === 'string' && body.subject_name.trim().length === 0)
        return 'subject_name no puede estar vacío';
    if (body.subject_name !== undefined && typeof body.subject_name === 'string' && body.subject_name.length > 120)
        return 'subject_name demasiado largo (máx 120)';
    if (body.color !== undefined && typeof body.color === 'string' && !VALID_COLORS.includes(body.color))
        return `color debe ser uno de: ${VALID_COLORS.join(', ')}`;
    if (body.classroom !== undefined && typeof body.classroom === 'string' && body.classroom.length > 60)
        return 'classroom demasiado largo (máx 60)';
    if (body.professor !== undefined && typeof body.professor === 'string' && body.professor.length > 120)
        return 'professor demasiado largo (máx 120)';
    if (body.notes !== undefined && typeof body.notes === 'string' && body.notes.length > 300)
        return 'notes demasiado largo (máx 300)';
    return null;
}

async function hasOverlap(
    userId: string,
    day: number,
    start: string,
    end: string,
    excludeId?: string
): Promise<boolean> {
    let q = supabaseAdmin.from('user_schedule').select('id, start_time, end_time')
        .eq('user_id', userId).eq('day_of_week', day);
    if (excludeId) q = q.neq('id', excludeId);
    const { data } = await q;
    if (!data) return false;
    const s = timeToMinutes(start);
    const e = timeToMinutes(end);
    return data.some(b => {
        const bs = timeToMinutes(b.start_time);
        const be = timeToMinutes(b.end_time);
        return s < be && e > bs;
    });
}

// GET /schedules?user_id=... | POST /schedules
export async function schedulesIndex(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') {
        const user_id = req.query.user_id as string;
        if (!user_id) return res.status(400).json({ error: 'user_id es requerido' });

        try {
            // Visibility (admin client para leer siempre la config)
            const { data: profile } = await supabaseAdmin
                .from('profiles').select('schedule_visibility').eq('id', user_id).single();
            const visibility = profile?.schedule_visibility || 'public';

            // Lectura con cliente del usuario autenticado → RLS filtra según follow/visibility
            const supabase = createSupabaseClient(req.headers.authorization);
            const { data, error } = await supabase
                .from('user_schedule')
                .select('*')
                .eq('user_id', user_id)
                .order('day_of_week').order('start_time');

            if (error) return res.status(400).json({ error: error.message });

            const me = await getAuthUser(req);
            const isOwner = me?.id === user_id;

            let blocked = false;
            if (!isOwner) {
                if (visibility === 'private') {
                    blocked = true;
                } else if (visibility === 'followers') {
                    if (!me) {
                        blocked = true;
                    } else {
                        const { data: followRow } = await supabaseAdmin
                            .from('follows').select('id')
                            .eq('follower_id', me.id).eq('following_id', user_id).maybeSingle();
                        blocked = !followRow;
                    }
                }
            }

            return res.status(200).json({
                schedules: blocked ? [] : (data ?? []),
                visibility,
                blocked,
            });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'POST') {
        const user = await getAuthUser(req);
        if (!user) return res.status(401).json({ error: 'No autenticado' });

        const body = req.body ?? {};
        const err = validatePayload(body);
        if (err) return res.status(400).json({ error: err });

        const day = Number(body.day_of_week);
        const start = normalizeTime(body.start_time);
        const end = normalizeTime(body.end_time);

        if (await hasOverlap(user.id, day, start, end)) {
            return res.status(409).json({ error: 'Ese horario se solapa con otra clase' });
        }

        try {
            const supabase = createSupabaseClient(req.headers.authorization);
            const { data, error } = await supabase.from('user_schedule').insert({
                user_id: user.id,
                day_of_week: day,
                start_time: start,
                end_time: end,
                subject_name: String(body.subject_name).trim(),
                classroom: body.classroom ? String(body.classroom).trim() : null,
                professor: body.professor ? String(body.professor).trim() : null,
                color: body.color ? String(body.color) : 'blue',
                notes: body.notes ? String(body.notes).trim() : null,
            }).select('*').single();
            if (error) return res.status(400).json({ error: error.message });
            return res.status(201).json({ schedule: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// PATCH/DELETE /schedules/:id
export async function scheduleById(req: VercelRequest, res: VercelResponse, id: string) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    if (req.method === 'PATCH') {
        const body = req.body ?? {};
        const err = validatePayload(body, true);
        if (err) return res.status(400).json({ error: err });

        try {
            const { data: existing } = await supabaseAdmin
                .from('user_schedule').select('*').eq('id', id).single();
            if (!existing) return res.status(404).json({ error: 'Horario no encontrado' });
            if (existing.user_id !== user.id) return res.status(403).json({ error: 'No puedes editar este horario' });

            const updates: Record<string, unknown> = {};
            if (body.day_of_week !== undefined) updates.day_of_week = Number(body.day_of_week);
            if (body.start_time !== undefined) updates.start_time = normalizeTime(body.start_time as string);
            if (body.end_time !== undefined) updates.end_time = normalizeTime(body.end_time as string);
            if (body.subject_name !== undefined) updates.subject_name = String(body.subject_name).trim();
            if (body.classroom !== undefined) updates.classroom = body.classroom ? String(body.classroom).trim() : null;
            if (body.professor !== undefined) updates.professor = body.professor ? String(body.professor).trim() : null;
            if (body.color !== undefined) updates.color = String(body.color);
            if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes).trim() : null;

            if (Object.keys(updates).length === 0)
                return res.status(400).json({ error: 'No hay datos para actualizar' });

            // Valida solapamiento con valores finales
            const finalDay = (updates.day_of_week as number | undefined) ?? existing.day_of_week;
            const finalStart = (updates.start_time as string | undefined) ?? existing.start_time;
            const finalEnd = (updates.end_time as string | undefined) ?? existing.end_time;
            if (timeToMinutes(finalStart) >= timeToMinutes(finalEnd))
                return res.status(400).json({ error: 'end_time debe ser mayor que start_time' });
            if (await hasOverlap(user.id, finalDay, finalStart, finalEnd, id))
                return res.status(409).json({ error: 'Ese horario se solapa con otra clase' });

            const supabase = createSupabaseClient(req.headers.authorization);
            const { data, error } = await supabase
                .from('user_schedule').update(updates).eq('id', id).select('*').single();
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ schedule: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'DELETE') {
        try {
            const supabase = createSupabaseClient(req.headers.authorization);
            const { error } = await supabase.from('user_schedule').delete().eq('id', id);
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ success: true });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
