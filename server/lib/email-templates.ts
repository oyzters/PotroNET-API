const BASE_URL = 'https://potronet.com';

/** Escapa caracteres HTML para prevenir XSS en templates de email */
function esc(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const wrapper = (content: string) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>PotroNET</title>
</head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#1a1a1a;border-radius:16px;border:1px solid #2a2a2a;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="padding:28px 32px;border-bottom:1px solid #2a2a2a;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="display:inline-flex;align-items:center;gap:10px;">
                    <div style="width:32px;height:32px;background:#6d28d9;border-radius:8px;display:inline-block;text-align:center;line-height:32px;color:#fff;font-weight:700;font-size:14px;">P</div>
                    <span style="color:#ffffff;font-size:18px;font-weight:700;margin-left:10px;">PotroNET</span>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Content -->
        <tr><td style="padding:32px;">${content}</td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2a2a2a;text-align:center;">
            <p style="margin:0;color:#555;font-size:12px;">
              PotroNET © ${new Date().getFullYear()} · ITSON<br/>
              <a href="${BASE_URL}" style="color:#6d28d9;text-decoration:none;">Abrir PotroNET</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

export function firstMessageTemplate(senderName: string, messagePreview: string): string {
    return wrapper(`
        <h2 style="margin:0 0 8px;color:#ffffff;font-size:20px;">Tienes un nuevo mensaje 💬</h2>
        <p style="margin:0 0 24px;color:#888;font-size:14px;">Alguien te escribió por primera vez en PotroNET</p>

        <div style="background:#222;border-radius:12px;padding:20px;margin-bottom:24px;border-left:3px solid #6d28d9;">
          <p style="margin:0 0 6px;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">De</p>
          <p style="margin:0 0 12px;color:#fff;font-size:16px;font-weight:600;">${esc(senderName)}</p>
          <p style="margin:0;color:#ccc;font-size:14px;line-height:1.5;">"${esc(messagePreview)}"</p>
        </div>

        <a href="${BASE_URL}/messages" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Responder mensaje
        </a>
    `);
}

export function firstMessageOfDayTemplate(senderName: string, messagePreview: string): string {
    const safe = esc(senderName);
    return wrapper(`
        <h2 style="margin:0 0 8px;color:#ffffff;font-size:20px;">Tienes mensajes de hoy 📬</h2>
        <p style="margin:0 0 24px;color:#888;font-size:14px;">${safe} te escribió hoy en PotroNET</p>

        <div style="background:#222;border-radius:12px;padding:20px;margin-bottom:24px;border-left:3px solid #f59e0b;">
          <p style="margin:0 0 6px;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Último mensaje de ${safe}</p>
          <p style="margin:0;color:#ccc;font-size:14px;line-height:1.5;">"${esc(messagePreview)}"</p>
        </div>

        <a href="${BASE_URL}/messages" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Ver mensajes
        </a>
    `);
}

export function unrespondedMessageTemplate(senderName: string, messagePreview: string, hoursAgo: number): string {
    return wrapper(`
        <h2 style="margin:0 0 8px;color:#ffffff;font-size:20px;">Tienes un mensaje sin responder ⏰</h2>
        <p style="margin:0 0 24px;color:#888;font-size:14px;">Hace ${hoursAgo} hora${hoursAgo !== 1 ? 's' : ''}, ${esc(senderName)} te envió un mensaje</p>

        <div style="background:#222;border-radius:12px;padding:20px;margin-bottom:24px;border-left:3px solid #ef4444;">
          <p style="margin:0 0 6px;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Mensaje pendiente</p>
          <p style="margin:0;color:#ccc;font-size:14px;line-height:1.5;">"${esc(messagePreview)}"</p>
        </div>

        <a href="${BASE_URL}/messages" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Responder ahora
        </a>
    `);
}

export function notificationTemplate(title: string, body: string): string {
    return wrapper(`
        <h2 style="margin:0 0 8px;color:#ffffff;font-size:20px;">Nueva notificación 🔔</h2>
        <p style="margin:0 0 24px;color:#888;font-size:14px;">Tienes una notificación en PotroNET</p>

        <div style="background:#222;border-radius:12px;padding:20px;margin-bottom:24px;border-left:3px solid #6d28d9;">
          <p style="margin:0 0 8px;color:#fff;font-size:15px;font-weight:600;">${esc(title)}</p>
          ${body ? `<p style="margin:0;color:#ccc;font-size:14px;line-height:1.5;">${esc(body)}</p>` : ''}
        </div>

        <a href="${BASE_URL}/notifications" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Ver notificaciones
        </a>
    `);
}

export function friendRequestTemplate(senderName: string): string {
    return wrapper(`
        <h2 style="margin:0 0 8px;color:#ffffff;font-size:20px;">Nueva solicitud de amistad 🤝</h2>
        <p style="margin:0 0 24px;color:#888;font-size:14px;">Tienes una nueva solicitud en PotroNET</p>

        <div style="background:#222;border-radius:12px;padding:20px;margin-bottom:24px;border-left:3px solid #6d28d9;">
          <p style="margin:0 0 8px;color:#fff;font-size:15px;font-weight:600;">${esc(senderName)} quiere conectar contigo.</p>
        </div>

        <a href="${BASE_URL}/friends" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Revisar solicitud
        </a>
    `);
}

export function warningTemplate(category: string, message: string): string {
    const CATEGORY_LABELS: Record<string, string> = {
        spam: 'Spam',
        acoso: 'Acoso o bullying',
        contenido_sexual: 'Contenido sexual inapropiado',
        violencia: 'Violencia o amenazas',
        informacion_falsa: 'Información falsa',
        odio: 'Discurso de odio',
        otro: 'Violación a las normas de la comunidad',
    };
    const label = CATEGORY_LABELS[category] || 'Violación a las normas';
    return wrapper(`
        <h2 style="margin:0 0 8px;color:#f59e0b;font-size:20px;">⚠️ Has recibido una advertencia</h2>
        <p style="margin:0 0 24px;color:#888;font-size:14px;">El equipo de moderación de PotroNET ha revisado tu actividad</p>

        <div style="background:#2d2000;border-radius:12px;padding:20px;margin-bottom:24px;border-left:3px solid #f59e0b;">
          <p style="margin:0 0 6px;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Categoría</p>
          <p style="margin:0 0 12px;color:#f59e0b;font-size:15px;font-weight:600;">${esc(label)}</p>
          <p style="margin:0 0 6px;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Mensaje del moderador</p>
          <p style="margin:0;color:#ccc;font-size:14px;line-height:1.5;">${esc(message)}</p>
        </div>

        <p style="margin:0 0 20px;color:#888;font-size:13px;line-height:1.6;">
          Las advertencias reiteradas pueden resultar en la suspensión de tu cuenta. 
          Te pedimos que revises las <a href="${BASE_URL}/guidelines" style="color:#6d28d9;">Normas de la Comunidad</a> de PotroNET.
        </p>

        <a href="${BASE_URL}/notifications" style="display:inline-block;background:#f59e0b;color:#000;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Ver mis notificaciones
        </a>
    `);
}

export function contentRemovedTemplate(reason: string, category: string): string {
    const CATEGORY_LABELS: Record<string, string> = {
        spam: 'Spam',
        acoso: 'Acoso o bullying',
        contenido_sexual: 'Contenido sexual inapropiado',
        violencia: 'Violencia o amenazas',
        informacion_falsa: 'Información falsa',
        odio: 'Discurso de odio',
        otro: 'Violación a las normas',
    };
    const label = CATEGORY_LABELS[category] || 'Violación a las normas';
    return wrapper(`
        <h2 style="margin:0 0 8px;color:#ef4444;font-size:20px;">🗑️ Tu publicación fue eliminada</h2>
        <p style="margin:0 0 24px;color:#888;font-size:14px;">Un moderador de PotroNET eliminó una de tus publicaciones</p>

        <div style="background:#2d0000;border-radius:12px;padding:20px;margin-bottom:24px;border-left:3px solid #ef4444;">
          <p style="margin:0 0 6px;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Motivo</p>
          <p style="margin:0 0 12px;color:#ef4444;font-size:15px;font-weight:600;">${esc(label)}</p>
          ${reason ? `<p style="margin:0 0 6px;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Nota adicional</p>
          <p style="margin:0;color:#ccc;font-size:14px;line-height:1.5;">${esc(reason)}</p>` : ''}
        </div>

        <p style="margin:0 0 20px;color:#888;font-size:13px;line-height:1.6;">
          Si crees que esto fue un error, puedes contactar al soporte. 
          Recuerda revisar las <a href="${BASE_URL}/guidelines" style="color:#6d28d9;">Normas de la Comunidad</a>.
        </p>

        <a href="${BASE_URL}/feed" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Volver al Feed
        </a>
    `);
}
