const BASE_URL = 'https://potronet.vercel.app';

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
          <p style="margin:0 0 12px;color:#fff;font-size:16px;font-weight:600;">${senderName}</p>
          <p style="margin:0;color:#ccc;font-size:14px;line-height:1.5;">"${messagePreview}"</p>
        </div>

        <a href="${BASE_URL}/messages" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Responder mensaje
        </a>
    `);
}

export function firstMessageOfDayTemplate(senderName: string, messagePreview: string): string {
    return wrapper(`
        <h2 style="margin:0 0 8px;color:#ffffff;font-size:20px;">Tienes mensajes de hoy 📬</h2>
        <p style="margin:0 0 24px;color:#888;font-size:14px;">${senderName} te escribió hoy en PotroNET</p>

        <div style="background:#222;border-radius:12px;padding:20px;margin-bottom:24px;border-left:3px solid #f59e0b;">
          <p style="margin:0 0 6px;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Último mensaje de ${senderName}</p>
          <p style="margin:0;color:#ccc;font-size:14px;line-height:1.5;">"${messagePreview}"</p>
        </div>

        <a href="${BASE_URL}/messages" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Ver mensajes
        </a>
    `);
}

export function unrespondedMessageTemplate(senderName: string, messagePreview: string, hoursAgo: number): string {
    return wrapper(`
        <h2 style="margin:0 0 8px;color:#ffffff;font-size:20px;">Tienes un mensaje sin responder ⏰</h2>
        <p style="margin:0 0 24px;color:#888;font-size:14px;">Hace ${hoursAgo} hora${hoursAgo !== 1 ? 's' : ''}, ${senderName} te envió un mensaje</p>

        <div style="background:#222;border-radius:12px;padding:20px;margin-bottom:24px;border-left:3px solid #ef4444;">
          <p style="margin:0 0 6px;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Mensaje pendiente</p>
          <p style="margin:0;color:#ccc;font-size:14px;line-height:1.5;">"${messagePreview}"</p>
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
          <p style="margin:0 0 8px;color:#fff;font-size:15px;font-weight:600;">${title}</p>
          ${body ? `<p style="margin:0;color:#ccc;font-size:14px;line-height:1.5;">${body}</p>` : ''}
        </div>

        <a href="${BASE_URL}/notifications" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Ver notificaciones
        </a>
    `);
}
