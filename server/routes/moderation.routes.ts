import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser, requireAdmin } from '../lib/auth';
import { supabaseAdmin } from '../lib/supabase';
import { sendEmail } from '../lib/email';
import { warningTemplate, contentRemovedTemplate } from '../lib/email-templates';

const VALID_CATEGORIES = ['spam', 'acoso', 'contenido_sexual', 'violencia', 'informacion_falsa', 'odio', 'otro'];

const CATEGORY_LABELS: Record<string, string> = {
    spam: 'Spam',
    acoso: 'Acoso o bullying',
    contenido_sexual: 'Contenido sexual inapropiado',
    violencia: 'Violencia o amenazas',
    informacion_falsa: 'Información falsa',
    odio: 'Discurso de odio',
    otro: 'Violación a las normas de la comunidad',
};

/** Log a moderation action to the audit table */
async function logAction(opts: {
    moderatorId: string;
    actionType: string;
    targetUserId?: string;
    targetContentId?: string;
    category?: string;
    reason?: string;
    meta?: Record<string, unknown>;
}) {
    try {
        await supabaseAdmin.from('moderation_actions').insert({
            moderator_id: opts.moderatorId,
            action_type: opts.actionType,
            target_user_id: opts.targetUserId || null,
            target_content_id: opts.targetContentId || '',
            category: opts.category || 'otro',
            reason: opts.reason || '',
            meta: opts.meta || {},
        });
    } catch (e) {
        console.error('[moderation] Failed to log action:', e);
    }
}

/** Send in-app notification to a user */
async function notifyUser(opts: {
    userId: string;
    type: string;
    title: string;
    body?: string;
}) {
    try {
        await supabaseAdmin.from('notifications').insert({
            user_id: opts.userId,
            type: opts.type,
            title: opts.title,
            body: opts.body || '',
            content: opts.title,
            is_read: false,
        });
    } catch (e) {
        console.error('[moderation] Failed to send notification:', e);
    }
}

