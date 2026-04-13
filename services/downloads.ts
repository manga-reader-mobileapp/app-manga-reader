import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getChapterPages } from './nexus/api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DownloadedChapter {
  chapterId: number;
  chapterNumber: string;
  title: string | null;
  totalPages: number;
  downloadedPages: number; // for resume tracking
  downloadedAt: string; // ISO date
  folderPath: string; // relative to documentDirectory
}

export interface DownloadedManga {
  id: string; // "{source}:{mangaId}" e.g. "nexus:672"
  source: string;
  sourceId: number;
  slug: string;
  title: string;
  coverUrl: string | null;
  localCover: string | null;
  chapters: Record<number, DownloadedChapter>; // keyed by chapterId
}

export type QueueItemStatus = 'pending' | 'downloading' | 'paused' | 'error';

export interface QueueItem {
  chapterId: number;
  chapterNumber: string;
  chapterTitle: string | null;
  mangaId: string; // "{source}:{sourceId}"
  source: string;
  sourceId: number;
  slug: string;
  mangaTitle: string;
  coverUrl: string | null;
  totalPages: number;
  downloadedPages: number; // resume from here
  status: QueueItemStatus;
  addedAt: string; // ISO date
  error?: string;
}

// Callback type for UI updates
type ProgressListener = (queue: QueueItem[]) => void;

// ─── Storage Keys ────────────────────────────────────────────────────────────

const DOWNLOADS_KEY = 'mangaVerse_downloads';
const QUEUE_KEY = 'mangaVerse_download_queue';

// ─── Internal State ──────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const PAGE_TIMEOUT = 15000; // 15 seconds per attempt

let _processing = false;
let _cancelledIds = new Set<number>(); // chapters to cancel mid-download
let _listeners: ProgressListener[] = [];

/** Wrap a promise with a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function downloadsDir(): string {
  return `${FileSystem.documentDirectory}downloads/`;
}

function chapterDir(source: string, sourceId: number, chapterNumber: string): string {
  const safeNumber = chapterNumber.replace(/[^0-9.]/g, '');
  return `${downloadsDir()}${source}_${sourceId}/${safeNumber}/`;
}

function pagePath(dir: string, pageIndex: number): string {
  const padded = String(pageIndex + 1).padStart(3, '0');
  return `${dir}page_${padded}.jpg`;
}

async function ensureDir(dir: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

// ─── Downloads Index (what's already downloaded) ─────────────────────────────

async function getAllDownloads(): Promise<Record<string, DownloadedManga>> {
  const raw = await AsyncStorage.getItem(DOWNLOADS_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function saveAllDownloads(data: Record<string, DownloadedManga>): Promise<void> {
  await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(data));
}

// ─── Queue (persistent download queue) ───────────────────────────────────────

async function getQueue(): Promise<QueueItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveQueue(queue: QueueItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  notifyListeners(queue);
}

function notifyListeners(queue: QueueItem[]) {
  _listeners.forEach((fn) => fn(queue));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Subscribe to queue changes (for UI). Returns unsubscribe function. */
export function onQueueChange(listener: ProgressListener): () => void {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter((fn) => fn !== listener);
  };
}

/** Get current queue snapshot */
export async function getDownloadQueue(): Promise<QueueItem[]> {
  return getQueue();
}

/** Get all downloaded mangas */
export async function getDownloadedMangas(): Promise<DownloadedManga[]> {
  const data = await getAllDownloads();
  return Object.values(data);
}

/** Get downloaded chapters for a specific manga */
export async function getDownloadedChapters(
  source: string,
  sourceId: number,
): Promise<DownloadedChapter[]> {
  const data = await getAllDownloads();
  const id = `${source}:${sourceId}`;
  const manga = data[id];
  if (!manga) return [];
  return Object.values(manga.chapters).sort(
    (a, b) => parseFloat(a.chapterNumber) - parseFloat(b.chapterNumber),
  );
}

/** Check if a specific chapter is downloaded (at least 90% or all pages) */
export async function isChapterDownloaded(
  source: string,
  sourceId: number,
  chapterId: number,
): Promise<boolean> {
  const data = await getAllDownloads();
  const id = `${source}:${sourceId}`;
  const manga = data[id];
  if (!manga) return false;
  const ch = manga.chapters[chapterId];
  if (!ch || ch.totalPages === 0) return false;
  // Consider downloaded if >= 90% of pages or all pages
  return ch.downloadedPages >= ch.totalPages || ch.downloadedPages >= Math.ceil(ch.totalPages * 0.9);
}

