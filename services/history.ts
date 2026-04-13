import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = 'mangaVerse_history';

export interface HistoryEntry {
  mangaId: number;
  source: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  lastChapterNumber: string;
  lastChapterId: number;
  lastReadAt: string; // ISO date
}

/** Get full history sorted by most recent */
export async function getHistory(): Promise<HistoryEntry[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  const map: Record<string, HistoryEntry> = raw ? JSON.parse(raw) : {};
  return Object.values(map).sort(
    (a, b) => new Date(b.lastReadAt).getTime() - new Date(a.lastReadAt).getTime(),
  );
}

/** Add or update a history entry (one per manga, always updates) */
export async function addToHistory(entry: {
  mangaId: number;
  source: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  chapterNumber: string;
  chapterId: number;
}): Promise<void> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  const map: Record<string, HistoryEntry> = raw ? JSON.parse(raw) : {};

  const key = `${entry.source}:${entry.mangaId}`;
  map[key] = {
    mangaId: entry.mangaId,
    source: entry.source,
    slug: entry.slug,
    title: entry.title,
    coverUrl: entry.coverUrl,
    lastChapterNumber: entry.chapterNumber,
    lastChapterId: entry.chapterId,
    lastReadAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(map));
}

/** Remove a single manga from history */
export async function removeFromHistory(source: string, mangaId: number): Promise<void> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  const map: Record<string, HistoryEntry> = raw ? JSON.parse(raw) : {};
  delete map[`${source}:${mangaId}`];
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(map));
}

/** Clear all history */
export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY);
}