// POST /moderation/publications/:id/remove
export async function moderationRemovePublication(req: VercelRequest, res: VercelResponse, id: string) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (!requireAdmin(user)) return res.status(403).json({ error: 'Se requieren permisos de moderador' });

    const { category, reason } = req.body;
    if (!category || !VALID_CATEGORIES.includes(category))
        return res.status(400).json({ error: `category debe ser uno de: ${VALID_CATEGORIES.join(', ')}` });

    try {
        // Get publication + author info before deleting
        const { data: pub } = await supabaseAdmin
            .from('publications')
            .select('id, user_id, content, author:profiles!publications_user_id_fkey(id, email, full_name)')
            .eq('id', id)
            .single();

        if (!pub) return res.status(404).json({ error: 'Publicación no encontrada' });

        const authorRaw = Array.isArray(pub.author) ? pub.author[0] : pub.author;
        const author = authorRaw as { id: string; email: string; full_name: string };

        // Delete
        const { error } = await supabaseAdmin.from('publications').delete().eq('id', id);
        if (error) return res.status(400).json({ error: error.message });

        // Audit log
        await logAction({
            moderatorId: user.id,
            actionType: 'delete_publication',
            targetUserId: author.id,
            targetContentId: id,
            category,
            reason: reason || '',
            meta: { content_preview: pub.content?.slice(0, 100) },
        });

        // In-app notification to author
        const categoryLabel = CATEGORY_LABELS[category];
        await notifyUser({
            userId: author.id,
            type: 'moderation',
            title: `Tu publicación fue eliminada: ${categoryLabel}`,
            body: reason || 'Un moderador eliminó tu publicación por violar las normas de la comunidad.',
        });

        // Email notification (background)
        sendEmail(
            author.email,
            'Tu publicación fue eliminada — PotroNET',
            contentRemovedTemplate(reason || '', category)
        ).catch(() => {});

        return res.status(200).json({ message: 'Publicación eliminada y usuario notificado' });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

// POST /moderation/comments/:id/remove
export async function moderationRemoveComment(req: VercelRequest, res: VercelResponse, id: string) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (!requireAdmin(user)) return res.status(403).json({ error: 'Se requieren permisos de moderador' });

    const { reason, category } = req.body;

    try {
        const { data: comment } = await supabaseAdmin
            .from('publication_comments')
            .select('id, user_id, content, publication_id')
            .eq('id', id)
            .single();

        if (!comment) return res.status(404).json({ error: 'Comentario no encontrado' });

        const { error } = await supabaseAdmin.from('publication_comments').delete().eq('id', id);
        if (error) return res.status(400).json({ error: error.message });

        await logAction({
            moderatorId: user.id,
            actionType: 'delete_comment',
            targetUserId: comment.user_id,
            targetContentId: id,
            category: category || 'otro',
            reason: reason || '',
        });

        return res.status(200).json({ message: 'Comentario eliminado' });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

// POST /moderation/users/:id/warn
export async function moderationWarnUser(req: VercelRequest, res: VercelResponse, id: string) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (!requireAdmin(user)) return res.status(403).json({ error: 'Se requieren permisos de moderador' });

    const { category, message } = req.body;
    if (!category || !VALID_CATEGORIES.includes(category))
        return res.status(400).json({ error: `category debe ser uno de: ${VALID_CATEGORIES.join(', ')}` });
    if (!message?.trim())
        return res.status(400).json({ error: 'El mensaje de advertencia es requerido' });

    try {
        // Get target user
        const { data: targetUser } = await supabaseAdmin
            .from('profiles')
            .select('id, email, full_name, is_banned')
            .eq('id', id)
            .single();

        if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (targetUser.is_banned) return res.status(400).json({ error: 'El usuario ya está baneado' });

        // Insert warning
        const { data: warning, error } = await supabaseAdmin
            .from('user_warnings')
            .insert({ user_id: id, issued_by: user.id, category, message: message.trim() })
            .select()
            .single();
        if (error) return res.status(400).json({ error: error.message });

        // Audit log
        await logAction({
            moderatorId: user.id,
            actionType: 'warn_user',
            targetUserId: id,
            category,
            reason: message.trim(),
        });

        // In-app notification
        const categoryLabel = CATEGORY_LABELS[category];
        await notifyUser({
            userId: id,
            type: 'warning',
            title: `⚠️ Has recibido una advertencia: ${categoryLabel}`,
            body: message.trim(),
        });

        // Email
        sendEmail(
            targetUser.email,
            '⚠️ Has recibido una advertencia — PotroNET',
            warningTemplate(category, message.trim())
        ).catch(() => {});

        return res.status(201).json({ warning });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

// GET /moderation/stats
export async function moderationStats(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (!requireAdmin(user)) return res.status(403).json({ error: 'Se requieren permisos de moderador' });

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [pendingReports, actionsToday, activeWarnings, recentActions] = await Promise.all([
            supabaseAdmin.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            supabaseAdmin.from('moderation_actions').select('*', { count: 'exact', head: true })
                .gte('created_at', today.toISOString()),
            supabaseAdmin.from('user_warnings').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('moderation_actions')
                .select('*, moderator:profiles!moderation_actions_moderator_id_fkey(id, full_name, avatar_url)')
                .order('created_at', { ascending: false })
                .limit(10),
        ]);

        return res.status(200).json({
            stats: {
                pendingReports: pendingReports.count || 0,
                actionsToday: actionsToday.count || 0,
                activeWarnings: activeWarnings.count || 0,
            },
            recentActions: recentActions.data || [],
        });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

// GET /moderation/reports
export async function moderationReports(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (!requireAdmin(user)) return res.status(403).json({ error: 'Se requieren permisos de moderador' });

    try {
        const status = (req.query.status as string) || 'pending';
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

        const { data, error, count } = await supabaseAdmin
            .from('reports')
            .select('*, reporter:profiles!reports_reporter_id_fkey(id, full_name, email)', { count: 'exact' })
            .eq('status', status)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ reports: data || [], total: count || 0 });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

// PATCH /moderation/reports/:id
export async function moderationResolveReport(req: VercelRequest, res: VercelResponse, id: string) {
    if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (!requireAdmin(user)) return res.status(403).json({ error: 'Se requieren permisos de moderador' });

    const { status, resolution_note } = req.body;
    const validStatuses = ['reviewed', 'resolved', 'dismissed'];
    if (!status || !validStatuses.includes(status))
        return res.status(400).json({ error: `status debe ser: ${validStatuses.join(', ')}` });

    try {
        const { data, error } = await supabaseAdmin
            .from('reports')
            .update({ status, reviewed_by: user.id, resolution_note: resolution_note || '' })
            .eq('id', id)
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });

        await logAction({
            moderatorId: user.id,
            actionType: status === 'dismissed' ? 'dismiss_report' : 'resolve_report',
            targetContentId: id,
            reason: resolution_note || '',
        });

        return res.status(200).json({ report: data });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

// GET /moderation/users/:id/history
export async function moderationUserHistory(req: VercelRequest, res: VercelResponse, id: string) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (!requireAdmin(user)) return res.status(403).json({ error: 'Se requieren permisos de moderador' });

    try {
        const [warnings, actions, reports] = await Promise.all([
            supabaseAdmin.from('user_warnings')
                .select('*, issued_by_profile:profiles!user_warnings_issued_by_fkey(id, full_name)')
                .eq('user_id', id)
                .order('created_at', { ascending: false }),
            supabaseAdmin.from('moderation_actions')
                .select('*, moderator:profiles!moderation_actions_moderator_id_fkey(id, full_name)')
                .eq('target_user_id', id)
                .order('created_at', { ascending: false }),
            supabaseAdmin.from('reports')
                .select('*')
                .eq('reporter_id', id)
                .order('created_at', { ascending: false })
                .limit(10),
        ]);

        return res.status(200).json({
            warnings: warnings.data || [],
            actions: actions.data || [],
            reports: reports.data || [],
        });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

// GET /moderation/log  (sudo only)
export async function moderationLog(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (user.role !== 'sudo') return res.status(403).json({ error: 'Solo sudo puede ver el log completo' });

    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 25;
        const offset = (page - 1) * limit;
        const actionType = req.query.action_type as string;

        let query = supabaseAdmin
            .from('moderation_actions')
            .select(`
                *,
                moderator:profiles!moderation_actions_moderator_id_fkey(id, full_name, avatar_url),
                target_user:profiles!moderation_actions_target_user_id_fkey(id, full_name, email)
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (actionType) query = query.eq('action_type', actionType);

        const { data, error, count } = await query;
        if (error) return res.status(400).json({ error: error.message });

        return res.status(200).json({
            actions: data || [],
            pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
        });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
