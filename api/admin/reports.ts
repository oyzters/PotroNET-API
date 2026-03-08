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
        const status = req.query.status as string;
        const offset = (page - 1) * limit;

        let query = supabaseAdmin
            .from('reports')
            .select(`
                *,
                reporter:profiles!reports_reporter_id_fkey(id, full_name, email)
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (status) query = query.eq('status', status);

        const { data, error, count } = await query;
        if (error) return res.status(400).json({ error: error.message });

        return res.status(200).json({
            reports: data,
            pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
        });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handlePatch(req: VercelRequest, res: VercelResponse, adminUser: { id: string }) {
    const { report_id, status } = req.body;
    if (!report_id || !status) return res.status(400).json({ error: 'report_id and status are required' });

    const validStatuses = ['reviewed', 'resolved', 'dismissed'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('reports')
            .update({ status, reviewed_by: adminUser.id })
            .eq('id', report_id)
            .select(`
                *,
                reporter:profiles!reports_reporter_id_fkey(id, full_name, email)
            `)
            .single();

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ report: data });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
