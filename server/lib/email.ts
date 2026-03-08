import { Resend } from 'resend';

// Sin dominio propio Resend solo permite enviar desde onboarding@resend.dev
// Cuando tengas dominio verificado cambia esto a: noreply@tudominio.com
const FROM = 'PotroNET <onboarding@resend.dev>';

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;
    try {
        // Inicializar dentro de la función para evitar crash si la env var no está configurada
        const resend = new Resend(apiKey);
        await resend.emails.send({ from: FROM, to, subject, html });
    } catch (err) {
        console.error('[email] Error sending to', to, err);
    }
}
