export interface NexusCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  type: 'genre' | 'theme';
  isNsfw: boolean;
}

export interface NexusMangaCategory {
  id: number;
  mangaId: number;
  categoryId: number;
  category: NexusCategory;
}

export interface NexusChapter {
  id: number;
  mangaId: number;
  number: string;
  title: string | null;
  views: number;
  createdAt: string;
  releaseStatus?: string;
  accessLevel?: string;
  coinCost?: number;
  scanGroups?: unknown[];
}

export interface NexusManga {
  id: number;
  title: string;
  slug: string;
  alternativeTitles: string;
  author: string;
  artist: string;
  description: string;
  coverImage: string | null;
  bannerImage: string | null;
  status: 'ongoing' | 'completed' | 'hiatus' | 'cancelled';
  type: 'manga' | 'manhua' | 'manhwa' | 'novel';
  isNsfw: boolean;
  isVipOnly: boolean;
  views: number;
  rating: number | null;
  releaseYear: number | null;
  chapterCount: number;
  chapters: NexusChapter[];
  categories: NexusMangaCategory[];
  createdAt: string;
  updatedAt: string;
  lastChapterAt: string;
  officialLink: string | null;
  uploaderId: number | null;
  vipCoinCost: number | null;
}

export interface NexusPaginatedResponse<T> {
  data: T[];
  limit: number;
  page: number;
  pages: number;
  total: number;
}

export interface NexusMangaDetail {
  id: number;
  title: string;
  slug: string;
  alternativeTitles: string;
  author: string;
  artist: string;
  description: string;
  coverImage: string | null;
  bannerImage: string | null;
  status: 'ongoing' | 'completed' | 'hiatus' | 'cancelled';
  type: 'manga' | 'manhua' | 'manhwa' | 'novel' | 'webtoon';
  isNsfw: boolean;
  isVipOnly: boolean;
  views: number;
  rating: number | null;
  releaseYear: number | null;
  chapters: NexusChapter[];
  categories: NexusCategory[];
  createdAt: string;
  officialLink: string | null;
  vipCoinCost: number | null;
}

export interface NexusChapterRead {
  id: number;
  mangaId: number;
  number: string;
  title: string | null;
  views: number;
  pageToken: string;
  totalPages: number;
  accessLevel: string;
  releaseStatus: string;
  createdAt: string;
  scanGroups: unknown[] | null;
  manga: NexusMangaDetail;
  pages: { pageNumber: number }[];
}

export interface NexusReaderPage {
  pageNumber: number;
  imageUrl: string;
}

export interface NexusEncryptedResponse {
  d: string;
  k: number;
  v: number;
}
