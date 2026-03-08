import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { createSupabaseClient } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        const career_id = req.query.career_id as string;
        const search = req.query.search as string;
        const sort = req.query.sort as string || 'rating';
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        let query = supabase
            .from('professors')
            .select(`
                *,
                career:careers(id, name)
            `, { count: 'exact' })
            .eq('is_approved', true);

        if (career_id) query = query.eq('career_id', career_id);
        if (search) query = query.ilike('full_name', `%${search}%`);

        if (sort === 'rating') {
            query = query.order('avg_rating', { ascending: false });
        } else if (sort === 'reviews') {
            query = query.order('total_reviews', { ascending: false });
        } else {
            query = query.order('full_name');
        }

        const { data, error, count } = await query.range(offset, offset + limit - 1);

        if (error) return res.status(400).json({ error: error.message });

        return res.status(200).json({
            professors: data,
            pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
        });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
