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
        const user = await getAuthUser(req);
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

        // Enrich with user_liked for the current user
        let publications = data || [];
        if (user && publications.length > 0) {
            const pubIds = publications.map((p: any) => p.id);
            const { data: likes } = await supabase
                .from('publication_likes')
                .select('publication_id')
                .eq('user_id', user.id)
                .in('publication_id', pubIds);
            const likedSet = new Set((likes || []).map((l: any) => l.publication_id));
            publications = publications.map((p: any) => ({ ...p, user_liked: likedSet.has(p.id) }));
        }

        return res.status(200).json({
            publications,
            pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
        });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

async function publicationsPost(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const { content, tags, media, image_url } = req.body;
    if (!content || content.trim().length === 0) return res.status(400).json({ error: 'El contenido es requerido' });
    if (content.length > 500) return res.status(400).json({ error: 'El contenido no puede exceder 500 caracteres' });

    const moderation = validateContent(content);
    if (!moderation.valid) return res.status(400).json({ error: moderation.reason });

    const cleanTags = Array.isArray(tags)
        ? tags.map((t: string) => t.toLowerCase().replace(/[^a-záéíóúñ0-9]/g, '').trim()).filter(Boolean) : [];

    // Validate and clean media array (max 10 items)
    let cleanMedia: Array<{ type: string; url: string }> = [];
    if (Array.isArray(media)) {
        cleanMedia = media
            .filter((m: any) => m && typeof m.url === 'string' && m.url.trim() && ['image', 'video'].includes(m.type))
            .slice(0, 10)
            .map((m: any) => ({ type: m.type, url: m.url.trim() }));
    } else if (image_url && typeof image_url === 'string') {
        // Backward compat: single image_url → media array
        cleanMedia = [{ type: 'image', url: image_url }];
    }

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const insertData: Record<string, unknown> = { user_id: user.id, content: content.trim(), tags: cleanTags, media: cleanMedia };
        // Legacy compat
        if (cleanMedia.length > 0 && cleanMedia[0].type === 'image') insertData.image_url = cleanMedia[0].url;
        const { data, error } = await supabase
            .from('publications')
            .insert(insertData)
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

// POST /publications/:id/likes — toggle like
export async function publicationLike(req: VercelRequest, res: VercelResponse, id: string) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        const { data: existing } = await supabase
            .from('publication_likes').select('id').eq('user_id', user.id).eq('publication_id', id).maybeSingle();

        if (existing) {
            await supabase.from('publication_likes').delete().eq('id', existing.id);
            return res.status(200).json({ liked: false });
        } else {
            await supabase.from('publication_likes').insert({ user_id: user.id, publication_id: id });
            return res.status(200).json({ liked: true });
        }
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

// GET /publications/:id/comments, POST /publications/:id/comments
export async function publicationComments(req: VercelRequest, res: VercelResponse, id: string) {
    if (req.method === 'GET') return commentsGet(req, res, id);
    if (req.method === 'POST') return commentsPost(req, res, id);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function commentsGet(req: VercelRequest, res: VercelResponse, publicationId: string) {
    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
        const offset = (page - 1) * limit;

        const { data, error, count } = await supabase
            .from('publication_comments')
            .select('*, author:profiles!publication_comments_user_id_fkey(id, full_name, avatar_url)', { count: 'exact' })
            .eq('publication_id', publicationId)
            .order('created_at', { ascending: true })
            .range(offset, offset + limit - 1);

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({
            comments: data || [],
            pagination: { page, totalPages: Math.ceil((count || 0) / limit), total: count || 0 },
        });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

async function commentsPost(req: VercelRequest, res: VercelResponse, publicationId: string) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'El contenido es requerido' });
    if (content.length > 500) return res.status(400).json({ error: 'El comentario no puede exceder 500 caracteres' });

    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase
            .from('publication_comments')
            .insert({ publication_id: publicationId, user_id: user.id, content: content.trim() })
            .select('*, author:profiles!publication_comments_user_id_fkey(id, full_name, avatar_url)')
            .single();

        if (error) return res.status(400).json({ error: error.message });
        return res.status(201).json({ comment: data });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}
