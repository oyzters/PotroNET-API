import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { getAuthUser, requireAdmin } from '../../lib/auth';
import { supabaseAdmin } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    const user = await getAuthUser(req);
    if (!requireAdmin(user)) {
        return res.status(403).json({ error: 'Se requieren permisos de administrador' });
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const [usersResult, pubsResult, careersResult, professorsResult, tutoringResult, resourcesResult, pendingReportsResult] = await Promise.all([
            supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('publications').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('careers').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('professors').select('*', { count: 'exact', head: true }).eq('is_approved', true),
            supabaseAdmin.from('tutoring_offers').select('*', { count: 'exact', head: true }).eq('is_active', true),
            supabaseAdmin.from('resources').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        ]);

        // Users by role
        const [usersByRole, bannedUsers, recentUsers] = await Promise.all([
            supabaseAdmin.from('profiles').select('role'),
            supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('is_banned', true),
            supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true })
                .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        ]);

        const roleCounts = { user: 0, admin: 0, sudo: 0 };
        usersByRole.data?.forEach((p: { role: string }) => {
            if (p.role in roleCounts) roleCounts[p.role as keyof typeof roleCounts]++;
        });

        return res.status(200).json({
            stats: {
                totalUsers: usersResult.count || 0,
                totalPublications: pubsResult.count || 0,
                totalCareers: careersResult.count || 0,
                totalProfessors: professorsResult.count || 0,
                totalTutoring: tutoringResult.count || 0,
                totalResources: resourcesResult.count || 0,
                pendingReports: pendingReportsResult.count || 0,
                bannedUsers: bannedUsers.count || 0,
                newUsersThisWeek: recentUsers.count || 0,
                usersByRole: roleCounts,
            },
        });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