/** Get local page paths for a downloaded chapter (for offline reader) */
export async function getLocalPages(
  source: string,
  sourceId: number,
  chapterId: number,
): Promise<string[] | null> {
  const data = await getAllDownloads();
  const id = `${source}:${sourceId}`;
  const manga = data[id];
  if (!manga) return null;
  const ch = manga.chapters[chapterId];
  if (!ch || ch.downloadedPages === 0) return null;

  const dir = `${FileSystem.documentDirectory}${ch.folderPath}`;
  const pages: string[] = [];
  // Return pages up to what we actually downloaded
  for (let i = 0; i < ch.downloadedPages; i++) {
    pages.push(pagePath(dir, i));
  }
  return pages;
}

/** Add chapters to download queue */
export async function enqueueChapters(params: {
  source: string;
  sourceId: number;
  slug: string;
  mangaTitle: string;
  coverUrl: string | null;
  chapters: Array<{ id: number; number: string; title: string | null }>;
}): Promise<void> {
  const queue = await getQueue();

  // Sort chapters ascending (1→10) so they download in reading order
  const sortedChapters = [...params.chapters].sort(
    (a, b) => parseFloat(a.number) - parseFloat(b.number),
  );

  for (const ch of sortedChapters) {
    // Skip if already in queue
    if (queue.some((q) => q.chapterId === ch.id)) continue;

    // Skip if already fully downloaded
    const downloaded = await isChapterDownloaded(params.source, params.sourceId, ch.id);
    if (downloaded) continue;

    // Check if partially downloaded (for resume)
    const downloads = await getAllDownloads();
    const mangaId = `${params.source}:${params.sourceId}`;
    const existing = downloads[mangaId]?.chapters[ch.id];

    queue.push({
      chapterId: ch.id,
      chapterNumber: ch.number,
      chapterTitle: ch.title,
      mangaId,
      source: params.source,
      sourceId: params.sourceId,
      slug: params.slug,
      mangaTitle: params.mangaTitle,
      coverUrl: params.coverUrl,
      totalPages: existing?.totalPages || 0,
      downloadedPages: existing?.downloadedPages || 0,
      status: 'pending',
      addedAt: new Date().toISOString(),
    });
  }

  await saveQueue(queue);
  console.log('[DOWNLOADS] Enqueued', params.chapters.length, 'chapters for', params.mangaTitle);

  // Start processing if not already running
  processQueue();
}

/** Remove a chapter from the queue AND cancel if currently downloading */
export async function removeFromQueue(chapterId: number): Promise<void> {
  // Signal cancellation to the download loop
  _cancelledIds.add(chapterId);

  // Get queue item info before removing (to clean up partial files)
  let queue = await getQueue();
  const item = queue.find((q) => q.chapterId === chapterId);

  // Remove from queue
  queue = queue.filter((q) => q.chapterId !== chapterId);
  await saveQueue(queue);

  // Clean up partial download from index
  if (item) {
    const data = await getAllDownloads();
    const manga = data[item.mangaId];
    if (manga?.chapters[chapterId]) {
      const ch = manga.chapters[chapterId];
      // Delete partial folder
      const dir = `${FileSystem.documentDirectory}${ch.folderPath}`;
      try {
        const info = await FileSystem.getInfoAsync(dir);
        if (info.exists) await FileSystem.deleteAsync(dir, { idempotent: true });
      } catch {}
      delete manga.chapters[chapterId];

      if (Object.keys(manga.chapters).length === 0) {
        delete data[item.mangaId];
      }
      await saveAllDownloads(data);
    }
  }

  console.log('[DOWNLOADS] Removed from queue + cleaned up:', chapterId);
}

/** Delete a downloaded chapter */
export async function deleteDownloadedChapter(
  source: string,
  sourceId: number,
  chapterId: number,
): Promise<void> {
  const data = await getAllDownloads();
  const id = `${source}:${sourceId}`;
  const manga = data[id];
  if (!manga) return;

  const ch = manga.chapters[chapterId];
  if (ch) {
    const dir = `${FileSystem.documentDirectory}${ch.folderPath}`;
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (info.exists) await FileSystem.deleteAsync(dir, { idempotent: true });
    } catch (err) {
      console.error('[DOWNLOADS] Delete folder error:', err);
    }
    delete manga.chapters[chapterId];
  }

  if (Object.keys(manga.chapters).length === 0) {
    const mangaDir = `${downloadsDir()}${source}_${sourceId}/`;
    try {
      const info = await FileSystem.getInfoAsync(mangaDir);
      if (info.exists) await FileSystem.deleteAsync(mangaDir, { idempotent: true });
    } catch {}
    delete data[id];
  } else {
    data[id] = manga;
  }

  await saveAllDownloads(data);
  console.log('[DOWNLOADS] Deleted chapter', chapterId);
}

