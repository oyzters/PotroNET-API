import type { VercelRequest, VercelResponse } from '@vercel/node';

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

// In-memory store (per serverless instance)
const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 60s to prevent memory leaks
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (now > entry.resetAt) store.delete(key);
    }
}, 60_000);

interface RateLimitOptions {
    windowMs: number;   // Time window in ms
    max: number;        // Max requests per window
}

const TIERS: Record<string, RateLimitOptions> = {
    // Auth endpoints: strict (prevent brute force)
    auth:    { windowMs: 60_000, max: 10 },
    // Write operations: moderate
    write:   { windowMs: 60_000, max: 30 },
    // Read operations: relaxed
    read:    { windowMs: 60_000, max: 100 },
};

function getTier(method: string, path: string): RateLimitOptions {
    if (path.startsWith('auth')) return TIERS.auth;
    if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') return TIERS.write;
    return TIERS.read;
}

function getClientIP(req: VercelRequest): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * Rate limiter middleware for Vercel serverless.
 * Returns true if rate limited (response already sent), false if allowed.
 */
export function rateLimit(req: VercelRequest, res: VercelResponse, pathSegments: string[]): boolean {
    const ip = getClientIP(req);
    const method = req.method ?? 'GET';
    const path = pathSegments.join('/');
    const tier = getTier(method, path);

    const key = `${ip}:${path.split('/')[0]}:${method}`;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + tier.windowMs };
        store.set(key, entry);
    }

    entry.count++;

    // Set standard rate limit headers
    const remaining = Math.max(0, tier.max - entry.count);
    res.setHeader('X-RateLimit-Limit', tier.max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > tier.max) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        res.setHeader('Retry-After', retryAfter);
        res.status(429).json({
            error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.',
            retryAfter,
        });
        return true;
    }

    return false;
}
