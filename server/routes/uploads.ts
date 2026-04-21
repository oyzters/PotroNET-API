import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';
import { getAuthUser } from '../lib/auth';
import { getR2Client, getR2Bucket, buildPublicUrl } from '../lib/r2';

const ALLOWED_MIME = new Set<string>([
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
]);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
const SIGNED_URL_EXPIRES_SECONDS = 120;

// Sanitize a filename: keep extension, strip unsafe chars, cap length
function sanitizeFileName(name: string): string {
    const trimmed = (name || '').trim().slice(-120);
    const safe = trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
    return safe || 'file';
}

// POST /api/uploads/signed-url
export async function uploadsSignedUrl(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const { fileName, fileType, fileSize } = req.body || {};

    if (typeof fileName !== 'string' || !fileName.trim()) {
        return res.status(400).json({ error: 'fileName is required' });
    }
    if (typeof fileType !== 'string' || !ALLOWED_MIME.has(fileType)) {
        return res.status(400).json({ error: 'Unsupported file type' });
    }
    if (typeof fileSize !== 'number' || !Number.isFinite(fileSize) || fileSize <= 0) {
        return res.status(400).json({ error: 'fileSize must be a positive number' });
    }

    const isImage = fileType.startsWith('image/');
    const isVideo = fileType.startsWith('video/');
    const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (fileSize > maxBytes) {
        const maxMb = Math.round(maxBytes / (1024 * 1024));
        return res.status(400).json({ error: `File too large (max ${maxMb} MB for ${isImage ? 'images' : 'videos'})` });
    }
    if (!isImage && !isVideo) {
        return res.status(400).json({ error: 'Unsupported file type' });
    }

    try {
        const now = new Date();
        const yyyy = now.getUTCFullYear();
        const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
        const key = `posts/${yyyy}/${mm}/${nanoid(16)}-${sanitizeFileName(fileName)}`;

        const command = new PutObjectCommand({
            Bucket: getR2Bucket(),
            Key: key,
            ContentType: fileType,
        });

        const signedUrl = await getSignedUrl(getR2Client(), command, {
            expiresIn: SIGNED_URL_EXPIRES_SECONDS,
        });

        return res.status(200).json({
            signedUrl,
            key,
            publicUrl: buildPublicUrl(key),
            expiresIn: SIGNED_URL_EXPIRES_SECONDS,
        });
    } catch (err) {
        console.error('Error generating signed URL:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
