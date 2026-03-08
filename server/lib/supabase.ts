import { createClient } from '@supabase/supabase-js';

// Admin client with service role key (for server-side operations)
export const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
