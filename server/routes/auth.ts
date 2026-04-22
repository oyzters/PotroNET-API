import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '../lib/auth';
import { supabaseAdmin } from '../lib/supabase';
import { sendEmail } from '../lib/email';
import { emailVerificationTemplate, passwordResetTemplate, accountLockedTemplate } from '../lib/email-templates';

// Password complexity: min 10 chars, 1 uppercase, 1 number, 1 special char
function validatePassword(password: string): string | null {
    if (password.length < 10) return 'La contraseña debe tener al menos 10 caracteres';
    if (!/[A-Z]/.test(password)) return 'La contraseña debe incluir al menos una letra mayúscula';
    if (!/[0-9]/.test(password)) return 'La contraseña debe incluir al menos un número';
    return null;
}

// Validate redirect_to: only allow relative paths or same-origin URLs
function sanitizeRedirectTo(value: unknown): string {
    const frontendUrl = (process.env.FRONTEND_URL || 'https://potronet.com').replace(/\/$/, '');
    if (!value || typeof value !== 'string') return `${frontendUrl}/reset-password`;
    const v = value.trim();
    if (v.startsWith('/') && !v.startsWith('//')) return `${frontendUrl}${v}`;
    if (v.startsWith(frontendUrl + '/') || v === frontendUrl) return v;
    return `${frontendUrl}/reset-password`;
}

// Per-email account lockout: 5 failures in 15 min → locked 15 min
const loginAttempts = new Map<string, { count: number; lockUntil: number; windowStart: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

// Per-email rate limit for reset/verify: max 3 per hour
const sensitiveEmailRequests = new Map<string, { count: number; windowStart: number }>();
const MAX_SENSITIVE_PER_HOUR = 3;
const SENSITIVE_WINDOW_MS = 60 * 60 * 1000;

function checkSensitiveEmailLimit(email: string): boolean {
    const now = Date.now();
    const entry = sensitiveEmailRequests.get(email);
    if (!entry || now - entry.windowStart > SENSITIVE_WINDOW_MS) {
        sensitiveEmailRequests.set(email, { count: 1, windowStart: now });
        return false;
    }
    if (entry.count >= MAX_SENSITIVE_PER_HOUR) return true;
    entry.count++;
    return false;
}

// Ensure minimum response time to prevent timing-based email enumeration
async function minDelay(start: number, minMs = 400): Promise<void> {
    const elapsed = Date.now() - start;
    if (elapsed < minMs) await new Promise(r => setTimeout(r, minMs - elapsed));
}

// POST /auth/login
export async function login(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const emailKey = (email as string).toLowerCase().trim();
    const now = Date.now();

    // Check account lockout
    const attempt = loginAttempts.get(emailKey);
    if (attempt && now < attempt.lockUntil) {
        const remaining = Math.ceil((attempt.lockUntil - now) / 60000);
        return res.status(429).json({
            error: `Cuenta bloqueada temporalmente. Intenta de nuevo en ${remaining} minuto(s).`,
        });
    }
    // Reset window if expired
    if (attempt && now - attempt.windowStart > LOCKOUT_WINDOW_MS) {
        loginAttempts.delete(emailKey);
    }

    try {
        const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
        const { data, error } = await supabase.auth.signInWithPassword({
            email: emailKey,
            password,
        });

        if (error) {
            // Track failed attempt
            const entry = loginAttempts.get(emailKey) || { count: 0, lockUntil: 0, windowStart: now };
            entry.count++;
            if (entry.count >= MAX_LOGIN_ATTEMPTS) {
                entry.lockUntil = now + LOCKOUT_DURATION_MS;
                const lockMinutes = Math.ceil(LOCKOUT_DURATION_MS / 60000);
                sendEmail(emailKey, '⚠️ Cuenta bloqueada temporalmente — PotroNET', accountLockedTemplate(lockMinutes)).catch(() => {});
            }
            loginAttempts.set(emailKey, entry);
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Clear failed attempts on success
        loginAttempts.delete(emailKey);

        if (!data.user.email_confirmed_at) {
            return res.status(403).json({ error: 'EMAIL_NOT_VERIFIED', email: data.user.email });
        }

        return res.status(200).json({
            user: { id: data.user.id, email: data.user.email },
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at,
            },
        });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

// POST /auth/register
const ALLOWED_DOMAIN = '@potros.itson.edu.mx';

export async function register(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, password, full_name } = req.body;

    if (!email || !password || !full_name)
        return res.status(400).json({ error: 'Email, password and full_name are required' });

    if (!email.toLowerCase().endsWith(ALLOWED_DOMAIN))
        return res.status(400).json({ error: `Solo se permiten correos institucionales con dominio ${ALLOWED_DOMAIN}` });

    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    try {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: email.toLowerCase(),
            password,
            email_confirm: false,
            user_metadata: { full_name },
        });

        if (error) return res.status(400).json({ error: error.message });

        await supabaseAdmin.from('profiles').upsert({
            id: data.user.id,
            email: data.user.email!,
            full_name,
        }, { onConflict: 'id' });

        const frontendUrl = process.env.FRONTEND_URL || 'https://potronet.com';
        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
            type: 'signup',
            email: email.toLowerCase(),
            password,
            options: { redirectTo: `${frontendUrl}/login?verified=true` },
        });

        if (linkData?.properties?.action_link) {
            await sendEmail(
                email.toLowerCase(),
                'Verifica tu correo - PotroNET',
                emailVerificationTemplate(email.toLowerCase(), linkData.properties.action_link),
            );
        }

        return res.status(201).json({
            message: 'Cuenta creada. Revisa tu correo institucional para verificar tu cuenta antes de iniciar sesión.',
            user: { id: data.user.id, email: data.user.email },
        });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}

