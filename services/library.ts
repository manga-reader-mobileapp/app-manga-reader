import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

// --- Types ---

export interface CachedChapter {
  id: number;
  number: string;
  title: string | null;
  views: number;
  createdAt: string;
}

export interface LibraryManga {
  id: string; // "{source}:{mangaId}" e.g. "nexus:672"
  source: string; // "nexus", "mangadex", etc.
  sourceId: number;
  slug: string;
  title: string;
  author: string;
  type: string;
  status: string;
  coverUrl: string | null;
  localCover: string | null; // local file path after download
  totalChapters: number;
  // Current reading position (where user IS right now)
  lastReadChapter: string | null; // chapter number being read
  lastReadChapterId: number | null;
  lastReadPage: number | null; // page number within that chapter
  lastReadAt: string | null; // ISO date
  // Completed progress (chapters fully read through)
  completedChapter: string | null; // highest chapter number fully read
  // Per-chapter read pages: { chapterId: lastPageRead }
  chapterPages?: Record<number, number>;
  addedAt: string; // ISO date
  lastChapterAt: string | null; // ISO date - when last chapter was released
  categories: string[]; // genre tags from the manga source
  // User-assigned category for library organization
  userCategory?: string | null; // null = "Padrão"
  // Cached data for offline
  cachedChapters: CachedChapter[];
  cachedDescription: string | null;
  cachedRating: number | null;
  cachedViews: number | null;
  lastSyncAt: string | null; // ISO date
}

const LIBRARY_KEY = 'mangaVerse_library';

// --- Internal ---

async function getAll(): Promise<Record<string, LibraryManga>> {
  const raw = await AsyncStorage.getItem(LIBRARY_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function saveAll(data: Record<string, LibraryManga>): Promise<void> {
  await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(data));
}

function coverDir(): string {
  return `${FileSystem.documentDirectory}covers/`;
}

async function ensureCoverDir(): Promise<void> {
  const dir = coverDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function downloadCover(url: string, id: string): Promise<string | null> {
  try {
    await ensureCoverDir();
    const ext = url.split('.').pop()?.split('?')[0] || 'jpg';
    const localPath = `${coverDir()}${id.replace(':', '_')}.${ext}`;
    const result = await FileSystem.downloadAsync(url, localPath);
    if (result.status === 200) return result.uri;
    return null;
  } catch (err) {
    console.error('[LIBRARY] Cover download failed:', err);
    return null;
  }
}

async function deleteCover(localPath: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) await FileSystem.deleteAsync(localPath);
  } catch {}
}

// --- Public API ---

export type LibrarySortBy = 'addedAt' | 'lastReadAt' | 'lastChapterAt' | 'title';

export async function getLibrary(sortBy: LibrarySortBy = 'addedAt'): Promise<LibraryManga[]> {
  const data = await getAll();
  const list = Object.values(data);

  switch (sortBy) {
    case 'addedAt':
      return list.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
    case 'lastReadAt':
      return list.sort((a, b) => {
        const ta = a.lastReadAt ? new Date(a.lastReadAt).getTime() : 0;
        const tb = b.lastReadAt ? new Date(b.lastReadAt).getTime() : 0;
        return tb - ta;
      });
    case 'lastChapterAt':
      return list.sort((a, b) => {
        const ta = a.lastChapterAt ? new Date(a.lastChapterAt).getTime() : 0;
        const tb = b.lastChapterAt ? new Date(b.lastChapterAt).getTime() : 0;
        return tb - ta;
      });
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return list;
  }
}

export async function isInLibrary(source: string, sourceId: number): Promise<boolean> {
  const data = await getAll();
  return `${source}:${sourceId}` in data;
}

export async function getLibraryEntry(source: string, sourceId: number): Promise<LibraryManga | null> {
  const data = await getAll();
  return data[`${source}:${sourceId}`] || null;
}

