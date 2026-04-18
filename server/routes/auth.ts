import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '../lib/auth';
import { supabaseAdmin } from '../lib/supabase';
import { sendEmail } from '../lib/email';
import { emailVerificationTemplate, passwordResetTemplate } from '../lib/email-templates';

// POST /auth/login
export async function login(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    try {
        const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.toLowerCase(),
            password,
        });

        if (error) return res.status(401).json({ error: 'Credenciales inválidas' });

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

    if (password.length < 6)
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

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

    try {
        const frontendUrl = process.env.FRONTEND_URL || 'https://potronet.com';
        const redirectTo = redirect_to || `${frontendUrl}/reset-password`;

        const { data, error } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: email.toLowerCase(),
            options: { redirectTo },
        });

        if (error) {
            console.error('[forgotPassword] generateLink error:', error);
        } else if (data?.properties?.action_link) {
            await sendEmail(
                email.toLowerCase(),
                'Recuperar contraseña - PotroNET',
                passwordResetTemplate(email.toLowerCase(), data.properties.action_link),
            );
        } else {
            console.warn('[forgotPassword] no action_link returned for', email);
        }
    } catch (err) { console.error('[forgotPassword] unexpected error:', err); }

    return res.status(200).json({ message: 'Si el correo está registrado, recibirás instrucciones para recuperar tu contraseña.' });
}

// POST /auth/resend-verification
export async function resendVerification(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    try {
        const frontendUrl = process.env.FRONTEND_URL || 'https://potronet.com';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabaseAdmin.auth.admin as any).generateLink({
            type: 'signup',
            email: email.toLowerCase(),
            options: { redirectTo: `${frontendUrl}/login?verified=true` },
        });

        if (error) {
            console.error('[resendVerification] generateLink error:', error);
        } else if (data?.properties?.action_link) {
            await sendEmail(
                email.toLowerCase(),
                'Verifica tu correo - PotroNET',
                emailVerificationTemplate(email.toLowerCase(), data.properties.action_link),
            );
        } else {
            console.warn('[resendVerification] no action_link returned for', email);
        }
    } catch (err) { console.error('[resendVerification] unexpected error:', err); }

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
