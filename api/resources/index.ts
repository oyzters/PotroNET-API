import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser } from '../../lib/auth';
import { createSupabaseClient } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'POST') return handlePost(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const career_id = req.query.career_id as string;
        const subject = req.query.subject as string;
        const type = req.query.type as string;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        let query = supabase
            .from('resources')
            .select(`
                *,
                uploader:profiles!resources_user_id_fkey(id, full_name, avatar_url, email),
                career:careers(id, name)
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (career_id) query = query.eq('career_id', career_id);
        if (subject) query = query.ilike('subject_name', `%${subject}%`);
        if (type) query = query.eq('resource_type', type);

        const { data, error, count } = await query;
        if (error) return res.status(400).json({ error: error.message });

        return res.status(200).json({
            resources: data,
            pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
        });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const { title, description, resource_type, file_url, career_id, subject_name, professor_name } = req.body;

    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!resource_type) return res.status(400).json({ error: 'resource_type is required' });

    const validTypes = ['pdf', 'resumen', 'presentacion', 'guia', 'examen', 'otro'];
    if (!validTypes.includes(resource_type)) {
        return res.status(400).json({ error: `resource_type must be one of: ${validTypes.join(', ')}` });
    }

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase
            .from('resources')
            .insert({
                user_id: user.id,
                title,
                description: description || '',
                resource_type,
                file_url: file_url || '',
                career_id: career_id || null,
                subject_name: subject_name || '',
                professor_name: professor_name || '',
            })
            .select(`
                *,
                uploader:profiles!resources_user_id_fkey(id, full_name, avatar_url, email),
                career:careers(id, name)
            `)
            .single();

        if (error) return res.status(400).json({ error: error.message });
        return res.status(201).json({ resource: data });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