export async function addToLibrary(manga: {
  source: string;
  sourceId: number;
  slug: string;
  title: string;
  author: string;
  type: string;
  status: string;
  coverUrl: string | null;
  totalChapters: number;
  categories: string[];
  lastChapterAt?: string | null;
  // New: cached data
  cachedChapters?: CachedChapter[];
  cachedDescription?: string | null;
  cachedRating?: number | null;
  cachedViews?: number | null;
}): Promise<LibraryManga> {
  const data = await getAll();
  const id = `${manga.source}:${manga.sourceId}`;

  // Download cover
  let localCover: string | null = null;
  if (manga.coverUrl) {
    localCover = await downloadCover(manga.coverUrl, id);
  }

  const entry: LibraryManga = {
    id,
    source: manga.source,
    sourceId: manga.sourceId,
    slug: manga.slug,
    title: manga.title,
    author: manga.author,
    type: manga.type,
    status: manga.status,
    coverUrl: manga.coverUrl,
    localCover,
    totalChapters: manga.totalChapters,
    lastReadChapter: null,
    lastReadChapterId: null,
    lastReadPage: null,
    lastReadAt: null,
    completedChapter: null,
    addedAt: new Date().toISOString(),
    lastChapterAt: manga.lastChapterAt || null,
    categories: manga.categories,
    cachedChapters: manga.cachedChapters || [],
    cachedDescription: manga.cachedDescription || null,
    cachedRating: manga.cachedRating ?? null,
    cachedViews: manga.cachedViews ?? null,
    lastSyncAt: new Date().toISOString(),
  };

  data[id] = entry;
  await saveAll(data);
  console.log('[LIBRARY] Added:', entry.title, 'with', entry.cachedChapters.length, 'cached chapters');
  return entry;
}

export async function removeFromLibrary(source: string, sourceId: number): Promise<void> {
  const data = await getAll();
  const id = `${source}:${sourceId}`;
  const entry = data[id];
  if (!entry) return;

  if (entry.localCover) {
    await deleteCover(entry.localCover);
  }

  delete data[id];
  await saveAll(data);
  console.log('[LIBRARY] Removed:', entry.title);
}

/** Update cached chapter list + metadata (call after API fetch) */
export async function syncLibraryCache(
  source: string,
  sourceId: number,
  update: {
    totalChapters: number;
    cachedChapters: CachedChapter[];
    cachedDescription?: string | null;
    cachedRating?: number | null;
    cachedViews?: number | null;
    lastChapterAt?: string | null;
    status?: string;
  },
): Promise<void> {
  const data = await getAll();
  const id = `${source}:${sourceId}`;
  const entry = data[id];
  if (!entry) return;

  entry.totalChapters = update.totalChapters;
  entry.cachedChapters = update.cachedChapters;
  entry.lastSyncAt = new Date().toISOString();
  if (update.cachedDescription !== undefined) entry.cachedDescription = update.cachedDescription ?? null;
  if (update.cachedRating !== undefined) entry.cachedRating = update.cachedRating ?? null;
  if (update.cachedViews !== undefined) entry.cachedViews = update.cachedViews ?? null;
  if (update.lastChapterAt !== undefined) entry.lastChapterAt = update.lastChapterAt ?? null;
  if (update.status !== undefined) entry.status = update.status;

  data[id] = entry;
  await saveAll(data);
  console.log('[LIBRARY] Synced cache:', entry.title, update.cachedChapters.length, 'chapters');
}

/** Update current reading position (where user IS right now) */
export async function updateReadProgress(
  source: string,
  sourceId: number,
  chapterNumber: string,
  chapterId: number,
  pageNumber?: number,
): Promise<void> {
  const data = await getAll();
  const id = `${source}:${sourceId}`;
  const entry = data[id];
  if (!entry) return;

  entry.lastReadChapter = chapterNumber;
  entry.lastReadChapterId = chapterId;
  entry.lastReadPage = pageNumber ?? null;
  entry.lastReadAt = new Date().toISOString();

  // Save per-chapter page progress
  if (pageNumber && pageNumber > 0) {
    if (!entry.chapterPages) entry.chapterPages = {};
    entry.chapterPages[chapterId] = pageNumber;
  }

  data[id] = entry;
  await saveAll(data);
}

