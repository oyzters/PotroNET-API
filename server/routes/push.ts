import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../lib/auth';
import { getSupabaseAdmin } from '../lib/supabase';
import { getVapidPublicKey } from '../lib/push';

// GET /push/public-key — returns VAPID public key for the frontend subscribe flow
export async function pushPublicKey(_req: VercelRequest, res: VercelResponse) {
    const key = getVapidPublicKey();
    if (!key) return res.status(503).json({ error: 'Push not configured' });
    return res.status(200).json({ key });
}

// POST|DELETE /push/subscribe
export async function pushSubscribe(req: VercelRequest, res: VercelResponse) {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const admin = getSupabaseAdmin();

    if (req.method === 'POST') {
        const { endpoint, keys } = req.body ?? {};
        const p256dh = keys?.p256dh;
        const auth = keys?.auth;

        if (!endpoint || !p256dh || !auth) {
            return res.status(400).json({ error: 'endpoint, keys.p256dh y keys.auth son requeridos' });
        }

        const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;

        const { error } = await admin
            .from('push_subscriptions')
            .upsert(
                {
                    user_id: user.id,
                    endpoint,
                    p256dh,
                    auth,
                    user_agent: userAgent,
                    last_used_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,endpoint' }
            );

        if (error) return res.status(400).json({ error: error.message });
        return res.status(201).json({ ok: true });
    }

    if (req.method === 'DELETE') {
        const endpoint = (req.body?.endpoint as string | undefined) ?? (req.query.endpoint as string | undefined);
        if (!endpoint) return res.status(400).json({ error: 'endpoint requerido' });

        const { error } = await admin
            .from('push_subscriptions')
            .delete()
            .eq('user_id', user.id)
            .eq('endpoint', endpoint);

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
