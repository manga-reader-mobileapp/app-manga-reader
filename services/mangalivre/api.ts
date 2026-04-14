import { Platform } from 'react-native';
import { parseMangaCards, parseChapterImages, parseMangaDetail, parseHomePopular, parseHomeLatest } from './parser';
import type { MLManga, MLMangaDetail, MLChapter, MLReaderPage, WPChapter } from './types';

const BASE_URL = 'https://mangalivre.blog';
const API_URL = `${BASE_URL}/wp-json/wp/v2`;
const CORS_PROXY = 'https://corsproxy.io/?url=';

function buildUrl(path: string): string {
  const raw = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  return Platform.OS === 'web' ? `${CORS_PROXY}${encodeURIComponent(raw)}` : raw;
}

function buildApiUrl(endpoint: string): string {
  const raw = `${API_URL}${endpoint}`;
  return Platform.OS === 'web' ? `${CORS_PROXY}${encodeURIComponent(raw)}` : raw;
}

const HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Referer': 'https://mangalivre.blog/',
};

const JSON_HEADERS: Record<string, string> = {
  'Accept': 'application/json',
  'Referer': 'https://mangalivre.blog/',
};

// ─── HTML Fetch ──────────────────────────────────────────────────────────────

async function fetchHtml(path: string): Promise<string> {
  const url = buildUrl(path);
  console.log('[MANGALIVRE] Fetching HTML:', path);
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.text();
}

// ─── JSON Fetch (WP REST API) ────────────────────────────────────────────────

async function fetchJson<T>(endpoint: string): Promise<T> {
  const url = buildApiUrl(endpoint);
  console.log('[MANGALIVRE] Fetching JSON:', endpoint);
  const res = await fetch(url, { headers: JSON_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${endpoint}`);
  return res.json();
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Get recent chapter updates (from WP REST API) */
export async function getRecentChapters(
  page = 1,
  perPage = 20,
): Promise<{ chapters: WPChapter[]; mangaSlugs: Map<string, string> }> {
  const data = await fetchJson<WPChapter[]>(
    `/chapter?per_page=${perPage}&page=${page}&orderby=date&order=desc`,
  );

  // Extract manga slugs from chapter titles ("Manga Name – Capítulo X")
  const mangaSlugs = new Map<string, string>();
  for (const ch of data) {
    const title = ch.title.rendered.replace(/&#8211;/g, '–');
    const parts = title.split(' \u2013 ');
    if (parts.length >= 2) {
      const mangaName = parts[0].trim();
      // Guess slug from chapter slug (remove -capitulo-XX from end)
      const slugMatch = ch.slug.match(/^(.+?)-capitulo-\d/);
      if (slugMatch) {
        mangaSlugs.set(mangaName, slugMatch[1]);
      }
    }
  }

  return { chapters: data, mangaSlugs };
}

/** Search chapters by query (from WP REST API) */
export async function searchChapters(query: string): Promise<WPChapter[]> {
  return fetchJson<WPChapter[]>(
    `/chapter?search=${encodeURIComponent(query)}&per_page=20&orderby=date&order=desc`,
  );
}

/** Get manga listing page (HTML scraping) */
export async function getMangaListing(
  page = 1,
  options?: { orderby?: 'title' | 'latest' | 'views'; status?: string },
): Promise<MLManga[]> {
  let path = `/manga/page/${page}/`;
  const params: string[] = [];
  if (options?.orderby) params.push(`orderby=${options.orderby}`);
  if (options?.status) params.push(`manga_status=${options.status}`);
  if (params.length > 0) path += '?' + params.join('&');

  const html = await fetchHtml(path);
  return parseMangaCards(html);
}

/** Get popular mangas from home page "Mais Vistos" section */
export async function getPopularMangas(): Promise<MLManga[]> {
  const html = await fetchHtml('/');
  const popular = parseHomePopular(html);
  return popular.map((m) => ({
    slug: m.slug,
    title: m.title,
    coverUrl: m.coverUrl,
    status: '',
    genres: [],
    url: m.url,
  }));
}

/** Get recent manga updates from home page "Últimas Atualizações" */
export async function getRecentMangas(page = 1): Promise<MLManga[]> {
  const path = page > 1 ? `/page/${page}/` : '/';
  const html = await fetchHtml(path);
  const latest = parseHomeLatest(html);
  return latest.map((m) => ({
    slug: m.slug,
    title: m.title,
    coverUrl: m.coverUrl,
    status: '',
    genres: [],
    url: m.url,
  }));
}

/** Get manga detail page (HTML scraping) */
export async function getMangaDetail(slug: string): Promise<MLMangaDetail> {
  const html = await fetchHtml(`/manga/${slug}/`);
  const parsed = parseMangaDetail(html);

  return {
    slug,
    title: parsed.title,
    coverUrl: parsed.coverUrl,
    description: parsed.description,
    status: parsed.status,
    type: parsed.type,
    author: parsed.author,
    artist: parsed.artist,
    genres: parsed.genres,
    rating: parsed.rating,
    views: parsed.views,
    totalChapters: parsed.chapters.length,
    chapters: parsed.chapters.map((ch, i) => ({
      id: i, // No WP id from HTML, use index
      slug: ch.slug,
      number: ch.number,
      title: ch.title,
      date: ch.date,
      url: ch.url,
    })),
  };
}

/** Get chapter page images (HTML scraping) */
export async function getChapterPages(chapterSlug: string): Promise<MLReaderPage[]> {
  const html = await fetchHtml(`/capitulo/${chapterSlug}/`);
  const images = parseChapterImages(html);

  return images.map((url, i) => ({
    pageNumber: i + 1,
    imageUrl: url,
  }));
}

/** Search mangas by name (HTML scraping from search page) */
export async function searchMangas(query: string): Promise<MLManga[]> {
  const html = await fetchHtml(`/?s=${encodeURIComponent(query)}`);
  // Try parsing manga-card (listing style) first, then manga-card-modern
  let results = parseMangaCards(html);
  if (results.length === 0) {
    // Fallback: parse any manga links with covers
    const linkRegex = /<a[^>]*href="https?:\/\/mangalivre\.blog\/manga\/([^/"]+)\/"[^>]*>[\s\S]*?<\/a>/gi;
    const matches: RegExpExecArray[] = [];
    let m;
    const re = new RegExp(linkRegex.source, 'gi');
    while ((m = re.exec(html)) !== null) matches.push(m);

    const seen = new Set<string>();
    for (const match of matches) {
      const slug = match[1];
      if (seen.has(slug)) continue;
      seen.add(slug);

      const block = match[0];
      const imgMatch = block.match(/src="(https?:\/\/mangalivre\.blog\/wp-content\/uploads\/[^"]+)"/i);
      const titleMatch = block.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i)
        || block.match(/title="([^"]+)"/i);
      const title = titleMatch
        ? titleMatch[1].replace(/<[^>]*>/g, '').replace(/&#8211;/g, '\u2013').trim()
        : slug.replace(/-/g, ' ');

      results.push({
        slug,
        title,
        coverUrl: imgMatch ? imgMatch[1] : null,
        status: '',
        genres: [],
        url: `${BASE_URL}/manga/${slug}/`,
      });
    }
  }
  return results;
}
