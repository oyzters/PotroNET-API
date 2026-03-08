import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../lib/auth.js';
import { createSupabaseClient } from '../lib/supabase.js';

// POST /reports
export async function reportsIndex(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const { report_type, target_id, reason, description } = req.body;
    if (!report_type || !target_id || !reason)
        return res.status(400).json({ error: 'report_type, target_id and reason are required' });

    const validTypes = ['publication', 'user', 'review'];
    if (!validTypes.includes(report_type))
        return res.status(400).json({ error: `report_type must be one of: ${validTypes.join(', ')}` });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase
            .from('reports')
            .insert({ reporter_id: user.id, report_type, target_id, reason, description: description || '' })
            .select().single();
        if (error) return res.status(400).json({ error: error.message });
        return res.status(201).json({ report: data });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}