/** Mark a chapter as fully completed (user reached the end) */
export async function markChapterComplete(
  source: string,
  sourceId: number,
  chapterNumber: string,
): Promise<void> {
  const data = await getAll();
  const id = `${source}:${sourceId}`;
  const entry = data[id];
  if (!entry) return;

  const current = parseFloat(entry.completedChapter || '0');
  const incoming = parseFloat(chapterNumber);
  // Only advance, never go backwards
  if (incoming > current) {
    entry.completedChapter = chapterNumber;
  }

  data[id] = entry;
  await saveAll(data);
}

/** Force set completed chapter (for "mark as read" / "mark unread" actions) */
export async function setCompletedChapter(
  source: string,
  sourceId: number,
  chapterNumber: string | null,
): Promise<void> {
  const data = await getAll();
  const id = `${source}:${sourceId}`;
  const entry = data[id];
  if (!entry) return;

  entry.completedChapter = chapterNumber;
  data[id] = entry;
  await saveAll(data);
}

export async function redownloadCovers(): Promise<number> {
  const data = await getAll();
  let count = 0;
  for (const entry of Object.values(data)) {
    if (!entry.coverUrl) continue;
    if (entry.localCover) {
      await deleteCover(entry.localCover);
    }
    const localCover = await downloadCover(entry.coverUrl, entry.id);
    entry.localCover = localCover;
    count++;
  }
  await saveAll(data);
  console.log('[LIBRARY] Redownloaded', count, 'covers');
  return count;
}

/** Get per-chapter page progress map */
export async function getChapterPagesProgress(
  source: string,
  sourceId: number,
): Promise<Record<number, number>> {
  const data = await getAll();
  const id = `${source}:${sourceId}`;
  const entry = data[id];
  return entry?.chapterPages || {};
}

export async function getReadProgress(
  source: string,
  sourceId: number,
): Promise<{
  chapter: string | null;
  chapterId: number | null;
  page: number | null;
  completedChapter: string | null;
} | null> {
  const data = await getAll();
  const id = `${source}:${sourceId}`;
  const entry = data[id];
  if (!entry) return null;
  return {
    chapter: entry.lastReadChapter,
    chapterId: entry.lastReadChapterId,
    page: entry.lastReadPage ?? null,
    completedChapter: entry.completedChapter ?? null,
  };
}

/** Set user category for a manga */
export async function setMangaCategory(
  source: string,
  sourceId: number,
  category: string | null,
): Promise<void> {
  const data = await getAll();
  const id = `${source}:${sourceId}`;
  const entry = data[id];
  if (!entry) return;
  entry.userCategory = category;
  data[id] = entry;
  await saveAll(data);
}

/** Set user category for multiple mangas */
export async function setMangasCategory(
  ids: Array<{ source: string; sourceId: number }>,
  category: string | null,
): Promise<void> {
  const data = await getAll();
  for (const { source, sourceId } of ids) {
    const id = `${source}:${sourceId}`;
    if (data[id]) data[id].userCategory = category;
  }
  await saveAll(data);
}

/** Rename category in all mangas that have it */
export async function renameMangaCategory(
  oldName: string,
  newName: string,
): Promise<void> {
  const data = await getAll();
  for (const entry of Object.values(data)) {
    if (entry.userCategory === oldName) {
      entry.userCategory = newName;
    }
  }
  await saveAll(data);
}

/** Clear category from all mangas that have it (when category is deleted) */
export async function clearMangaCategory(categoryName: string): Promise<void> {
  const data = await getAll();
  for (const entry of Object.values(data)) {
    if (entry.userCategory === categoryName) {
      entry.userCategory = null;
    }
  }
  await saveAll(data);
}
