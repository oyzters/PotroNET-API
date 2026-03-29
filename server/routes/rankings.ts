import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../lib/auth';
import { getSupabaseAdmin } from '../lib/supabase';

// GET /rankings
export async function rankingsIndex(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const admin = getSupabaseAdmin();
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
        const offset = (page - 1) * limit;
        const careerId = req.query.career_id as string;

        // Query profiles directly (more reliable than views)
        let query = admin
            .from('profiles')
            .select('id, full_name, avatar_url, reputation, followers_count, following_count, friends_count, semester, career_id, career:careers(id, name)')
            .eq('is_banned', false);

        if (careerId && careerId !== 'all') {
            query = query.eq('career_id', careerId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Rankings query error:', error);
            return res.status(400).json({ error: error.message });
        }

        // Calculate popularity_score and sort
        const ranked = (data || [])
            .map(p => ({
                ...p,
                career_name: (p.career as any)?.name || null,
                popularity_score: (p.reputation || 0) * 2 + (p.friends_count || 0) * 3 + (p.followers_count || 0),
            }))
            .sort((a, b) => b.popularity_score - a.popularity_score);

        const total = ranked.length;
        const paginated = ranked.slice(offset, offset + limit);

        return res.status(200).json({
            rankings: paginated,
            pagination: {
                page,
                totalPages: Math.ceil(total / limit),
                total,
            },
        });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}