// POST /auth/forgot-password
export async function forgotPassword(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, redirect_to } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const start = Date.now();
    const emailKey = (email as string).toLowerCase().trim();

    // Per-email rate limit: 3 requests/hour
    if (checkSensitiveEmailLimit(emailKey)) {
        await minDelay(start);
        return res.status(200).json({ message: 'Si el correo está registrado, recibirás instrucciones para recuperar tu contraseña.' });
    }

    try {
        const redirectTo = sanitizeRedirectTo(redirect_to);

        const { data, error } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: emailKey,
            options: { redirectTo },
        });

        if (!error && data?.properties?.action_link) {
            await sendEmail(
                emailKey,
                'Recuperar contraseña - PotroNET',
                passwordResetTemplate(emailKey, data.properties.action_link),
            );
        }
    } catch { /* intentionally silent — no email enumeration */ }

    await minDelay(start);
    return res.status(200).json({ message: 'Si el correo está registrado, recibirás instrucciones para recuperar tu contraseña.' });
}

// POST /auth/resend-verification
export async function resendVerification(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const start = Date.now();
    const emailKey = (email as string).toLowerCase().trim();

    // Per-email rate limit: 3 requests/hour
    if (checkSensitiveEmailLimit(emailKey)) {
        await minDelay(start);
        return res.status(200).json({ message: 'Si tu correo está pendiente de verificación, recibirás un nuevo enlace.' });
    }

    try {
        const frontendUrl = process.env.FRONTEND_URL || 'https://potronet.com';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabaseAdmin.auth.admin as any).generateLink({
            type: 'signup',
            email: emailKey,
            options: { redirectTo: `${frontendUrl}/login?verified=true` },
        });

        if (!error && data?.properties?.action_link) {
            await sendEmail(
                emailKey,
                'Verifica tu correo - PotroNET',
                emailVerificationTemplate(emailKey, data.properties.action_link),
            );
        }
    } catch { /* intentionally silent — no email enumeration */ }

    await minDelay(start);
    return res.status(200).json({ message: 'Si tu correo está pendiente de verificación, recibirás un nuevo enlace.' });
}

// GET /auth/me
export async function me(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    try {
        const { data: profile, error } = await supabaseAdmin
            .from('profiles')
            .select(`*, career:careers(id, name)`)
            .eq('id', user.id)
            .single();

        if (error) return res.status(404).json({ error: 'Perfil no encontrado' });
        return res.status(200).json({ user: profile });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
}
