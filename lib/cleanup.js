import { getFilesCollection } from './mongodb';
import { deleteFile } from './storage';

let cleanupStarted = false;

export async function runCleanup() {
  try {
    const col = await getFilesCollection();
    const now = new Date();
    const expired = await col.find({ expiresAt: { $lte: now }, deleted: { $ne: true } }).toArray();
    for (const f of expired) {
      await deleteFile(f.storageKey);
      await col.updateOne({ id: f.id }, { $set: { deleted: true, deletedAt: new Date() } });
    }
    if (expired.length) {
      console.log(`[cleanup] Removed ${expired.length} expired file(s)`);
    }
  } catch (e) {
    console.error('[cleanup] error:', e);
  }
}

export function startCleanupScheduler() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  // Run cleanup every 30 seconds
  setInterval(runCleanup, 30 * 1000);
  // Initial run shortly after boot
  setTimeout(runCleanup, 5 * 1000);
  console.log('[cleanup] scheduler started');
}
