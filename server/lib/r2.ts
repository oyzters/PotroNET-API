import { S3Client } from '@aws-sdk/client-s3';

// Lazy singleton for R2 S3-compatible client
let _client: S3Client | null = null;

export function getR2Client(): S3Client {
    if (!_client) {
        const accountId = process.env.R2_ACCOUNT_ID;
        const accessKeyId = process.env.R2_ACCESS_KEY_ID;
        const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

        if (!accountId || !accessKeyId || !secretAccessKey) {
            throw new Error('R2 credentials missing (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)');
        }

        _client = new S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId, secretAccessKey },
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED',
        });
    }
    return _client;
}

export function getR2Bucket(): string {
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) throw new Error('R2_BUCKET_NAME missing');
    return bucket;
}

export function getR2PublicUrl(): string {
    const publicUrl = process.env.R2_PUBLIC_URL;
    if (!publicUrl) throw new Error('R2_PUBLIC_URL missing');
    return publicUrl.replace(/\/$/, '');
}

export function buildPublicUrl(key: string): string {
    return `${getR2PublicUrl()}/${key}`;
}
