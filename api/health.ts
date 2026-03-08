import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../lib/cors';

export default function handler(req: VercelRequest, res: VercelResponse) {
    if (cors(req, res)) return;

    res.status(200).json({
        status: 'ok',
        service: 'PotroNET API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
    });
}
