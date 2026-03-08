import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser } from '../../lib/auth';
import { supabaseAdmin, createSupabaseClient } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    const { id } = req.query;

    if (req.method === 'GET') return handleGet(req, res, id as string);
    if (req.method === 'PATCH') return handlePatch(req, res, id as string);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse, id: string) {
    try {
        const { data, error } = await supabaseAdmin
            .from('profiles')
            .select(`
        *,
        career:careers(id, name)
      `)
            .eq('id', id)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Perfil no encontrado' });
        }

        return res.status(200).json({ profile: data });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handlePatch(req: VercelRequest, res: VercelResponse, id: string) {
    const user = await getAuthUser(req);
    if (!user) {
        return res.status(401).json({ error: 'No autenticado' });
    }

    if (user.id !== id) {
        return res.status(403).json({ error: 'Solo puedes editar tu propio perfil' });
    }

    const { full_name, bio, career_id, semester, interests, avatar_url } = req.body;

    const updates: Record<string, unknown> = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (bio !== undefined) updates.bio = bio;
    if (career_id !== undefined) updates.career_id = career_id;
    if (semester !== undefined) updates.semester = semester;
    if (interests !== undefined) updates.interests = interests;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', id)
            .select(`
        *,
        career:careers(id, name)
      `)
            .single();

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json({ profile: data });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
