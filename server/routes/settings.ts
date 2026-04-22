import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../lib/auth';
import { createSupabaseClient } from '../lib/supabase';
import { getSupabaseAdmin } from '../lib/supabase';

// GET|PATCH /settings
export async function settingsIndex(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    if (req.method === 'GET') return settingsGet(req, res, user.id);
    if (req.method === 'PATCH') return settingsPatch(req, res, user.id);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function settingsGet(req: VercelRequest, res: VercelResponse, userId: string) {
    try {
        const supabase = createSupabaseClient(req.headers.authorization);
        const { data, error } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code === 'PGRST116') {
            // No row found — create default settings using admin client
            const admin = getSupabaseAdmin();
            const { data: created, error: insertErr } = await admin
                .from('user_settings')
                .insert({ user_id: userId })
                .select()
                .single();
            if (insertErr) return res.status(500).json({ error: insertErr.message });
            return res.status(200).json({ settings: created });
        }

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ settings: data });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function settingsPatch(req: VercelRequest, res: VercelResponse, userId: string) {
    const { notification_email, dm_privacy, theme, show_likes_to_owner } = req.body;

    try {
        const supabase = createSupabaseClient(req.headers.authorization);

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (typeof notification_email === 'boolean') updates.notification_email = notification_email;
        if (dm_privacy) updates.dm_privacy = dm_privacy;
        if (theme) updates.theme = theme;
        if (typeof show_likes_to_owner === 'boolean') updates.show_likes_to_owner = show_likes_to_owner;

        // Ensure row exists first (upsert via admin)
        const admin = getSupabaseAdmin();
        await admin
            .from('user_settings')
            .upsert({ user_id: userId }, { onConflict: 'user_id' });

        const { data, error } = await supabase
            .from('user_settings')
            .update(updates)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ settings: data });
    } catch {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