/** Delete all downloaded chapters for a manga */
export async function deleteDownloadedManga(
  source: string,
  sourceId: number,
): Promise<void> {
  const data = await getAllDownloads();
  const id = `${source}:${sourceId}`;
  if (!data[id]) return;

  const mangaDir = `${downloadsDir()}${source}_${sourceId}/`;
  try {
    const info = await FileSystem.getInfoAsync(mangaDir);
    if (info.exists) await FileSystem.deleteAsync(mangaDir, { idempotent: true });
  } catch (err) {
    console.error('[DOWNLOADS] Delete manga folder error:', err);
  }

  delete data[id];
  await saveAllDownloads(data);
  console.log('[DOWNLOADS] Deleted all chapters for', id);
}

/** Resume processing queue (call on app start) */
export function resumeQueue(): void {
  processQueue();
}

// ─── Queue Processor (STRICTLY one chapter at a time) ────────────────────────

async function processQueue(): Promise<void> {
  // Strict lock — only one processor can run
  if (_processing) {
    console.log('[DOWNLOADS] Processor already running, skipping');
    return;
  }
  _processing = true;
  console.log('[DOWNLOADS] Queue processor started');

  try {
    while (true) {
      const queue = await getQueue();
      const next = queue.find((q) => q.status === 'pending' || q.status === 'downloading');
      if (!next) {
        console.log('[DOWNLOADS] Queue empty, processor stopping');
        break;
      }

      // Mark as downloading
      next.status = 'downloading';
      await saveQueue(queue);

      try {
        await downloadSingleChapter(next);

        // Remove from queue on success
        const updated = await getQueue();
        const filtered = updated.filter((q) => q.chapterId !== next.chapterId);
        await saveQueue(filtered);
      } catch (err: any) {
        if (err.message === 'CANCELLED') {
          console.log('[DOWNLOADS] Chapter', next.chapterId, 'cancelled');
          // Already removed from queue by removeFromQueue
        } else {
          console.error('[DOWNLOADS] Chapter download failed:', next.chapterId, err);
          const updated = await getQueue();
          const item = updated.find((q) => q.chapterId === next.chapterId);
          if (item) {
            item.status = 'error';
            item.error = err.message || 'Download failed';
            await saveQueue(updated);
          }
        }
      }
    }
  } finally {
    _processing = false;
  }
}

