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
    if (req.method === 'PATCH') return handlePatch(req, res, user!);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const search = req.query.search as string;
        const offset = (page - 1) * limit;

        let query = supabaseAdmin
            .from('profiles')
            .select(`*, career:careers(id, name)`, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (search) {
            query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
        }

        const { data, error, count } = await query;

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json({
            users: data,
            pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
        });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handlePatch(req: VercelRequest, res: VercelResponse, adminUser: { id: string; role: string }) {
    const { user_id, role, is_banned } = req.body;

    if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
    }

    // Only sudo can change roles or ban
    if (adminUser.role !== 'sudo' && (role !== undefined || is_banned !== undefined)) {
        return res.status(403).json({ error: 'Solo sudo puede cambiar roles y banear usuarios' });
    }

    const updates: Record<string, unknown> = {};
    if (role !== undefined) updates.role = role;
    if (is_banned !== undefined) updates.is_banned = is_banned;

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('profiles')
            .update(updates)
            .eq('id', user_id)
            .select(`*, career:careers(id, name)`)
            .single();

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json({ user: data });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
