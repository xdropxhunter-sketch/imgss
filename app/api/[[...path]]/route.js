import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getFilesCollection } from '@/lib/mongodb';
import { saveFile, readFile, deleteFile, getBackend, getPresignedUrl } from '@/lib/storage';
import { startCleanupScheduler, runCleanup } from '@/lib/cleanup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Start cleanup scheduler on module load
startCleanupScheduler();

const FILE_EXPIRY_SECONDS = parseInt(process.env.FILE_EXPIRY_SECONDS || '300', 10);
const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || '52428800', 10); // 50MB
const ALLOWED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'video/mp4',
]);
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'mp4']);

function json(data, init = {}) {
  return NextResponse.json(data, init);
}

function getExt(name) {
  const m = (name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

async function handleUpload(request) {
  // Opportunistic cleanup
  runCleanup().catch(() => {});

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return json({ error: 'Invalid form data' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return json({ error: 'No file uploaded' }, { status: 400 });
  }

  const size = file.size;
  if (size > MAX_UPLOAD_BYTES) {
    return json({ error: `File too large. Max is ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB` }, { status: 413 });
  }
  if (size <= 0) {
    return json({ error: 'Empty file' }, { status: 400 });
  }

  const mime = (file.type || '').toLowerCase();
  const ext = getExt(file.name);
  if (!ALLOWED_MIMES.has(mime) && !ALLOWED_EXT.has(ext)) {
    return json({ error: 'Unsupported file type. Allowed: PNG, JPG, JPEG, WEBP, MP4' }, { status: 415 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const id = uuidv4().replace(/-/g, '').slice(0, 16);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + FILE_EXPIRY_SECONDS * 1000);

  const { storageKey } = await saveFile({
    id,
    buffer,
    contentType: mime || 'application/octet-stream',
    originalName: file.name || `file.${ext || 'bin'}`,
  });

  const doc = {
    id,
    originalName: file.name,
    mimeType: mime,
    size,
    storageKey,
    backend: getBackend(),
    createdAt,
    expiresAt,
    deleted: false,
  };
  const col = await getFilesCollection();
  await col.insertOne(doc);

  return json({
    id,
    shareUrl: `/share/${id}`,
    expiresAt: expiresAt.toISOString(),
    expiresInSeconds: FILE_EXPIRY_SECONDS,
    mimeType: mime,
    size,
    originalName: file.name,
  });
}

async function handleInfo(id) {
  const col = await getFilesCollection();
  const doc = await col.findOne({ id });
  if (!doc || doc.deleted) {
    return json({ error: 'File not found or expired' }, { status: 404 });
  }
  if (new Date() >= new Date(doc.expiresAt)) {
    // Trigger cleanup
    runCleanup().catch(() => {});
    return json({ error: 'File expired' }, { status: 410 });
  }
  return json({
    id: doc.id,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    size: doc.size,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
  });
}

async function handleServeFile(id) {
  const col = await getFilesCollection();
  const doc = await col.findOne({ id });
  if (!doc || doc.deleted) {
    return new Response('File not found or expired', { status: 404 });
  }
  if (new Date() >= new Date(doc.expiresAt)) {
    runCleanup().catch(() => {});
    return new Response('File expired', { status: 410 });
  }

  // If S3 backend, redirect to presigned URL for efficiency
  if (doc.backend === 's3') {
    const remaining = Math.max(
      30,
      Math.floor((new Date(doc.expiresAt).getTime() - Date.now()) / 1000)
    );
    const url = await getPresignedUrl(doc.storageKey, remaining);
    if (url) {
      return NextResponse.redirect(url, 302);
    }
  }

  // Local: stream from disk
  const buffer = await readFile(doc.storageKey);
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': doc.mimeType || 'application/octet-stream',
      'Content-Length': String(doc.size),
      'Content-Disposition': `inline; filename="${doc.originalName || 'file'}"`,
      'Cache-Control': 'private, max-age=60',
    },
  });
}

export async function GET(request, { params }) {
  const segments = params?.path || [];
  const [a, b] = segments;
  try {
    if (a === 'health') return json({ ok: true });
    if (a === 'info' && b) return handleInfo(b);
    if (a === 'file' && b) return handleServeFile(b);
    return json({ error: 'Not found' }, { status: 404 });
  } catch (e) {
    console.error('GET error:', e);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const segments = params?.path || [];
  const [a] = segments;
  try {
    if (a === 'upload') return handleUpload(request);
    return json({ error: 'Not found' }, { status: 404 });
  } catch (e) {
    console.error('POST error:', e);
    return json({ error: e?.message || 'Internal server error' }, { status: 500 });
  }
}
