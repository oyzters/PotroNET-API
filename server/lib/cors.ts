import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEFAULT_ALLOWED_ORIGINS_PROD = [
    'https://potronet.com',
    'https://www.potronet.com',
    'https://admin.potronet.com',
    'https://www.admin.potronet.com',
];

const ALLOWED_HEADERS =
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization';
const ALLOWED_METHODS = 'GET,OPTIONS,PATCH,DELETE,POST,PUT';

function parseOrigins(raw: string | undefined): string[] {
    if (!raw) return [];
    return raw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
}

function getAllowedOrigins(): Set<string> {
    const fromEnv = parseOrigins(process.env.CORS_ALLOWED_ORIGINS);
    const origins = fromEnv.length > 0 ? fromEnv : DEFAULT_ALLOWED_ORIGINS_PROD;
    return new Set(origins);
}

function isProduction(): boolean {
    return process.env.VERCEL_ENV === 'production';
}

function isOriginAllowed(origin: string): boolean {
    if (!origin || origin === 'null') return false;
    if (isProduction()) return getAllowedOrigins().has(origin);
    return true;
}

export function cors(req: VercelRequest, res: VercelResponse): boolean {
    const origin = (req.headers.origin as string | undefined) ?? '';
    const allowed = isOriginAllowed(origin);

    res.setHeader('Vary', 'Origin');

    if (allowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
        res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    }

    if (req.method === 'OPTIONS') {
        res.status(allowed ? 204 : 403).end();
        return true;
    }

    return false;
}
