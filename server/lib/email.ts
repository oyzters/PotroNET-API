import { Resend } from 'resend';

// Configura RESEND_FROM en tu .env cuando tengas dominio verificado
// Ejemplo: RESEND_FROM=PotroNET <noreply@potronet.app>
// Sin dominio propio Resend solo permite enviar a la dirección del dueño de la cuenta
const FROM = process.env.RESEND_FROM || 'PotroNET <onboarding@resend.dev>';

let resend: Resend | null = null;
let warnedMissingKey = false;

function getClient(): Resend | null {
    if (resend) return resend;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        if (!warnedMissingKey) {
            console.warn('[Email] RESEND_API_KEY not configured — emails will not be sent');
            warnedMissingKey = true;
        }
        return null;
    }
    resend = new Resend(apiKey);
    return resend;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
    const client = getClient();
    if (!client) return;
    try {
        await client.emails.send({ from: FROM, to, subject, html });
    } catch (err) {
        console.error('[email] Error sending to', to, err);
    }
}
