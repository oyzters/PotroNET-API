import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser } from '../../lib/auth';
import { supabaseAdmin, createSupabaseClient } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    if (req.method === 'POST') return handlePost(req, res, user.id);
    if (req.method === 'PUT') return handlePut(req, res, user.id);
    if (req.method === 'GET') return handleGetMyReview(req, res, user.id);
    return res.status(405).json({ error: 'Method not allowed' });
}

const VALID_QUALITIES = ['explica claramente', 'domina la materia', 'accesible para dudas', 'clases dinámicas', 'puntual', 'justo al evaluar', 'motiva al estudiante', 'material de apoyo'];
const VALID_WEAKNESSES = ['evalúa muy difícil', 'poca disponibilidad', 'mala organización', 'clases aburridas', 'impuntual', 'injusto al calificar', 'no responde dudas', 'material insuficiente'];

function buildReviewPayload(body: Record<string, unknown>, userId: string) {
    const { professor_id, teaching_quality, clarity, student_treatment, exam_difficulty, qualities, weaknesses, comment, subject_name } = body as Record<string, unknown>;

    if (!professor_id) throw new Error('professor_id is required');
    const ratings = [teaching_quality, clarity, student_treatment, exam_difficulty] as number[];
    for (const r of ratings) {
        if (r === undefined || r < 0 || r > 5) throw new Error('All ratings must be between 0 and 5');
    }
    const overall_rating = parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2));
    const cleanQualities = Array.isArray(qualities) ? (qualities as string[]).filter(q => VALID_QUALITIES.includes(q)) : [];
    const cleanWeaknesses = Array.isArray(weaknesses) ? (weaknesses as string[]).filter(w => VALID_WEAKNESSES.includes(w)) : [];
    return {
        professor_id, user_id: userId, teaching_quality, clarity, student_treatment, exam_difficulty,
        overall_rating, qualities: cleanQualities, weaknesses: cleanWeaknesses,
        comment: (comment as string)?.trim() || '', subject_name: subject_name || '',
    };
}

async function handleGetMyReview(req: VercelRequest, res: VercelResponse, userId: string) {
    const { professor_id } = req.query;
    if (!professor_id) return res.status(400).json({ error: 'professor_id is required' });

    const { data } = await supabaseAdmin
        .from('professor_reviews')
        .select('*')
        .eq('professor_id', professor_id)
        .eq('user_id', userId)
        .single();

    return res.status(200).json({ review: data || null });
}

async function handlePost(req: VercelRequest, res: VercelResponse, userId: string) {
    try {
        // Check if review already exists
        const { data: existing } = await supabaseAdmin
            .from('professor_reviews')
            .select('id')
            .eq('professor_id', req.body.professor_id)
            .eq('user_id', userId)
            .single();

        if (existing) {
            return res.status(409).json({ error: 'Ya evaluaste a este profesor. Puedes editar tu evaluación existente.', existing_id: existing.id });
        }

        const payload = buildReviewPayload(req.body, userId);
        const { data, error } = await supabaseAdmin
            .from('professor_reviews')
            .insert(payload)
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });
        return res.status(201).json({ review: data });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error interno';
        return res.status(400).json({ error: msg });
    }
}

async function handlePut(req: VercelRequest, res: VercelResponse, userId: string) {
    try {
        // Verify ownership
        const { data: existing } = await supabaseAdmin
            .from('professor_reviews')
            .select('id')
            .eq('professor_id', req.body.professor_id)
            .eq('user_id', userId)
            .single();

        if (!existing) return res.status(404).json({ error: 'No tienes una evaluación existente para editar' });

        const payload = buildReviewPayload(req.body, userId);
        const { data, error } = await supabaseAdmin
            .from('professor_reviews')
            .update(payload)
            .eq('id', existing.id)
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ review: data });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error interno';
        return res.status(400).json({ error: msg });
    }
}
