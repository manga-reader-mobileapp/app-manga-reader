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

import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'nexus_auth_token';
const CREDS_KEY = 'nexus_credentials';
const EMAIL_KEY = 'nexus_email';

async function getHeaders(): Promise<Record<string, string>> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const h: Record<string, string> = {
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://nexustoons.com/',
    'X-App-Key': 'NxT_s3cur3_k3y_2026!xK9mPqL',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

/** Login with credentials and save token + credentials for auto re-login */
export async function nexusLogin(username: string, password: string): Promise<boolean> {
  try {
    const url = Platform.OS === 'web' ? `${CORS_PROXY}${encodeURIComponent(`${NEXUS_API}/login`)}` : `${NEXUS_API}/login`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Referer': 'https://nexustoons.com/login',
        'X-App-Key': 'NxT_s3cur3_k3y_2026!xK9mPqL',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) return false;

    const data = await res.json();
    const token = data.token || data.accessToken || data.access_token || data.jwt;
    if (token) {
      await AsyncStorage.setItem(TOKEN_KEY, token);
      // Save credentials for auto re-login
      await AsyncStorage.setItem(CREDS_KEY, JSON.stringify({ username, password }));
      await AsyncStorage.setItem(EMAIL_KEY, data.user?.email || username);
      return true;
    }
    return false;
  } catch (err) {
    console.error('[NEXUS] Login error:', err);
    return false;
  }
}

/** Try to re-login using saved credentials */
async function tryAutoRelogin(): Promise<boolean> {
  const credsRaw = await AsyncStorage.getItem(CREDS_KEY);
  if (!credsRaw) return false;
  try {
    const { username, password } = JSON.parse(credsRaw);
    console.log('[NEXUS] Auto re-login...');
    return await nexusLogin(username, password);
  } catch {
    return false;
  }
}

export async function nexusLogout(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, CREDS_KEY, EMAIL_KEY]);
}

export async function nexusIsLoggedIn(): Promise<boolean> {
  return !!(await AsyncStorage.getItem(TOKEN_KEY));
}

export async function nexusGetEmail(): Promise<string | null> {
  return AsyncStorage.getItem(EMAIL_KEY);
}

async function fetchDecrypted<T>(endpoint: string, isRetry = false): Promise<T> {
  try {
    await initCrypto();

    const url = buildUrl(endpoint);
    let res = await fetch(url, { headers: await getHeaders() });

    // If 401, try auto re-login once
    if (res.status === 401 && !isRetry) {
      console.log('[NEXUS] 401 received, trying auto re-login');
      const relogged = await tryAutoRelogin();
      if (relogged) {
        // Retry with new token
        res = await fetch(url, { headers: await getHeaders() });
      }
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${endpoint}`);
    }

    const json: NexusEncryptedResponse = await res.json();
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
