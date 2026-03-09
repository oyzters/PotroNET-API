import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Lazy singleton — evita crash al arrancar si las env vars no están disponibles aún
let _supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
    if (!_supabaseAdmin) {
        _supabaseAdmin = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
    }
    return _supabaseAdmin;
}

// Alias para compatibilidad con imports existentes (proxy object)
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        return (getSupabaseAdmin() as unknown as Record<string | symbol, unknown>)[prop];
    },
});

// Create a client with the user's JWT for RLS
export function createSupabaseClient(authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '');

    return createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
        {
            global: {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            },
        }
    );
}
