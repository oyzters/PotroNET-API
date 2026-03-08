import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '../lib/auth';
import { supabaseAdmin } from '../lib/supabase';

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
            email_confirm: true,
            user_metadata: { full_name },
        });

        if (error) return res.status(400).json({ error: error.message });

        await supabaseAdmin.from('profiles').upsert({
            id: data.user.id,
            email: data.user.email!,
            full_name,
        }, { onConflict: 'id' });

        return res.status(201).json({
            message: 'Cuenta creada exitosamente.',
            user: { id: data.user.id, email: data.user.email },
        });
    } catch { return res.status(500).json({ error: 'Error interno del servidor' }); }
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
