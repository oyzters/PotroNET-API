import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../../lib/cors';
import { supabaseAdmin } from '../../lib/supabase';

const ALLOWED_DOMAIN = '@potros.itson.edu.mx';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, password, full_name } = req.body;

    if (!email || !password || !full_name) {
        return res.status(400).json({ error: 'Email, password and full_name are required' });
    }

    // Validate institutional email
    if (!email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
        return res.status(400).json({
            error: `Solo se permiten correos institucionales con dominio ${ALLOWED_DOMAIN}`,
        });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    try {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: email.toLowerCase(),
            password,
            email_confirm: true,
            user_metadata: { full_name },
        });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        // Explicitly create profile (backup in case DB trigger doesn't fire)
        await supabaseAdmin.from('profiles').upsert({
            id: data.user.id,
            email: data.user.email!,
            full_name,
        }, { onConflict: 'id' });

        return res.status(201).json({
            message: 'Cuenta creada exitosamente.',
            user: { id: data.user.id, email: data.user.email },
        });
    } catch (err) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
