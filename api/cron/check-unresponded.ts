import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../server/lib/supabase';
import { sendEmail } from '../../server/lib/email';
import { unrespondedMessageTemplate } from '../../server/lib/email-templates';

// Ejecutado por Vercel Cron diariamente a las 6 PM (ver vercel.json)
// Busca mensajes enviados hace 24-48h sin respuesta
export default async function handler(_req: VercelRequest, res: VercelResponse) {
    try {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

        const { data: candidates } = await supabaseAdmin
            .from('messages')
            .select(`
                id, content, created_at, sender_id, receiver_id,
                sender:profiles!messages_sender_id_fkey(full_name),
                receiver:profiles!messages_receiver_id_fkey(full_name, email)
            `)
            .gte('created_at', twoDaysAgo.toISOString())
            .lte('created_at', oneDayAgo.toISOString())
            .order('created_at', { ascending: false });

        if (!candidates?.length) return res.status(200).json({ checked: 0, reminded: 0 });

        // Deduplicar: solo enviar un recordatorio por receiver (el mensaje más reciente)
        const seen = new Set<string>();
        const unique = candidates.filter(msg => {
            if (seen.has(msg.receiver_id)) return false;
            seen.add(msg.receiver_id);
            return true;
        });

        let reminded = 0;

        for (const msg of unique) {
            const sender = msg.sender as unknown as { full_name: string } | null;
            const receiver = msg.receiver as unknown as { full_name: string; email: string } | null;

            if (!receiver?.email) continue;

            // Verificar si el receiver respondió después de este mensaje
            const { count } = await supabaseAdmin
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('sender_id', msg.receiver_id)
                .eq('receiver_id', msg.sender_id)
                .gte('created_at', msg.created_at);

            if (count === 0) {
                const senderName = sender?.full_name || 'Alguien';
                const preview = msg.content.length > 120 ? msg.content.slice(0, 120) + '...' : msg.content;
                const hoursAgo = Math.round((now.getTime() - new Date(msg.created_at).getTime()) / (60 * 60 * 1000));

                await sendEmail(
                    receiver.email,
                    `Tienes un mensaje sin responder de ${senderName}`,
                    unrespondedMessageTemplate(senderName, preview, hoursAgo)
                );
                reminded++;
            }
        }

        return res.status(200).json({ checked: candidates.length, reminded });
    } catch (err) {
        console.error('[cron] check-unresponded error:', err);
        return res.status(500).json({ error: 'Error en cron' });
    }
}
