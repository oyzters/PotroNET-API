import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser, requireAdmin } from '../../lib/auth';
import { supabaseAdmin } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    const user = await getAuthUser(req);
    if (!requireAdmin(user)) {
        return res.status(403).json({ error: 'Se requieren permisos de administrador' });
    }

    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'POST') return handlePost(req, res);
    if (req.method === 'PATCH') return handlePatch(req, res);
    if (req.method === 'DELETE') return handleDelete(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
    const career_id = req.query.career_id as string;
    if (!career_id) return res.status(400).json({ error: 'career_id is required' });

    try {
        const { data, error } = await supabaseAdmin
            .from('career_subjects')
            .select('*')
            .eq('career_id', career_id)
            .order('semester')
            .order('name');

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ subjects: data });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
    const { career_id, name, semester, credits } = req.body;

    if (!career_id || !name || !semester) {
        return res.status(400).json({ error: 'career_id, name y semester son requeridos' });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('career_subjects')
            .insert({ career_id, name: name.trim(), semester: Number(semester), credits: Number(credits) || 0 })
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });
        return res.status(201).json({ subject: data });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
    const { id, name, semester, credits } = req.body;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (semester !== undefined) updates.semester = Number(semester);
    if (credits !== undefined) updates.credits = Number(credits);

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('career_subjects')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ subject: data });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: 'id is required' });

    try {
        const { error } = await supabaseAdmin
            .from('career_subjects')
            .delete()
            .eq('id', id);

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ success: true });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
