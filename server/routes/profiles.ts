import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../lib/auth';
import { supabaseAdmin, createSupabaseClient } from '../lib/supabase';
import { isValidUUID } from '../lib/validate';

// GET /profiles
export async function profilesList(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const search = req.query.search as string;
        let query = supabase
            .from('profiles')
            .select(`id, full_name, avatar_url, email, bio, semester, reputation, role, career:careers(id, name)`)
            .eq('is_banned', false).order('full_name');
        if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
        const { data, error } = await query.limit(50);
        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ profiles: data });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

// GET|PATCH /profiles/:id
export async function profileById(req: VercelRequest, res: VercelResponse, id: string) {
    if (req.method === 'GET') return profileGet(res, id);
    if (req.method === 'PATCH') return profilePatch(req, res, id);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function profileGet(res: VercelResponse, id: string) {
    if (!isValidUUID(id)) return res.status(400).json({ error: 'ID de perfil inválido' });
    try {
        const { data, error } = await supabaseAdmin
            .from('profiles').select(`*, career:careers(id, name)`).eq('id', id).single();
        if (error || !data) return res.status(404).json({ error: 'Perfil no encontrado' });
        return res.status(200).json({ profile: data });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

async function profilePatch(req: VercelRequest, res: VercelResponse, id: string) {
    if (!isValidUUID(id)) return res.status(400).json({ error: 'ID de perfil inválido' });
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (user.id !== id) return res.status(403).json({ error: 'Solo puedes editar tu propio perfil' });

    const { full_name, bio, career_id, semester, interests, avatar_url, cover_url, schedule_visibility } = req.body;
    const updates: Record<string, unknown> = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (bio !== undefined) updates.bio = bio;
    if (career_id !== undefined) updates.career_id = career_id;
    if (semester !== undefined) updates.semester = semester;
    if (interests !== undefined) updates.interests = interests;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;
    if (cover_url !== undefined) updates.cover_url = cover_url;
    if (schedule_visibility !== undefined) {
        if (!['public', 'followers', 'private'].includes(schedule_visibility))
            return res.status(400).json({ error: 'schedule_visibility inválido' });
        updates.schedule_visibility = schedule_visibility;
    }

    if (Object.keys(updates).length === 0)
        return res.status(400).json({ error: 'No hay datos para actualizar' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase
            .from('profiles').update(updates).eq('id', id).select(`*, career:careers(id, name)`).single();
        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ profile: data });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}
