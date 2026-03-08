import type { VercelRequest } from '@vercel/node';
import { createSupabaseClient, supabaseAdmin } from './supabase';

export interface AuthUser {
    id: string;
    email: string;
    role: string;
}

export async function getAuthUser(req: VercelRequest): Promise<AuthUser | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;

    const supabase = createSupabaseClient(authHeader);
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) return null;

    // Get profile to check role (use admin to bypass RLS)
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    return {
        id: user.id,
        email: user.email!,
        role: profile?.role || 'user',
    };
}

export function requireAuth(user: AuthUser | null): user is AuthUser {
    return user !== null;
}

export function requireAdmin(user: AuthUser | null): boolean {
    return user !== null && (user.role === 'admin' || user.role === 'sudo');
}

export function requireSudo(user: AuthUser | null): boolean {
    return user !== null && user.role === 'sudo';
}
