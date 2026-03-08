// Content moderation utilities for publications
// Checks for profanity, links, and ASCII art

const PROFANITY_LIST = [
    // Spanish profanity
    'puta', 'puto', 'mierda', 'chinga', 'chingada', 'chingado', 'pendejo', 'pendeja',
    'cabron', 'cabrón', 'cabrona', 'pinche', 'verga', 'culero', 'culera', 'mamadas',
    'joder', 'coño', 'hostia', 'cabrón', 'imbécil', 'gilipollas', 'idiota', 'estupido',
    'estúpido', 'culo', 'polla', 'coger', 'follar', 'marica', 'maricón', 'pdeofilia',
    'suicidio', 'marijuana', 'cocaina', 'heroina', 'droga', 'narco',
    // English profanity
    'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'pussy', 'cunt', 'nigger',
    'faggot', 'whore', 'slut', 'motherfucker', 'damn', 'crap',
];

const URL_REGEX = /(?:https?:\/\/|www\.|ftp:\/\/)[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|edu|mx|io|co|app|dev|xyz)\b/gi;

function isAsciiArt(text: string): boolean {
    const lines = text.split('\n');
    let suspiciousLines = 0;

    for (const line of lines) {
        if (line.length < 5) continue;
        const specialChars = (line.match(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ0-9\s,.!?;:'"()]/g) || []).length;
        if (specialChars / line.length > 0.5) suspiciousLines++;
    }

    return suspiciousLines >= 3;
}

export interface ModerationResult {
    valid: boolean;
    reason?: string;
}

export function validateContent(text: string): ModerationResult {
    if (!text || !text.trim()) {
        return { valid: false, reason: 'El contenido no puede estar vacío' };
    }

    const lower = text.toLowerCase();

    // Check profanity
    for (const word of PROFANITY_LIST) {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(lower)) {
            return { valid: false, reason: 'El contenido contiene lenguaje inapropiado' };
        }
    }

    // Check URLs/links
    if (URL_REGEX.test(text)) {
        URL_REGEX.lastIndex = 0; // reset stateful regex
        return { valid: false, reason: 'No se permiten enlaces o URLs en las publicaciones' };
    }
    URL_REGEX.lastIndex = 0;

    // Check ASCII art
    if (isAsciiArt(text)) {
        return { valid: false, reason: 'No se permite ASCII art en las publicaciones' };
    }

    // Check excessive special characters
    const specialRatio = (text.match(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ0-9\s,.!?;:'"()\-_]/g) || []).length / text.length;
    if (specialRatio > 0.3 && text.length > 20) {
        return { valid: false, reason: 'El contenido contiene demasiados caracteres especiales' };
    }

    return { valid: true };
}
