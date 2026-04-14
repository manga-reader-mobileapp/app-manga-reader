export interface MLManga {
  slug: string;
  title: string;
  coverUrl: string | null;
  status: string; // "em-andamento", "completo", etc
  genres: string[];
  url: string;
}

export interface MLMangaDetail {
  slug: string;
  title: string;
  coverUrl: string | null;
  description: string;
  status: string;
  type: string;
  author: string;
  artist: string;
  genres: string[];
  rating: number | null;
  views: number;
  totalChapters: number;
  chapters: MLChapter[];
}

export interface MLChapter {
  id: number; // WP post id
  slug: string;
  number: string;
  title: string | null;
  date: string; // ISO date
  url: string;
}

export interface MLReaderPage {
  pageNumber: number;
  imageUrl: string;
}

// WP REST API chapter response
export interface WPChapter {
  id: number;
  date: string;
  slug: string;
  title: { rendered: string };
  link: string;
}
