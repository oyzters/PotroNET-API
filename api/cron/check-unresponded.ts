import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../server/lib/supabase';
import { sendEmail } from '../../server/lib/email';
import { unrespondedMessageTemplate } from '../../server/lib/email-templates';

// Ejecutado por Vercel Cron cada 15 minutos
// Busca mensajes enviados hace entre 60 y 75 minutos sin respuesta
export default async function handler(_req: VercelRequest, res: VercelResponse) {
    try {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const oneHour15Ago = new Date(now.getTime() - 75 * 60 * 1000);

        // Mensajes enviados en la ventana de 60-75 min atrás
        const { data: candidates } = await supabaseAdmin
            .from('messages')
            .select(`
                id, content, created_at, sender_id, receiver_id,
                sender:profiles!messages_sender_id_fkey(full_name),
                receiver:profiles!messages_receiver_id_fkey(full_name, email)
            `)
            .gte('created_at', oneHour15Ago.toISOString())
            .lte('created_at', oneHourAgo.toISOString());

        if (!candidates?.length) return res.status(200).json({ checked: 0, reminded: 0 });

        let reminded = 0;

        await Promise.all(candidates.map(async (msg) => {
            const sender = msg.sender as unknown as { full_name: string } | null;
            const receiver = msg.receiver as unknown as { full_name: string; email: string } | null;

            if (!receiver?.email) return;

            // Verificar si el receiver respondió después de este mensaje
            const { count } = await supabaseAdmin
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('sender_id', msg.receiver_id)
                .eq('receiver_id', msg.sender_id)
                .gte('created_at', msg.created_at);

            if (count === 0) {
                const senderName = sender?.full_name || 'Alguien';
                const preview = msg.content.length > 120 ? msg.content.slice(0, 120) + '…' : msg.content;
                const hoursAgo = Math.round((now.getTime() - new Date(msg.created_at).getTime()) / (60 * 60 * 1000));

                await sendEmail(
                    receiver.email,
                    `Tienes un mensaje sin responder de ${senderName}`,
                    unrespondedMessageTemplate(senderName, preview, hoursAgo)
                );
                reminded++;
            }
        }));

        return res.status(200).json({ checked: candidates.length, reminded });
    } catch (err) {
        console.error('[cron] check-unresponded error:', err);
        return res.status(500).json({ error: 'Error en cron' });
    }
}
