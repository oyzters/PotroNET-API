import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../lib/auth';
import { createSupabaseClient, supabaseAdmin } from '../lib/supabase';

// GET /professors
export async function professorsList(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const career_id = req.query.career_id as string;
        const search = req.query.search as string;
        const sort = req.query.sort as string || 'rating';
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        let query = supabase.from('professors').select(`*, career:careers(id, name)`, { count: 'exact' }).eq('is_approved', true);
        if (career_id) query = query.eq('career_id', career_id);
        if (search) query = query.ilike('full_name', `%${search}%`);

        if (sort === 'rating') query = query.order('avg_rating', { ascending: false });
        else if (sort === 'reviews') query = query.order('total_reviews', { ascending: false });
        else query = query.order('full_name');

        const { data, error, count } = await query.range(offset, offset + limit - 1);
        if (error) return res.status(400).json({ error: error.message });

        return res.status(200).json({
            professors: data,
            pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
        });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

// GET /professors/:id
export async function professorById(req: VercelRequest, res: VercelResponse, id: string) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data: professor, error } = await supabase
            .from('professors').select(`*, career:careers(id, name)`).eq('id', id).eq('is_approved', true).single();
        if (error || !professor) return res.status(404).json({ error: 'Profesor no encontrado' });

        const { data: reviews } = await supabase
            .from('professor_reviews')
            .select('id, teaching_quality, clarity, student_treatment, exam_difficulty, overall_rating, qualities, weaknesses, comment, subject_name, created_at')
            .eq('professor_id', id).order('created_at', { ascending: false });

        const qualityCounts: Record<string, number> = {};
        const weaknessCounts: Record<string, number> = {};
        reviews?.forEach(r => {
            r.qualities?.forEach((q: string) => { qualityCounts[q] = (qualityCounts[q] || 0) + 1; });
            r.weaknesses?.forEach((w: string) => { weaknessCounts[w] = (weaknessCounts[w] || 0) + 1; });
        });

        return res.status(200).json({
            professor, reviews: reviews || [],
            aggregated: {
                topQualities: Object.entries(qualityCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
                topWeaknesses: Object.entries(weaknessCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
            },
        });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

// GET|POST /professors/requests
export async function professorRequests(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    if (req.method === 'GET') {
        try {
            const supabase = createSupabaseClient(req.headers.authorization);
            const { data, error } = await supabase
                .from('professor_requests').select('*').eq('requested_by', user.id).order('created_at', { ascending: false });
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ requests: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'POST') {
        const { professor_name, department, career_id, reason } = req.body;
        if (!professor_name) return res.status(400).json({ error: 'professor_name is required' });

        try {
            const supabase = createSupabaseClient(req.headers.authorization);
            const { data, error } = await supabase
                .from('professor_requests')
                .insert({ requested_by: user.id, professor_name, department: department || '', career_id: career_id || null, reason: reason || '' })
                .select().single();
            if (error) return res.status(400).json({ error: error.message });
            return res.status(201).json({ request: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// GET|POST|PUT /professors/reviews
const VALID_QUALITIES = ['explica claramente', 'domina la materia', 'accesible para dudas', 'clases dinámicas', 'puntual', 'justo al evaluar', 'motiva al estudiante', 'material de apoyo'];
const VALID_WEAKNESSES = ['evalúa muy difícil', 'poca disponibilidad', 'mala organización', 'clases aburridas', 'impuntual', 'injusto al calificar', 'no responde dudas', 'material insuficiente'];

function buildReviewPayload(body: Record<string, unknown>, userId: string) {
    const { professor_id, teaching_quality, clarity, student_treatment, exam_difficulty, qualities, weaknesses, comment, subject_name } = body as Record<string, unknown>;
    if (!professor_id) throw new Error('professor_id is required');
    const ratings = [teaching_quality, clarity, student_treatment, exam_difficulty] as number[];
    for (const r of ratings) { if (r === undefined || r < 0 || r > 5) throw new Error('All ratings must be between 0 and 5'); }
    const overall_rating = parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2));
    const cleanQualities = Array.isArray(qualities) ? (qualities as string[]).filter(q => VALID_QUALITIES.includes(q)) : [];
    const cleanWeaknesses = Array.isArray(weaknesses) ? (weaknesses as string[]).filter(w => VALID_WEAKNESSES.includes(w)) : [];
    return {
        professor_id, user_id: userId, teaching_quality, clarity, student_treatment, exam_difficulty,
        overall_rating, qualities: cleanQualities, weaknesses: cleanWeaknesses,
        comment: (comment as string)?.trim() || '', subject_name: subject_name || '',
    };
}

export async function professorReviews(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    if (req.method === 'GET') {
        const { professor_id } = req.query;
        if (!professor_id) return res.status(400).json({ error: 'professor_id is required' });
        const { data } = await supabaseAdmin.from('professor_reviews').select('*').eq('professor_id', professor_id).eq('user_id', user.id).single();
        return res.status(200).json({ review: data || null });
    }

    if (req.method === 'POST') {
        try {
            const { data: existing } = await supabaseAdmin.from('professor_reviews').select('id').eq('professor_id', req.body.professor_id).eq('user_id', user.id).single();
            if (existing) return res.status(409).json({ error: 'Ya evaluaste a este profesor. Puedes editar tu evaluación existente.', existing_id: existing.id });

            const payload = buildReviewPayload(req.body, user.id);
            const { data, error } = await supabaseAdmin.from('professor_reviews').insert(payload).select().single();
            if (error) return res.status(400).json({ error: error.message });
            return res.status(201).json({ review: data });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error interno';
            return res.status(400).json({ error: msg });
        }
    }

    if (req.method === 'PUT') {
        try {
            const { data: existing } = await supabaseAdmin.from('professor_reviews').select('id').eq('professor_id', req.body.professor_id).eq('user_id', user.id).single();
            if (!existing) return res.status(404).json({ error: 'No tienes una evaluación existente para editar' });

            const payload = buildReviewPayload(req.body, user.id);
            const { data, error } = await supabaseAdmin.from('professor_reviews').update(payload).eq('id', existing.id).select().single();
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ review: data });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error interno';
            return res.status(400).json({ error: msg });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
