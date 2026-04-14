/**
 * Simple HTML parser utilities for MangaLivre scraping.
 * No external dependencies — uses regex on raw HTML strings.
 */

/** Extract all matches of a regex with named groups */
export function matchAll(html: string, regex: RegExp): RegExpExecArray[] {
  const results: RegExpExecArray[] = [];
  let match;
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  while ((match = re.exec(html)) !== null) {
    results.push(match);
  }
  return results;
}

/** Extract text content from an HTML tag (strips tags) */
export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

/** Decode HTML entities */
export function decodeEntities(str: string): string {
  return str
    .replace(/&#8211;/g, '\u2013')
    .replace(/&#8212;/g, '\u2014')
    .replace(/&#8217;/g, '\u2019')
    .replace(/&#8216;/g, '\u2018')
    .replace(/&#8220;/g, '\u201C')
    .replace(/&#8221;/g, '\u201D')
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/** Extract attribute value from an HTML tag */
export function getAttr(tag: string, attr: string): string | null {
  const re = new RegExp(`${attr}=["']([^"']*)["']`);
  const match = tag.match(re);
  return match ? match[1] : null;
}

/** Extract manga cards from listing page HTML */
export function parseMangaCards(html: string): Array<{
  slug: string;
  title: string;
  coverUrl: string | null;
  status: string;
  genres: string[];
  url: string;
}> {
  const cards: Array<{
    slug: string;
    title: string;
    coverUrl: string | null;
    status: string;
    genres: string[];
    url: string;
  }> = [];

  // Match each manga-card article
  const cardRegex = /<article[^>]*class="manga-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  const cardMatches = matchAll(html, cardRegex);

  for (const match of cardMatches) {
    const cardHtml = match[0];
    const classAttr = getAttr(cardHtml.split('>')[0] + '>', 'class') || '';

    // Extract URL and slug
    const linkMatch = cardHtml.match(/href="https?:\/\/[^"]*\/manga\/([^/"]+)\/?"/);
    if (!linkMatch) continue;
    const slug = linkMatch[1];
    const url = linkMatch[0].replace('href="', '').replace('"', '');

    // Extract cover image
    const imgMatch = cardHtml.match(/src="(https?:\/\/[^"]*\.(jpg|png|webp)[^"]*)"/i);
    const coverUrl = imgMatch ? imgMatch[1] : null;

    // Extract title
    const titleMatch = cardHtml.match(/<h3[^>]*class="[^"]*manga-card-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i)
      || cardHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const title = titleMatch ? decodeEntities(stripTags(titleMatch[1])) : slug.replace(/-/g, ' ');

    // Extract status from class (manga_status-em-andamento)
    const statusMatch = classAttr.match(/manga_status-([^\s"]+)/);
    const status = statusMatch ? statusMatch[1] : '';

    // Extract genres from class (genre-comedy genre-fantasy)
    const genres: string[] = [];
    const genreMatches = classAttr.matchAll(/genre-([^\s"]+)/g);
    for (const gm of genreMatches) {
      genres.push(gm[1].replace(/-/g, ' '));
    }

    cards.push({ slug, title, coverUrl, status, genres, url });
  }

  return cards;
}

/** Extract "Últimas Atualizações" from home page (manga-card-modern) */
export function parseHomeLatest(html: string): Array<{
  slug: string;
  title: string;
  coverUrl: string | null;
  latestChapter: string;
  url: string;
}> {
  const results: Array<{ slug: string; title: string; coverUrl: string | null; latestChapter: string; url: string }> = [];

  // Get only the FIRST latest-section
  const sectionMatch = html.match(/<section[^>]*class="latest-section"[^>]*>([\s\S]*?)<\/section>/i);
  const sectionHtml = sectionMatch ? sectionMatch[1] : '';
  if (!sectionHtml) return results;

  const cardRegex = /<article[^>]*class="manga-card-modern"[^>]*>([\s\S]*?)<\/article>/gi;
  const cards = matchAll(sectionHtml, cardRegex);

  for (const match of cards) {
    const cardHtml = match[0];

    // Slug + URL
    const linkMatch = cardHtml.match(/href="https?:\/\/mangalivre\.blog\/manga\/([^/"]+)\/?"/);
    if (!linkMatch) continue;
    const slug = linkMatch[1];

    // Cover
    const imgMatch = cardHtml.match(/src="(https?:\/\/mangalivre\.blog\/wp-content\/uploads\/[^"]+)"/i);
    const coverUrl = imgMatch ? imgMatch[1] : null;

    // Title
    const titleMatch = cardHtml.match(/manga-title-modern[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    const title = titleMatch ? decodeEntities(stripTags(titleMatch[1])) : slug.replace(/-/g, ' ');

    // Latest chapter
    const chMatch = cardHtml.match(/chapter-number-modern[^>]*>([\s\S]*?)<\/span>/i);
    const latestChapter = chMatch ? stripTags(chMatch[1]).replace(/Cap[ií]tulo\s*/i, '') : '';

    results.push({
      slug,
      title,
      coverUrl,
      latestChapter,
      url: `https://mangalivre.blog/manga/${slug}/`,
    });
  }

  return results;
}

/** Extract popular mangas from home page HTML (different structure than listing) */
export function parseHomePopular(html: string): Array<{
  slug: string;
  title: string;
  coverUrl: string | null;
  url: string;
}> {
  const results: Array<{ slug: string; title: string; coverUrl: string | null; url: string }> = [];

  // The home page has manga links with covers — find all manga links with images
  // Pattern: <a href="/manga/{slug}/"> ... <img src="..."> ... title
  const sectionMatch = html.match(/<section[^>]*class="most-viewed-section"[^>]*>([\s\S]*?)<\/section>/i);
  const section = sectionMatch ? sectionMatch[1] : '';

  const linkRegex = /<a[^>]*href="https?:\/\/mangalivre\.blog\/manga\/([^/"]+)\/"[^>]*>[\s\S]*?<\/a>/gi;
  const links = matchAll(section, linkRegex);

  const seen = new Set<string>();
  for (const match of links) {
    const slug = match[1];
    if (seen.has(slug)) continue;
    seen.add(slug);

    const block = match[0];
    const imgMatch = block.match(/src="(https?:\/\/mangalivre\.blog\/wp-content\/uploads\/[^"]+)"/i);
    const titleMatch = block.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
    const title = titleMatch ? decodeEntities(stripTags(titleMatch[1])) : slug.replace(/-/g, ' ');

    results.push({
      slug,
      title,
      coverUrl: imgMatch ? imgMatch[1] : null,
      url: `https://mangalivre.blog/manga/${slug}/`,
    });
  }

  return results;
}

/** Extract chapter images from reader page HTML */
export function parseChapterImages(html: string): string[] {
  const images: string[] = [];

  // Match images in chapter content area
  const imgRegex = /src="(https?:\/\/mangalivre\.blog\/wp-content\/uploads\/[^"]+\.(jpg|png|webp)[^"]*)"/gi;
  const matches = matchAll(html, imgRegex);

  for (const match of matches) {
    const url = match[1];
    // Skip thumbnails, icons, flags
    if (url.includes('flagcdn') || url.includes('icon') || url.includes('logo')) continue;
    if (!images.includes(url)) {
      images.push(url);
    }
  }

  return images;
}

/** Extract manga detail from manga page HTML */
export function parseMangaDetail(html: string): {
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
  chapters: Array<{ slug: string; number: string; title: string | null; url: string; date: string }>;
} {
  // Extract just the manga-info section to avoid matching scripts/footer
  const infoBlock = html.match(/<div[^>]*class="manga-info"[^>]*>([\s\S]*?)<div[^>]*class="manga-actions"/i);
  const info = infoBlock ? infoBlock[1] : html;

  // Title (h1.manga-title — strip the flag img)
  const titleMatch = info.match(/manga-title[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? decodeEntities(stripTags(titleMatch[1])) : '';

  // Cover (wp-post-image in the page)
  const coverMatch = html.match(/wp-post-image[^>]*src="(https?:\/\/[^"]+)"/i)
    || html.match(/manga-cover[^>]*>[\s\S]*?src="(https?:\/\/mangalivre\.blog\/wp-content\/uploads\/[^"]+)"/i);
  const coverUrl = coverMatch ? coverMatch[1] : null;

  // Description (synopsis-content > p)
  const descMatch = info.match(/synopsis-content[\s\S]*?<p>([\s\S]*?)<\/p>/i);
  const description = descMatch ? decodeEntities(stripTags(descMatch[1])) : '';

  // Rating (manga-rating > span — the span after the SVG)
  const ratingMatch = info.match(/manga-rating[\s\S]*?<span>([\d.]+)<\/span>/i);
  const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

  // Views
  const viewsMatch = info.match(/([\d,.]+)\s*visualiza/i);
  const views = viewsMatch ? parseInt(viewsMatch[1].replace(/[.,]/g, ''), 10) : 0;

  // Meta grid items
  let status = '', type = '', author = '', artist = '';
  const metaItems = matchAll(info, /manga-meta-item[\s\S]*?meta-label[^>]*>([\s\S]*?)<\/span>[\s\S]*?meta-value[^>]*>([\s\S]*?)<\/span>/gi);
  for (const mi of metaItems) {
    const label = stripTags(mi[1]).trim().toLowerCase();
    const value = stripTags(mi[2]).trim();
    if (label.includes('status')) status = value;
    else if (label.includes('tipo')) type = value;
    else if (label.includes('autor')) author = value;
    else if (label.includes('artista')) artist = value;
  }

  // Genres (manga-tag spans inside manga-tags div)
  const genres: string[] = [];
  const tagsBlock = info.match(/manga-tags[\s\S]*?<\/div>/i)?.[0] || '';
  const genreRegex = /manga-tag">([\s\S]*?)<\/span>/gi;
  for (const gm of matchAll(tagsBlock, genreRegex)) {
    const g = stripTags(gm[1]).trim();
    if (g) genres.push(g);
  }

  // Chapters — find all <li> items with chapter links
  const chapters: Array<{ slug: string; number: string; title: string | null; url: string; date: string }> = [];
  const seen = new Set<string>();
  // Match each <li> containing a chapter link + relative date
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  for (const li of matchAll(html, liRegex)) {
    const liHtml = li[1];
    const linkMatch = liHtml.match(/href="https?:\/\/mangalivre\.blog\/capitulo\/([^"]+?)\/?"[^>]*>/i);
    if (!linkMatch) continue;

    const chSlug = linkMatch[1];
    if (seen.has(chSlug)) continue;
    seen.add(chSlug);

    const numMatch = chSlug.match(/capitulo-(\d+(?:[.-]\d+)?)/i);
    const chNum = numMatch ? numMatch[1].replace('-', '.') : '';
    if (!chNum) continue;

    // Extract date from <span class="chapter-date"> or loose text
    const dateSpan = liHtml.match(/chapter-date[^>]*>([\s\S]*?)<\/span>/i);
    let date = '';
    if (dateSpan) {
      date = stripTags(dateSpan[1]).trim();
    } else {
      const dateMatch = liHtml.match(/h[aá]\s+\d+\s+(?:minutos?|horas?|dias?|semanas?|mes(?:es)?|anos?)/i);
      if (dateMatch) date = dateMatch[0];
    }

    chapters.push({
      slug: chSlug,
      number: chNum,
      title: null,
      url: `https://mangalivre.blog/capitulo/${chSlug}/`,
      date,
    });
  }

  return { title, coverUrl, description, status, type, author, artist, genres, rating, views, chapters };
}
