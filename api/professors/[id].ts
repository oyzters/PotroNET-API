import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { createSupabaseClient } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { id } = req.query;

    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        const { data: professor, error } = await supabase
            .from('professors')
            .select(`
                *,
                career:careers(id, name)
            `)
            .eq('id', id)
            .eq('is_approved', true)
            .single();

        if (error || !professor) return res.status(404).json({ error: 'Profesor no encontrado' });

        // Get reviews (anonymous - no user info)
        const { data: reviews } = await supabase
            .from('professor_reviews')
            .select('id, teaching_quality, clarity, student_treatment, exam_difficulty, overall_rating, qualities, weaknesses, comment, subject_name, created_at')
            .eq('professor_id', id)
            .order('created_at', { ascending: false });

        // Aggregate qualities and weaknesses
        const qualityCounts: Record<string, number> = {};
        const weaknessCounts: Record<string, number> = {};

        reviews?.forEach(r => {
            r.qualities?.forEach((q: string) => { qualityCounts[q] = (qualityCounts[q] || 0) + 1; });
            r.weaknesses?.forEach((w: string) => { weaknessCounts[w] = (weaknessCounts[w] || 0) + 1; });
        });

        return res.status(200).json({
            professor,
            reviews: reviews || [],
            aggregated: {
                topQualities: Object.entries(qualityCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
                topWeaknesses: Object.entries(weaknessCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
            },
        });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
