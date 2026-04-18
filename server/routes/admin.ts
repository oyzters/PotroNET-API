import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser, requireAdmin, requireSudo } from '../lib/auth';
import { supabaseAdmin } from '../lib/supabase';
import { sendEmail } from '../lib/email';
import { notificationTemplate } from '../lib/email-templates';
import { sendPushToMany } from '../lib/push';

// GET /admin/stats
export async function adminStats(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!requireAdmin(user)) return res.status(403).json({ error: 'Se requieren permisos de administrador' });
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const [
            usersResult, pubsResult, careersResult, professorsResult,
            tutoringResult, resourcesResult, pendingReportsResult,
            commentsResult, messagesResult, subjectsResult, professorReqResult,
        ] = await Promise.all([
            supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('publications').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('careers').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('professors').select('*', { count: 'exact', head: true }).eq('is_approved', true),
            supabaseAdmin.from('tutoring_offers').select('*', { count: 'exact', head: true }).eq('is_active', true),
            supabaseAdmin.from('resources').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            supabaseAdmin.from('publication_comments').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('career_subjects').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('professor_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        ]);

        const [
            usersByRole, bannedUsers, recentUsers, activeWarningsResult,
            recentPubs, recentComments, recentMessages,
        ] = await Promise.all([
            supabaseAdmin.from('profiles').select('role'),
            supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('is_banned', true),
            supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
            supabaseAdmin.from('user_warnings').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('publications').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
            supabaseAdmin.from('publication_comments').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
            supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
        ]);

        const roleCounts = { user: 0, admin: 0, sudo: 0 };
        usersByRole.data?.forEach((p: { role: string }) => {
            if (p.role in roleCounts) roleCounts[p.role as keyof typeof roleCounts]++;
        });

        return res.status(200).json({
            stats: {
                // Totales
                totalUsers: usersResult.count || 0,
                totalPublications: pubsResult.count || 0,
                totalCareers: careersResult.count || 0,
                totalProfessors: professorsResult.count || 0,
                totalTutoring: tutoringResult.count || 0,
                totalResources: resourcesResult.count || 0,
                totalComments: commentsResult.count || 0,
                totalMessages: messagesResult.count || 0,
                totalSubjects: subjectsResult.count || 0,

                // Moderación / alertas
                pendingReports: pendingReportsResult.count || 0,
                pendingProfessorRequests: professorReqResult.count || 0,
                bannedUsers: bannedUsers.count || 0,
                activeWarnings: activeWarningsResult.count || 0,

                // Última semana (engagement)
                newUsersThisWeek: recentUsers.count || 0,
                newPublicationsThisWeek: recentPubs.count || 0,
                newCommentsThisWeek: recentComments.count || 0,
                newMessagesThisWeek: recentMessages.count || 0,

                // Distribución
                usersByRole: roleCounts,
            },
        });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

// GET|PATCH /admin/users
export async function adminUsers(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!requireAdmin(user)) return res.status(403).json({ error: 'Se requieren permisos de administrador' });

    if (req.method === 'GET') {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 20;
            const search = req.query.search as string;
            const offset = (page - 1) * limit;

            let query = supabaseAdmin.from('profiles').select(`*, career:careers(id, name), warnings:user_warnings!user_id(count)`, { count: 'exact' })
                .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
            if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);

            const { data, error, count } = await query;
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({
                users: data, pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
            });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'PATCH') {
        const { user_id, role, is_banned } = req.body;
        if (!user_id) return res.status(400).json({ error: 'user_id is required' });
        if (user!.role !== 'sudo' && (role !== undefined || is_banned !== undefined))
            return res.status(403).json({ error: 'Solo sudo puede cambiar roles y banear usuarios' });

        const updates: Record<string, unknown> = {};
        if (role !== undefined) updates.role = role;
        if (is_banned !== undefined) updates.is_banned = is_banned;
        if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No hay datos para actualizar' });

        try {
            const { data, error } = await supabaseAdmin.from('profiles').update(updates).eq('id', user_id).select(`*, career:careers(id, name)`).single();
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ user: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'DELETE') {
        if (!requireSudo(user)) return res.status(403).json({ error: 'Solo sudo puede eliminar usuarios' });
        const target_id = (req.query.user_id as string | undefined) || (req.body?.user_id as string | undefined);
        if (!target_id) return res.status(400).json({ error: 'user_id is required' });
        if (target_id === user!.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });

        try {
            // Delete auth user first (cascades to public.profiles via FK on profiles.id → auth.users.id)
            // If the cascade is not configured, we explicitly delete the profile too.
            const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(target_id);
            if (authErr && !String(authErr.message).toLowerCase().includes('not found')) {
                return res.status(400).json({ error: authErr.message });
            }

            // Ensure profile is gone (in case FK cascade isn't set up)
            await supabaseAdmin.from('profiles').delete().eq('id', target_id);

            return res.status(200).json({ success: true });
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Error interno del servidor';
            return res.status(500).json({ error: msg });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// GET|PATCH /admin/reports
export async function adminReports(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!requireAdmin(user)) return res.status(403).json({ error: 'Se requieren permisos de administrador' });

    if (req.method === 'GET') {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 20;
            const status = req.query.status as string;
            const offset = (page - 1) * limit;

            let query = supabaseAdmin.from('reports')
                .select(`*, reporter:profiles!reports_reporter_id_fkey(id, full_name, email)`, { count: 'exact' })
                .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
            if (status) query = query.eq('status', status);

            const { data, error, count } = await query;
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({
                reports: data, pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
            });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'PATCH') {
        const { report_id, status, resolution_note, resolved_content_deleted } = req.body;
        if (!report_id || !status) return res.status(400).json({ error: 'report_id and status are required' });
        const validStatuses = ['reviewed', 'resolved', 'dismissed'];
        if (!validStatuses.includes(status))
            return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });

        const updates: any = { status, reviewed_by: user!.id, resolved_at: new Date().toISOString() };
        if (resolution_note !== undefined) updates.resolution_note = resolution_note;
        if (resolved_content_deleted !== undefined) updates.resolved_content_deleted = resolved_content_deleted;

        try {
            const { data, error } = await supabaseAdmin.from('reports')
                .update(updates).eq('id', report_id)
                .select(`*, reporter:profiles!reports_reporter_id_fkey(id, full_name, email)`).single();
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ report: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// GET|DELETE /admin/publications
export async function adminPublications(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!requireAdmin(user)) return res.status(403).json({ error: 'Se requieren permisos de administrador' });

    if (req.method === 'GET') {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 20;
            const search = req.query.search as string;
            const offset = (page - 1) * limit;

            let query = supabaseAdmin.from('publications')
                .select(`*, author:profiles!publications_user_id_fkey(id, full_name, avatar_url, email)`, { count: 'exact' })
                .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
            if (search) query = query.ilike('content', `%${search}%`);

            const { data, error, count } = await query;
            if (error) return res.status(400).json({ error: error.message });

            // Separate query for report counts (reports.target_id is TEXT, no FK, so join can't be inlined)
            const ids = (data || []).map(p => p.id);
            let reportCounts: Record<string, number> = {};
            if (ids.length > 0) {
                const { data: reps } = await supabaseAdmin
                    .from('reports')
                    .select('target_id')
                    .eq('report_type', 'publication')
                    .in('target_id', ids);
                reportCounts = (reps || []).reduce<Record<string, number>>((acc, r) => {
                    acc[r.target_id] = (acc[r.target_id] || 0) + 1;
                    return acc;
                }, {});
            }

            const publications = (data || []).map(p => ({
                ...p,
                reports: [{ count: reportCounts[p.id] || 0 }],
            }));

            return res.status(200).json({
                publications, pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
            });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'DELETE') {
        const { publication_id } = req.body;
        if (!publication_id) return res.status(400).json({ error: 'publication_id is required' });
        try {
            const { error } = await supabaseAdmin.from('publications').delete().eq('id', publication_id);
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ message: 'Publicación eliminada' });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// GET|PATCH /admin/professor-requests
export async function adminProfessorRequests(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!requireSudo(user)) return res.status(403).json({ error: 'Se requieren permisos de super administrador' });

    if (req.method === 'GET') {
        try {
            const status = req.query.status as string || 'pending';
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 20;
            const offset = (page - 1) * limit;

            const { data, error, count } = await supabaseAdmin.from('professor_requests')
                .select(`*, requester:profiles!professor_requests_requested_by_fkey(id, full_name, email), career:careers(id, name)`, { count: 'exact' })
                .eq('status', status).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({
                requests: data, pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
            });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'PATCH') {
        const { request_id, status, professor_name, department, career_id } = req.body;
        if (!request_id || !status) return res.status(400).json({ error: 'request_id and status are required' });
        if (!['approved', 'rejected'].includes(status))
            return res.status(400).json({ error: 'status must be approved or rejected' });

        try {
            const { data: request, error } = await supabaseAdmin.from('professor_requests')
                .update({ status, reviewed_by: user!.id }).eq('id', request_id).select().single();
            if (error) return res.status(400).json({ error: error.message });

            if (status === 'approved') {
                await supabaseAdmin.from('professors').insert({
                    full_name: professor_name || request.professor_name,
                    department: department || request.department,
                    career_id: career_id || request.career_id,
                    is_approved: true,
                });
            }
            return res.status(200).json({ request });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

async function sendNotificationEmails(userIds: string[], message: string) {
    const CHUNK = 50;
    for (let i = 0; i < userIds.length; i += CHUNK) {
        const chunk = userIds.slice(i, i + CHUNK);
        const { data: profiles } = await supabaseAdmin
            .from('profiles').select('email').in('id', chunk).eq('is_banned', false);
        await Promise.all(
            (profiles || []).map(p =>
                sendEmail(p.email, 'Notificación de PotroNET', notificationTemplate(message, ''))
            )
        );
    }
}

// GET|POST|PATCH|DELETE /admin/subjects
export async function adminSubjects(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!requireAdmin(user)) return res.status(403).json({ error: 'Se requieren permisos de administrador' });

    if (req.method === 'GET') {
        const career_id = req.query.career_id as string;
        if (!career_id) return res.status(400).json({ error: 'career_id is required' });
        try {
            const { data, error } = await supabaseAdmin.from('career_subjects').select('*')
                .eq('career_id', career_id).order('semester').order('name');
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ subjects: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'POST') {
        const { career_id, name, semester, credits } = req.body;
        if (!career_id || !name || !semester) return res.status(400).json({ error: 'career_id, name y semester son requeridos' });
        try {
            const { data, error } = await supabaseAdmin.from('career_subjects')
                .insert({ career_id, name: name.trim(), semester: Number(semester), credits: Number(credits) || 0 })
                .select().single();
            if (error) return res.status(400).json({ error: error.message });
            return res.status(201).json({ subject: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'PATCH') {
        const { id, name, semester, credits } = req.body;
        if (!id) return res.status(400).json({ error: 'id is required' });
        const updates: Record<string, unknown> = {};
        if (name !== undefined) updates.name = name.trim();
        if (semester !== undefined) updates.semester = Number(semester);
        if (credits !== undefined) updates.credits = Number(credits);
        if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No hay datos para actualizar' });
        try {
            const { data, error } = await supabaseAdmin.from('career_subjects').update(updates).eq('id', id).select().single();
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ subject: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'DELETE') {
        const id = req.query.id as string;
        if (!id) return res.status(400).json({ error: 'id is required' });
        try {
            const { error } = await supabaseAdmin.from('career_subjects').delete().eq('id', id);
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ success: true });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// GET|POST|PATCH|DELETE /admin/professors
export async function adminProfessors(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!requireAdmin(user)) return res.status(403).json({ error: 'Se requieren permisos de administrador' });

    if (req.method === 'GET') {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 30;
            const search = req.query.search as string;
            const offset = (page - 1) * limit;

            let query = supabaseAdmin.from('professors')
                .select(`*, career:careers(id, name)`, { count: 'exact' })
                .order('full_name').range(offset, offset + limit - 1);
            if (search) query = query.ilike('full_name', `%${search}%`);

            const { data, error, count } = await query;
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({
                professors: data,
                pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) },
            });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'POST') {
        const { full_name, email, department, career_id, is_approved } = req.body;
        if (!full_name?.trim()) return res.status(400).json({ error: 'full_name es requerido' });
        try {
            const { data, error } = await supabaseAdmin.from('professors').insert({
                full_name: full_name.trim(),
                email: email?.trim() || null,
                department: department?.trim() || null,
                career_id: career_id || null,
                is_approved: is_approved !== undefined ? !!is_approved : true,
            }).select(`*, career:careers(id, name)`).single();
            if (error) return res.status(400).json({ error: error.message });
            return res.status(201).json({ professor: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'PATCH') {
        const { id, full_name, email, department, career_id, is_approved } = req.body;
        if (!id) return res.status(400).json({ error: 'id es requerido' });
        const updates: Record<string, unknown> = {};
        if (full_name !== undefined) updates.full_name = String(full_name).trim();
        if (email !== undefined) updates.email = email ? String(email).trim() : null;
        if (department !== undefined) updates.department = department ? String(department).trim() : null;
        if (career_id !== undefined) updates.career_id = career_id || null;
        if (is_approved !== undefined) updates.is_approved = !!is_approved;
        if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No hay datos para actualizar' });
        try {
            const { data, error } = await supabaseAdmin.from('professors').update(updates).eq('id', id)
                .select(`*, career:careers(id, name)`).single();
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ professor: data });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    if (req.method === 'DELETE') {
        const id = (req.query.id as string | undefined) || (req.body?.id as string | undefined);
        if (!id) return res.status(400).json({ error: 'id es requerido' });
        try {
            const { error } = await supabaseAdmin.from('professors').delete().eq('id', id);
            if (error) return res.status(400).json({ error: error.message });
            return res.status(200).json({ success: true });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// GET|POST /admin/notifications
export async function adminNotifications(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    if (user.role !== 'sudo') return res.status(403).json({ error: 'Acceso denegado. Solo sudo puede enviar notificaciones globales.' });

    if (req.method === 'GET') {
        const { data, error } = await supabaseAdmin.from('notifications')
            .select('id, content, type, created_at').eq('type', 'system')
            .order('created_at', { ascending: false }).limit(30);
        if (error) return res.status(400).json({ error: error.message });

        const seen = new Set<string>();
        const unique = (data || []).filter(n => {
            const key = `${n.content}-${n.created_at.substring(0, 16)}`;
            if (seen.has(key)) return false;
            seen.add(key); return true;
        });
        return res.status(200).json({ notifications: unique });
    }

    if (req.method === 'POST') {
        const { message, target_type, career_id, user_id, user_email } = req.body;
        if (!message?.trim()) return res.status(400).json({ error: 'El mensaje es requerido' });
        if (!['global', 'career', 'user'].includes(target_type))
            return res.status(400).json({ error: 'target_type debe ser global, career o user' });

        try {
            let userIds: string[] = [];

            if (target_type === 'user') {
                let resolvedId = user_id as string | undefined;
                if (!resolvedId && user_email) {
                    const { data: profile } = await supabaseAdmin
                        .from('profiles').select('id').eq('email', String(user_email).toLowerCase()).maybeSingle();
                    if (!profile) return res.status(404).json({ error: 'Usuario no encontrado con ese correo' });
                    resolvedId = profile.id;
                }
                if (!resolvedId) return res.status(400).json({ error: 'user_id o user_email es requerido' });
                userIds = [resolvedId];
            } else if (target_type === 'career') {
                if (!career_id) return res.status(400).json({ error: 'career_id es requerido para target_type=career' });
                const { data } = await supabaseAdmin.from('profiles').select('id').eq('career_id', career_id).eq('is_banned', false);
                userIds = (data || []).map(p => p.id);
            } else {
                const { data } = await supabaseAdmin.from('profiles').select('id').eq('is_banned', false);
                userIds = (data || []).map(p => p.id);
            }

            if (userIds.length === 0) return res.status(200).json({ sent: 0, message: 'No hay usuarios en ese destino' });

            const notifications = userIds.map(uid => ({
                user_id: uid, type: 'system', title: message.trim(), body: '', content: message.trim(), is_read: false,
            }));

            const CHUNK = 500;
            for (let i = 0; i < notifications.length; i += CHUNK) {
                await supabaseAdmin.from('notifications').insert(notifications.slice(i, i + CHUNK));
            }

            // Enviar emails en background
            sendNotificationEmails(userIds, message.trim()).catch(() => {});

            // Enviar push en background
            sendPushToMany(userIds, 'system', {
                title: 'PotroNET',
                body: message.trim(),
                url: '/notifications',
            }).catch(() => {});

            return res.status(201).json({ sent: userIds.length });
        } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
