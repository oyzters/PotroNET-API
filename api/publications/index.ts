import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser } from '../../lib/auth';
import { createSupabaseClient } from '../../lib/supabase';
import { validateContent } from '../../lib/moderation';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'POST') return handlePost(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const tag = req.query.tag as string;
        const userId = req.query.user_id as string;
        const offset = (page - 1) * limit;

        let query = supabase
            .from('publications')
            .select(`
        *,
        author:profiles!publications_user_id_fkey(id, full_name, avatar_url, email)
      `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (tag) query = query.contains('tags', [tag]);
        if (userId) query = query.eq('user_id', userId);

        const { data, error, count } = await query;

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json({
            publications: data,
            pagination: {
                page,
                limit,
                total: count,
                totalPages: Math.ceil((count || 0) / limit),
            },
        });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) {
        return res.status(401).json({ error: 'No autenticado' });
    }

    const { content, tags } = req.body;

    if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: 'El contenido es requerido' });
    }

    if (content.length > 500) {
        return res.status(400).json({ error: 'El contenido no puede exceder 500 caracteres' });
    }

    // Content moderation
    const moderation = validateContent(content);
    if (!moderation.valid) {
        return res.status(400).json({ error: moderation.reason });
    }

    // Validate tags format
    const cleanTags = Array.isArray(tags)
        ? tags.map((t: string) => t.toLowerCase().replace(/[^a-záéíóúñ0-9]/g, '').trim()).filter(Boolean)
        : [];

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase
            .from('publications')
            .insert({
                user_id: user.id,
                content: content.trim(),
                tags: cleanTags,
            })
            .select(`
        *,
        author:profiles!publications_user_id_fkey(id, full_name, avatar_url, email)
      `)
            .single();

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.status(201).json({ publication: data });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
