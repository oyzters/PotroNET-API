import webpush from 'web-push';
import { getSupabaseAdmin } from './supabase';

export type PushType =
    | 'follow'
    | 'friend_request'
    | 'message'
    | 'like'
    | 'comment'
    | 'tutoring'
    | 'system'
    | 'moderation'
    | 'warning';

const TYPE_TO_PREF: Record<PushType, string> = {
    follow: 'push_follows',
    friend_request: 'push_follows',
    message: 'push_messages',
    like: 'push_likes',
    comment: 'push_comments',
    tutoring: 'push_tutoring',
    system: 'push_system',
    moderation: 'push_moderation',
    warning: 'push_moderation',
};

export interface PushPayload {
    title: string;
    body?: string;
    url?: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: Record<string, unknown>;
}

let vapidConfigured = false;

function ensureVapid(): boolean {
    if (vapidConfigured) return true;
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:soporte@potronet.com';
    if (!publicKey || !privateKey) {
        console.warn('[push] VAPID keys not configured — skipping push');
        return false;
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    return true;
}

export function getVapidPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
}

export async function sendPush(
    userId: string,
    type: PushType,
    payload: PushPayload
): Promise<void> {
    if (!ensureVapid()) return;

    const admin = getSupabaseAdmin();

    const { data: settings } = await admin
        .from('user_settings')
        .select('push_enabled, push_follows, push_messages, push_likes, push_comments, push_tutoring, push_system, push_moderation')
        .eq('user_id', userId)
        .single();

    if (settings) {
        if (settings.push_enabled === false) return;
        const prefKey = TYPE_TO_PREF[type];
        if (prefKey && (settings as Record<string, boolean>)[prefKey] === false) return;
    }

    const { data: subs } = await admin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', userId);

    if (!subs || subs.length === 0) return;

    const body = JSON.stringify({
        title: payload.title,
        body: payload.body || '',
        url: payload.url || '/',
        icon: payload.icon || '/potronet.png',
        badge: payload.badge || '/favicon.png',
        tag: payload.tag || type,
        data: payload.data || {},
    });

    const expiredIds: string[] = [];

    await Promise.all(
        subs.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth },
                    },
                    body
                );
            } catch (err) {
                const statusCode = (err as { statusCode?: number })?.statusCode;
                if (statusCode === 404 || statusCode === 410) {
                    expiredIds.push(sub.id);
                } else {
                    console.error('[push] send error', statusCode, err);
                }
            }
        })
    );

    if (expiredIds.length > 0) {
        await admin.from('push_subscriptions').delete().in('id', expiredIds);
    }
}

export async function sendPushToMany(
    userIds: string[],
    type: PushType,
    payload: PushPayload
): Promise<void> {
    await Promise.all(userIds.map((uid) => sendPush(uid, type, payload)));
}