async function downloadSingleChapter(item: QueueItem): Promise<void> {
  console.log('[DOWNLOADS] Downloading chapter', item.chapterNumber, 'of', item.mangaTitle);

  // 1) Get page URLs from API
  const { pages } = await getChapterPages(item.chapterId);
  const totalPages = pages.length;

  // Update queue with real totalPages
  item.totalPages = totalPages;
  const queue = await getQueue();
  const qItem = queue.find((q) => q.chapterId === item.chapterId);
  if (qItem) {
    qItem.totalPages = totalPages;
    await saveQueue(queue);
  }

  // 2) Prepare folder
  const dir = chapterDir(item.source, item.sourceId, item.chapterNumber);
  await ensureDir(dir);
  const relativeDir = dir.replace(FileSystem.documentDirectory!, '');

  // 3) Create manga entry in downloads index (once)
  await ensureMangaEntry(item);

  // 4) Download pages one by one (resume from where we left off)
  const startPage = item.downloadedPages;
  console.log('[DOWNLOADS] Starting from page', startPage + 1, 'of', totalPages);

  let lastSaveTime = Date.now();

  for (let i = startPage; i < totalPages; i++) {
    // Check cancellation
    if (_cancelledIds.has(item.chapterId)) {
      _cancelledIds.delete(item.chapterId);
      throw new Error('CANCELLED');
    }

    const page = pages[i];
    const dest = pagePath(dir, i);

    // Check if file already exists (from partial download)
    const fileInfo = await FileSystem.getInfoAsync(dest);
    if (!fileInfo.exists) {
      let downloaded = false;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          // Resolve the 302 redirect first to get real CDN URL (with timeout)
          const realUrl = await withTimeout(resolveRedirect(page.imageUrl), PAGE_TIMEOUT);

          const result = await withTimeout(
            FileSystem.downloadAsync(realUrl, dest),
            PAGE_TIMEOUT,
          );

          if (result.status === 200) {
            downloaded = true;
            break;
          }

          console.warn('[DOWNLOADS] Page', i + 1, 'attempt', attempt, 'failed: HTTP', result.status);
        } catch (pageErr: any) {
          const reason = pageErr?.message === 'TIMEOUT' ? 'timeout' : pageErr?.message || 'error';
          console.warn('[DOWNLOADS] Page', i + 1, 'attempt', attempt, '/', MAX_RETRIES, '—', reason);
        }

        // Wait a bit before retry (1s, 2s, 3s)
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, attempt * 1000));
        }
      }

      if (!downloaded) {
        console.warn('[DOWNLOADS] Page', i + 1, 'SKIPPED after', MAX_RETRIES, 'attempts');
        // Clean up partial file if it exists
        try {
          const partial = await FileSystem.getInfoAsync(dest);
          if (partial.exists) await FileSystem.deleteAsync(dest, { idempotent: true });
        } catch {}
        continue;
      }
    }

    // Update progress (throttled — save every 3 seconds max to reduce I/O)
    item.downloadedPages = i + 1;
    const now = Date.now();
    if (now - lastSaveTime > 3000 || i === totalPages - 1) {
      lastSaveTime = now;

      // Update queue
      const q = await getQueue();
      const qi = q.find((x) => x.chapterId === item.chapterId);
      if (qi) {
        qi.downloadedPages = i + 1;
        await saveQueue(q);
      }

      // Update downloads index
      await updateDownloadProgress(item, relativeDir, i + 1, totalPages);
    }

    console.log('[DOWNLOADS] Page', i + 1, '/', totalPages);
  }

  // 5) Final save
  await updateDownloadProgress(item, relativeDir, item.downloadedPages, totalPages);
  console.log('[DOWNLOADS] Chapter', item.chapterNumber, 'complete!', item.downloadedPages, '/', totalPages, 'pages');
}

/** Resolve 302 redirect to get the real CDN URL */
async function resolveRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { Referer: 'https://nexustoons.com/' },
      redirect: 'follow',
    });
    // After following redirects, res.url is the final URL
    return res.url || url;
  } catch {
    // If HEAD fails, just return original URL
    return url;
  }
}

async function ensureMangaEntry(item: QueueItem): Promise<void> {
  const data = await getAllDownloads();
  if (data[item.mangaId]) return;

  let localCover: string | null = null;
  if (item.coverUrl) {
    try {
      const coverDirPath = `${downloadsDir()}${item.source}_${item.sourceId}/`;
      await ensureDir(coverDirPath);
      const ext = item.coverUrl.split('.').pop()?.split('?')[0] || 'jpg';
      const coverPath = `${coverDirPath}cover.${ext}`;
      const info = await FileSystem.getInfoAsync(coverPath);
      if (!info.exists) {
        const result = await FileSystem.downloadAsync(item.coverUrl, coverPath);
        if (result.status === 200) localCover = coverPath;
      } else {
        localCover = coverPath;
      }
    } catch (err) {
      console.error('[DOWNLOADS] Cover download error:', err);
    }
  }

  data[item.mangaId] = {
    id: item.mangaId,
    source: item.source,
    sourceId: item.sourceId,
    slug: item.slug,
    title: item.mangaTitle,
    coverUrl: item.coverUrl,
    localCover,
    chapters: {},
  };

  await saveAllDownloads(data);
}

async function updateDownloadProgress(
  item: QueueItem,
  relativeDir: string,
  downloadedPages: number,
  totalPages: number,
): Promise<void> {
  const data = await getAllDownloads();

  if (!data[item.mangaId]) {
    await ensureMangaEntry(item);
    const refreshed = await getAllDownloads();
    if (!refreshed[item.mangaId]) return;
    Object.assign(data, refreshed);
  }

  data[item.mangaId].chapters[item.chapterId] = {
    chapterId: item.chapterId,
    chapterNumber: item.chapterNumber,
    title: item.chapterTitle,
    totalPages,
    downloadedPages,
    downloadedAt: new Date().toISOString(),
    folderPath: relativeDir,
  };

  await saveAllDownloads(data);
}
