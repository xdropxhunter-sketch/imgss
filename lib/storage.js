import fs from 'fs';
import path from 'path';
import { promises as fsp } from 'fs';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BACKEND = (process.env.STORAGE_BACKEND || 'local').toLowerCase();
const LOCAL_DIR = process.env.LOCAL_UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const S3_BUCKET = process.env.S3_BUCKET_NAME || process.env.AWS_BUCKET_NAME;
const S3_REGION = process.env.S3_REGION || process.env.AWS_REGION;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

// Ensure local dir exists
if (BACKEND === 'local') {
  try {
    if (!fs.existsSync(LOCAL_DIR)) {
      fs.mkdirSync(LOCAL_DIR, { recursive: true });
    }
  } catch (e) {
    console.error('Failed to create local upload dir:', e);
  }
}

// Lazy-init S3 client only if configured
let s3Client = null;
function getS3() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS_KEY_ID,
        secretAccessKey: S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

export function getBackend() {
  return BACKEND;
}

/**
 * Save a file buffer to storage.
 * Returns { storageKey } describing how to retrieve it later.
 */
export async function saveFile({ id, buffer, contentType, originalName }) {
  if (BACKEND === 's3') {
    const Bucket = S3_BUCKET;
    const Key = `tempshare/${id}-${originalName}`;
    const client = getS3();
    await client.send(new PutObjectCommand({
      Bucket,
      Key,
      Body: buffer,
      ContentType: contentType,
    }));
    return { storageKey: Key };
  }
  // local
  const safeName = `${id}__${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const fullPath = path.join(LOCAL_DIR, safeName);
  await fsp.writeFile(fullPath, buffer);
  return { storageKey: safeName };
}

/**
 * Read a file as a Buffer (used by API to stream content out).
 */
export async function readFile(storageKey) {
  if (BACKEND === 's3') {
    const Bucket = S3_BUCKET;
    const client = getS3();
    const resp = await client.send(new GetObjectCommand({ Bucket, Key: storageKey }));
    const chunks = [];
    for await (const chunk of resp.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  const fullPath = path.join(LOCAL_DIR, storageKey);
  return fsp.readFile(fullPath);
}

/**
 * Generate a presigned URL (S3 only). Returns null for local.
 */
export async function getPresignedUrl(storageKey, expiresIn = 300) {
  if (BACKEND !== 's3') return null;
  const Bucket = S3_BUCKET;
  const client = getS3();
  const cmd = new GetObjectCommand({ Bucket, Key: storageKey });
  return getSignedUrl(client, cmd, { expiresIn });
}

export async function getPresignedUploadUrl({ storageKey, contentType, expiresIn = 300 }) {
  if (BACKEND !== 's3') return null;
  const Bucket = S3_BUCKET;
  const client = getS3();
  const cmd = new PutObjectCommand({
    Bucket,
    Key: storageKey,
    ContentType: contentType || 'application/octet-stream',
  });
  return getSignedUrl(client, cmd, { expiresIn });
}

/**
 * Delete a stored file.
 */
export async function deleteFile(storageKey) {
  try {
    if (BACKEND === 's3') {
      const Bucket = S3_BUCKET;
      const client = getS3();
      await client.send(new DeleteObjectCommand({ Bucket, Key: storageKey }));
      return true;
    }
    const fullPath = path.join(LOCAL_DIR, storageKey);
    await fsp.unlink(fullPath).catch(() => {});
    return true;
  } catch (e) {
    console.error('deleteFile error:', e);
    return false;
  }
}
