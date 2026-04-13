import { Platform } from 'react-native';
import { initCrypto, decrypt } from './crypto';
import type {
  NexusChapterRead,
  NexusEncryptedResponse,
  NexusManga,
  NexusMangaDetail,
  NexusPaginatedResponse,
  NexusReaderPage,
} from './types';

const NEXUS_API = 'https://nexustoons.com/api';
const CORS_PROXY = 'https://corsproxy.io/?url=';

function buildUrl(endpoint: string): string {
  const raw = `${NEXUS_API}${endpoint}`;
  return Platform.OS === 'web'
    ? `${CORS_PROXY}${encodeURIComponent(raw)}`
    : raw;
}

const HEADERS: Record<string, string> = {
  Accept: 'application/json',
  Referer: 'https://nexustoons.com/',
};

async function fetchDecrypted<T>(endpoint: string): Promise<T> {
  console.log('[NEXUS] Fetching endpoint:', endpoint);
  try {
    await initCrypto();

    const url = buildUrl(endpoint);
    console.log('[NEXUS] URL:', url);
    const res = await fetch(url, { headers: HEADERS });
    console.log('[NEXUS] Status:', res.status);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${endpoint}`);
    }

    const json: NexusEncryptedResponse = await res.json();
    console.log('[NEXUS] Encrypted k:', json.k, 'v:', json.v, 'd:', json.d?.length);

    const decrypted = decrypt(json.k, json.d);
    return JSON.parse(decrypted) as T;
  } catch (err) {
    console.error('[NEXUS] ERROR:', err);
    throw err;
  }
}

export async function getPopularMangas(
  limit = 20,
  page = 1,
): Promise<NexusPaginatedResponse<NexusManga>> {
  return fetchDecrypted(
    `/mangas?limit=${limit}&page=${page}&sortBy=views&includeNsfw=false`,
  );
}

export async function getRecentMangas(
  limit = 20,
  page = 1,
): Promise<NexusPaginatedResponse<NexusManga>> {
  return fetchDecrypted(
    `/mangas?limit=${limit}&page=${page}&sortBy=lastChapterAt&includeNsfw=false`,
  );
}

export async function searchMangas(
  query: string,
  limit = 20,
): Promise<NexusPaginatedResponse<NexusManga>> {
  return fetchDecrypted(
    `/mangas?limit=${limit}&search=${encodeURIComponent(query)}&includeNsfw=false`,
  );
}

export type SortBy = 'updatedAt' | 'views' | 'lastChapterAt' | 'title' | 'createdAt';
export type MangaType = 'manga' | 'manhwa' | 'manhua' | 'webtoon';
export type MangaStatus = 'ongoing' | 'completed' | 'hiatus';

export interface ExploreFilters {
  page?: number;
  limit?: number;
  sortBy?: SortBy;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  type?: MangaType;
  status?: MangaStatus;
}

export async function exploreMangas(
  filters: ExploreFilters = {},
): Promise<NexusPaginatedResponse<NexusManga>> {
  const {
    page = 1,
    limit = 30,
    sortBy = 'updatedAt',
    sortOrder = 'desc',
    search,
    type,
    status,
  } = filters;

  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sortBy,
    sortOrder,
    includeNsfw: 'false',
    categoryMode: 'or',
  });

  if (search) params.set('search', search);
  if (type) params.set('type', type);
  if (status) params.set('status', status);

  return fetchDecrypted(`/mangas?${params.toString()}`);
}

export async function getMangaBySlug(
  slug: string,
): Promise<NexusMangaDetail> {
  return fetchDecrypted(`/manga/${slug}`);
}

export async function getChapterPages(
  chapterId: number,
): Promise<{ pages: NexusReaderPage[]; chapter: NexusChapterRead }> {
  const data = await fetchDecrypted<NexusChapterRead>(`/read/${chapterId}`);
  console.log('[NEXUS] Chapter', chapterId, 'pageToken:', data.pageToken, 'totalPages:', data.totalPages);

  const pages: NexusReaderPage[] = Array.from({ length: data.totalPages }, (_, i) => ({
    pageNumber: i + 1,
    imageUrl: `${NEXUS_API}/p/${data.pageToken}/${i}`,
  }));

  return { pages, chapter: data };
}
