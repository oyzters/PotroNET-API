import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Sin dominio propio Resend solo permite enviar desde onboarding@resend.dev
// Cuando tengas dominio verificado cambia esto a: noreply@tudominio.com
const FROM = 'PotroNET <onboarding@resend.dev>';

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!process.env.RESEND_API_KEY) return;
    try {
        await resend.emails.send({ from: FROM, to, subject, html });
    } catch (err) {
        console.error('[email] Error sending to', to, err);
    }
}
