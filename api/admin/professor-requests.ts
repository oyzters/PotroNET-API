import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser, requireSudo } from '../../lib/auth';
import { supabaseAdmin } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    const user = await getAuthUser(req);
    if (!requireSudo(user)) {
        return res.status(403).json({ error: 'Se requieren permisos de super administrador' });
    }

    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'PATCH') return handlePatch(req, res, user!);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
    try {
        const status = req.query.status as string || 'pending';
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        const { data, error, count } = await supabaseAdmin
            .from('professor_requests')
            .select(`
                *,
                requester:profiles!professor_requests_requested_by_fkey(id, full_name, email),
                career:careers(id, name)
            `, { count: 'exact' })
            .eq('status', status)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) return res.status(400).json({ error: error.message });

        return res.status(200).json({
            requests: data,
            pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
        });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handlePatch(req: VercelRequest, res: VercelResponse, adminUser: { id: string }) {
    const { request_id, status, professor_name, department, career_id } = req.body;
    if (!request_id || !status) return res.status(400).json({ error: 'request_id and status are required' });

    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'status must be approved or rejected' });
    }

    try {
        // Update request status
        const { data: request, error } = await supabaseAdmin
            .from('professor_requests')
            .update({ status, reviewed_by: adminUser.id })
            .eq('id', request_id)
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });

        // If approved, create the professor
        if (status === 'approved') {
            await supabaseAdmin
                .from('professors')
                .insert({
                    full_name: professor_name || request.professor_name,
                    department: department || request.department,
                    career_id: career_id || request.career_id,
                    is_approved: true,
                });
        }

        return res.status(200).json({ request });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
