import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../lib/auth';
import { createSupabaseClient } from '../lib/supabase';
import { validateContent } from '../lib/moderation';

// GET|POST /publications
export async function publicationsIndex(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') return publicationsGet(req, res);
    if (req.method === 'POST') return publicationsPost(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function publicationsGet(req: VercelRequest, res: VercelResponse) {
    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const tag = req.query.tag as string;
        const userId = req.query.user_id as string;
        const offset = (page - 1) * limit;

        let query = supabase
            .from('publications')
            .select(`*, author:profiles!publications_user_id_fkey(id, full_name, avatar_url, email)`, { count: 'exact' })
            .order('created_at', { ascending: false }).range(offset, offset + limit - 1);

        if (tag) query = query.contains('tags', [tag]);
        if (userId) query = query.eq('user_id', userId);

        const { data, error, count } = await query;
        if (error) return res.status(400).json({ error: error.message });

        return res.status(200).json({
            publications: data,
            pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
        });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

async function publicationsPost(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const { content, tags } = req.body;
    if (!content || content.trim().length === 0) return res.status(400).json({ error: 'El contenido es requerido' });
    if (content.length > 500) return res.status(400).json({ error: 'El contenido no puede exceder 500 caracteres' });

    const moderation = validateContent(content);
    if (!moderation.valid) return res.status(400).json({ error: moderation.reason });

    const cleanTags = Array.isArray(tags)
        ? tags.map((t: string) => t.toLowerCase().replace(/[^a-záéíóúñ0-9]/g, '').trim()).filter(Boolean) : [];

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase
            .from('publications')
            .insert({ user_id: user.id, content: content.trim(), tags: cleanTags })
            .select(`*, author:profiles!publications_user_id_fkey(id, full_name, avatar_url, email)`)
            .single();
        if (error) return res.status(400).json({ error: error.message });
        return res.status(201).json({ publication: data });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

// GET|DELETE /publications/:id
export async function publicationById(req: VercelRequest, res: VercelResponse, id: string) {
    if (req.method === 'GET') {
        try {
            const supabase = createSupabaseClient(req.headers.authorization);
            const { data, error } = await supabase
                .from('publications')
                .select(`*, author:profiles!publications_user_id_fkey(id, full_name, avatar_url, email)`)
                .eq('id', id).single();
            if (error || !data) return res.status(404).json({ error: 'Publicación no encontrada' });
            return res.status(200).json({ publication: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'DELETE') {
        const user = await getAuthUser(req);
        if (!user) return res.status(401).json({ error: 'No autenticado' });

        try {
            const supabase = createSupabaseClient(req.headers.authorization);
            const { data: pub } = await supabase.from('publications').select('user_id').eq('id', id).single();
            if (!pub) return res.status(404).json({ error: 'Publicación no encontrada' });
            if (pub.user_id !== user.id && user.role === 'user')
                return res.status(403).json({ error: 'No tienes permisos para eliminar esta publicación' });

            const { error } = await supabase.from('publications').delete().eq('id', id);
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ message: 'Publicación eliminada' });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// POST|DELETE /publications/:id/likes
export async function publicationLike(req: VercelRequest, res: VercelResponse, id: string) {
    if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const publication_id = id;
    if (!publication_id) return res.status(400).json({ error: 'publication_id is required' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        if (req.method === 'DELETE') {
            await supabase.from('publication_likes').delete().eq('user_id', user.id).eq('publication_id', publication_id);
            return res.status(200).json({ liked: false });
        } else {
            // POST to like
            const { data: existing } = await supabase
                .from('publication_likes').select('*').eq('user_id', user.id).eq('publication_id', publication_id).single();

            if (!existing) {
                await supabase.from('publication_likes').insert({ user_id: user.id, publication_id });
            }
            return res.status(200).json({ liked: true });
        }
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}
