import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getMangaBySlug } from '@/services/nexus/api';
import type { NexusChapter, NexusMangaDetail } from '@/services/nexus/types';
import {
  addToLibrary,
  isInLibrary,
  removeFromLibrary,
  getReadProgress,
  getLibraryEntry,
  syncLibraryCache,
  updateReadProgress,
  setCompletedChapter,
  getChapterPagesProgress,
  getReadChapterIds,
  markChaptersRead,
  markChaptersUnread,
  type CachedChapter,
} from '@/services/library';
import {
  enqueueChapters,
  isChapterDownloaded,
  onQueueChange,
  getDownloadQueue,
  deleteDownloadedChapter,
  type QueueItem,
} from '@/services/downloads';

// Unified chapter type for display (works for both online and cached)
interface DisplayChapter {
  id: number;
  number: string;
  title: string | null;
  views: number;
  createdAt: string;
}

export default function MangaDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [manga, setManga] = useState<NexusMangaDetail | null>(null);
  const [chapters, setChapters] = useState<DisplayChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [inLib, setInLib] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastRead, setLastRead] = useState<string | null>(null); // current position chapter
  const [lastReadPage, setLastReadPage] = useState<number | null>(null);
  const [completedChap, setCompletedChap] = useState<string | null>(null); // legacy
  const [readIds, setReadIds] = useState<Set<number>>(new Set()); // per-chapter read
  const [chaptersAsc, setChaptersAsc] = useState(false); // Default: 99→1

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Downloaded chapters tracking
  const [downloadedIds, setDownloadedIds] = useState<Set<number>>(new Set());
  const [queueIds, setQueueIds] = useState<Set<number>>(new Set());
  const [chapterPagesMap, setChapterPagesMap] = useState<Record<number, number>>({});

  // Manga metadata (from API or cache)
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [localCover, setLocalCover] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [mangaType, setMangaType] = useState('');
  const [description, setDescription] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [views, setViews] = useState(0);
  const [rating, setRating] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [mangaId, setMangaId] = useState(0);

  useEffect(() => {
    if (slug) loadManga();
  }, [slug]);

  // Reload progress every time screen gets focus (returning from reader)
  useFocusEffect(
    useCallback(() => {
      if (!mangaId) return;
      // Small delay to ensure AsyncStorage writes from the reader are flushed
      const timer = setTimeout(() => {
        getReadProgress('nexus', mangaId).then((progress) => {
          if (progress) {
            setLastRead(progress.chapter);
            setLastReadPage(progress.page);
            setCompletedChap(progress.completedChapter);
          }
        });
        getChapterPagesProgress('nexus', mangaId).then(setChapterPagesMap);
        getReadChapterIds('nexus', mangaId).then(setReadIds);
        // Refresh downloaded status
        (async () => {
          const ids = new Set<number>();
          for (const ch of chapters) {
            const done = await isChapterDownloaded('nexus', mangaId, ch.id);
            if (done) ids.add(ch.id);
          }
          setDownloadedIds(ids);
        })();
      }, 300);
      return () => clearTimeout(timer);
    }, [mangaId, chapters]),
  );

  // Listen to download queue changes
  useEffect(() => {
    const unsub = onQueueChange((queue) => {
      setQueueIds(new Set(queue.map((q) => q.chapterId)));
    });
    getDownloadQueue().then((q) => setQueueIds(new Set(q.map((qi) => qi.chapterId))));
    return unsub;
  }, []);

  // Check downloaded chapters when chapters change
  useEffect(() => {
    if (chapters.length === 0 || !mangaId) return;
    async function checkDownloaded() {
      const ids = new Set<number>();
      for (const ch of chapters) {
        const done = await isChapterDownloaded('nexus', mangaId, ch.id);
        if (done) ids.add(ch.id);
      }
      setDownloadedIds(ids);
    }
    checkDownloaded();
  }, [chapters, mangaId]);

  async function loadManga() {
    console.log('[DETAIL] Loading manga:', slug);
    setLoading(true);

    // 1) Check library for cached data first
    // We don't know mangaId from slug, so we search by slug
    let libEntry = null;
    try {
      const { getLibrary } = await import('@/services/library');
      const lib = await getLibrary();
      libEntry = lib.find((m) => m.slug === slug) || null;
    } catch {}

    // 2) Try loading from API
    try {
      const data = await getMangaBySlug(slug!);
      console.log('[DETAIL] Loaded from API:', data.title, 'chapters:', data.chapters?.length);
      setManga(data);
      setMangaId(data.id);
      setCoverUrl(data.coverImage);
      setTitle(data.title);
      setAuthor(data.author || '');
      setMangaType(data.type);
      setDescription(data.description || null);
      setCategories(data.categories?.map((c) => c.name) || []);
      setViews(data.views);
      setRating(data.rating);
      setStatus(data.status);
      setChapters(
        (data.chapters || []).map((c) => ({
          id: c.id,
          number: c.number,
          title: c.title,
          views: c.views,
          createdAt: c.createdAt,
        })),
      );
      setIsOfflineMode(false);

      // Sync cache if in library
      const saved = await isInLibrary('nexus', data.id);
      setInLib(saved);
      if (saved) {
        await syncLibraryCache('nexus', data.id, {
          totalChapters: data.chapters?.length || 0,
          cachedChapters: (data.chapters || []).map((c) => ({
            id: c.id,
            number: c.number,
            title: c.title,
            views: c.views,
            createdAt: c.createdAt,
          })),
          cachedDescription: data.description || null,
          cachedRating: data.rating,
          cachedViews: data.views,
          lastChapterAt: data.chapters?.[0]?.createdAt || null,
          status: data.status,
        });
        const progress = await getReadProgress('nexus', data.id);
        setLastRead(progress?.chapter || null);
        setLastReadPage(progress?.page || null);
        setCompletedChap(progress?.completedChapter || null);
      }
    } catch (err) {
      console.warn('[DETAIL] API failed, trying cache:', err);

      // 3) Fallback to cached data
      if (libEntry && libEntry.cachedChapters?.length > 0) {
        console.log('[DETAIL] Using cached data for:', libEntry.title);
        setManga(null);
        setMangaId(libEntry.sourceId);
        setCoverUrl(libEntry.coverUrl);
        setLocalCover(libEntry.localCover);
        setTitle(libEntry.title);
        setAuthor(libEntry.author || '');
        setMangaType(libEntry.type);
        setDescription(libEntry.cachedDescription || null);
        setCategories(libEntry.categories || []);
        setViews(libEntry.cachedViews || 0);
        setRating(libEntry.cachedRating);
        setStatus(libEntry.status);
        setChapters(libEntry.cachedChapters);
        setInLib(true);
        setIsOfflineMode(true);

        const progress = await getReadProgress('nexus', libEntry.sourceId);
        setLastRead(progress?.chapter || null);
        setLastReadPage(progress?.page || null);
        setCompletedChap(progress?.completedChapter || null);
      } else {
        // No cache, show error
        setManga(null);
        setChapters([]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function toggleLibrary() {
    if (!mangaId) return;
    setSaving(true);
    try {
      if (inLib) {
        await removeFromLibrary('nexus', mangaId);
        setInLib(false);
      } else {
        await addToLibrary({
          source: 'nexus',
          sourceId: mangaId,
          slug: slug!,
          title,
          author,
          type: mangaType,
          status,
          coverUrl,
          totalChapters: chapters.length,
          categories,
          lastChapterAt: chapters[0]?.createdAt || null,
          cachedChapters: chapters,
          cachedDescription: description,
          cachedRating: rating,
          cachedViews: views,
        });
        setInLib(true);
      }
    } catch (err) {
      console.error('[DETAIL] Library error:', err);
    } finally {
      setSaving(false);
    }
  }

  // --- Selection mode ---

  function toggleSelect(chapterId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }

  function exitSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function selectAll() {
    setSelectedIds(new Set(chapters.map((c) => c.id)));
  }

  async function downloadSelected() {
    if (selectedIds.size === 0 || !mangaId) return;
    setDownloading(true);
    try {
      const selected = chapters
        .filter((c) => selectedIds.has(c.id))
        .map((c) => ({ id: c.id, number: c.number, title: c.title }));

      await enqueueChapters({
        source: 'nexus',
        sourceId: mangaId,
        slug: slug!,
        mangaTitle: title,
        coverUrl,
        chapters: selected,
      });
      exitSelection();
    } catch (err) {
      console.error('[DETAIL] Download enqueue error:', err);
    } finally {
      setDownloading(false);
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0 || !mangaId) return;
    for (const chId of selectedIds) {
      if (downloadedIds.has(chId)) {
        await deleteDownloadedChapter('nexus', mangaId, chId);
      }
    }
    // Refresh downloaded list
    const ids = new Set<number>();
    for (const ch of chapters) {
      const done = await isChapterDownloaded('nexus', mangaId, ch.id);
      if (done) ids.add(ch.id);
    }
    setDownloadedIds(ids);
    exitSelection();
  }

  /** Mark selected chapters as read (set progress to the highest selected) */
  async function markSelectedAsRead() {
    if (selectedIds.size === 0 || !mangaId) return;
    const ids = [...selectedIds];
    await markChaptersRead('nexus', mangaId, ids);
    setReadIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.add(id)); return next; });
    exitSelection();
  }

  async function markBelowAsRead() {
    if (selectedIds.size === 0 || !mangaId) return;
    // Find highest selected, mark all from first up to it
    const selected = chapters.filter((c) => selectedIds.has(c.id));
    const highest = selected.sort((a, b) => parseFloat(b.number) - parseFloat(a.number))[0];
    const sorted = [...chapters].sort((a, b) => parseFloat(a.number) - parseFloat(b.number));
    const ids = sorted
      .filter((c) => parseFloat(c.number) <= parseFloat(highest.number))
      .map((c) => c.id);
    await markChaptersRead('nexus', mangaId, ids);
    setReadIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.add(id)); return next; });
    exitSelection();
  }

  async function markSelectedAsUnread() {
    if (selectedIds.size === 0 || !mangaId) return;
    const ids = [...selectedIds];
    await markChaptersUnread('nexus', mangaId, ids);
    setReadIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    exitSelection();
  }

  async function downloadAll() {
    if (!mangaId || chapters.length === 0) return;
    setShowMenu(false);
    await enqueueChapters({
      source: 'nexus',
      sourceId: mangaId,
      slug: slug!,
      mangaTitle: title,
      coverUrl,
      chapters: chapters.map((c) => ({ id: c.id, number: c.number, title: c.title })),
    });
  }

  async function markAllAsRead() {
    if (!mangaId || chapters.length === 0) return;
    setShowMenu(false);
    const allIds = chapters.map((c) => c.id);
    await markChaptersRead('nexus', mangaId, allIds);
    setReadIds(new Set(allIds));
  }

  function formatViews(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
    return String(v);
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function openReader(ch: DisplayChapter) {
    const chaptersForNav = chaptersAscending.map((c) => ({ id: c.id, number: c.number }));
    const params: Record<string, string> = {
      chapterId: String(ch.id),
      mangaTitle: title,
      mangaSlug: slug!,
      mangaCover: coverUrl || '',
      chapterNumber: ch.number,
      chapterList: JSON.stringify(chaptersForNav),
      sourceMangaId: String(mangaId),
    };
    if (downloadedIds.has(ch.id)) {
      params.offline = 'true';
      params.offlineSource = 'nexus';
      params.offlineSourceId = String(mangaId);
    }
    router.push({ pathname: '/reader/[chapterId]', params: params as any });
  }

  function handleContinueReading() {
    if (chapters.length === 0) return;

    const sorted = [...chapters].sort((a, b) => parseFloat(a.number) - parseFloat(b.number));

    // Find first unread chapter
    let targetChapter: DisplayChapter;
    const firstUnread = sorted.find((c) => !readIds.has(c.id));
    targetChapter = firstUnread || sorted[0];

    const chaptersForNav = sorted.map((c) => ({ id: c.id, number: c.number }));
    const params: Record<string, string> = {
      chapterId: String(targetChapter.id),
      mangaTitle: title,
      mangaSlug: slug!,
      chapterNumber: targetChapter.number,
      chapterList: JSON.stringify(chaptersForNav),
    };
    if (downloadedIds.has(targetChapter.id)) {
      params.offline = 'true';
      params.offlineSource = 'nexus';
      params.offlineSourceId = String(mangaId);
    }
    router.push({ pathname: '/reader/[chapterId]', params: params as any });
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centerBox, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <ThemedText style={styles.loadingText}>Carregando...</ThemedText>
      </View>
    );
  }

  if (chapters.length === 0 && !manga) {
    return (
      <View style={[styles.container, styles.centerBox, { paddingTop: insets.top }]}>
        <ThemedText style={styles.loadingText}>Mangá não encontrado</ThemedText>
        <ThemedText style={{ fontSize: 12, color: Colors.dark.textMuted, marginTop: 4 }}>Sem conexão e sem dados em cache</ThemedText>
        <Pressable onPress={() => router.back()}>
          <ThemedText style={styles.backLink}>Voltar</ThemedText>
        </Pressable>
      </View>
    );
  }

  // Always ascending for navigation
  const chaptersAscending = [...chapters].sort(
    (a, b) => parseFloat(a.number) - parseFloat(b.number),
  );

  // Display order based on user toggle (default: descending 99→1)
  const sortedChapters = chaptersAsc ? chaptersAscending : [...chaptersAscending].reverse();

  const cover = localCover || coverUrl;
  const selectedDownloadedCount = [...selectedIds].filter((id) => downloadedIds.has(id)).length;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          {cover && (
            <Image source={{ uri: cover }} style={styles.heroBg} contentFit="cover" blurRadius={20} />
          )}
          <View style={styles.heroBgOverlay} />

          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <ThemedText style={styles.backBtnText}>{'‹'}</ThemedText>
            </Pressable>
            {isOfflineMode && (
              <View style={styles.offlineBadge}>
                <IconSymbol name="globe" size={12} color={Colors.dark.textMuted} />
                <ThemedText style={styles.offlineBadgeText}>Offline</ThemedText>
              </View>
            )}
            <Pressable style={styles.backBtn} onPress={() => setShowMenu((v) => !v)}>
              <ThemedText style={styles.backBtnText}>⋯</ThemedText>
            </Pressable>
          </View>

          {/* Popover menu */}
          {showMenu && (
            <>
              <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)} />
              <View style={[styles.popover, { top: insets.top + 56 }]}>
                <Pressable style={styles.popoverItem} onPress={downloadAll}>
                  <IconSymbol name="arrow.down.circle.fill" size={16} color={Colors.dark.primaryLight} />
                  <ThemedText style={styles.popoverText}>Baixar tudo</ThemedText>
                </Pressable>
                <View style={styles.popoverDivider} />
                <Pressable style={styles.popoverItem} onPress={markAllAsRead}>
                  <IconSymbol name="checkmark.circle.fill" size={16} color="#10B981" />
                  <ThemedText style={styles.popoverText}>Marcar tudo como lido</ThemedText>
                </Pressable>
              </View>
            </>
          )}

          <View style={styles.coverContainer}>
            {cover ? (
              <Image source={{ uri: cover }} style={styles.coverImage} contentFit="cover" transition={300} />
            ) : (
              <View style={[styles.coverImage, styles.coverPlaceholder]}>
                <IconSymbol name="book.fill" size={48} color={Colors.dark.textMuted} />
              </View>
            )}
          </View>

          <ThemedText style={styles.mangaTitle}>{title}</ThemedText>
          {author ? (
            <ThemedText style={styles.mangaAuthor}>by {author}</ThemedText>
          ) : (
            <ThemedText style={styles.mangaAuthor}>{mangaType}</ThemedText>
          )}

          <View style={styles.categoryRow}>
            {categories.map((cat, i) => (
              <View key={i} style={styles.categoryTag}>
                <ThemedText style={styles.categoryTagText}>{cat}</ThemedText>
              </View>
            ))}
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionBtn, inLib && styles.actionBtnActive]}
            onPress={toggleLibrary}
            disabled={saving}
          >
            <IconSymbol
              name={inLib ? 'bookmark.fill' : 'bookmark'}
              size={20}
              color={inLib ? Colors.dark.primary : Colors.dark.textSecondary}
            />
            <ThemedText style={[styles.actionBtnText, inLib && styles.actionBtnTextActive]}>
              {saving ? 'Salvando...' : inLib ? 'Na Biblioteca' : 'Adicionar'}
            </ThemedText>
          </Pressable>

          {chapters.length > 0 ? (() => {
            const allCompleted = chaptersAscending.every((c) => readIds.has(c.id));

            if (allCompleted && readIds.size > 0) {
              return (
                <View style={[styles.actionBtn, styles.actionBtnDone]}>
                  <IconSymbol name="checkmark" size={18} color="#10B981" />
                  <ThemedText style={styles.actionBtnTextDone}>Sem capítulos</ThemedText>
                </View>
              );
            }

            // Find first unread chapter
            const nextCh = chaptersAscending.find((c) => !readIds.has(c.id));

            return (
              <Pressable
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={handleContinueReading}
              >
                <IconSymbol name="play.fill" size={18} color="#fff" />
                <ThemedText style={styles.actionBtnTextPrimary}>
                  {readIds.size > 0 ? `Continuar Cap. ${nextCh?.number || ''}` : 'Começar a ler'}
                </ThemedText>
              </Pressable>
            );
          })() : null}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <ThemedText style={styles.statValue}>{formatViews(views)}</ThemedText>
            <ThemedText style={styles.statLabel}>Views</ThemedText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <ThemedText style={styles.statValue}>{chapters.length}</ThemedText>
            <ThemedText style={styles.statLabel}>Capítulos</ThemedText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <ThemedText style={styles.statValue}>{rating ? rating.toFixed(1) : '—'}</ThemedText>
            <ThemedText style={styles.statLabel}>Rating</ThemedText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <ThemedText style={[styles.statValue, styles.statusValue]}>
              {status === 'ongoing' ? 'Em andamento' : status}
            </ThemedText>
            <ThemedText style={styles.statLabel}>Status</ThemedText>
          </View>
        </View>

        {/* Description */}
        {description ? (
          <View style={styles.descSection}>
            <ThemedText style={styles.sectionTitle}>Descrição</ThemedText>
            <ThemedText style={styles.descText} numberOfLines={showFullDesc ? undefined : 4}>
              {description}
            </ThemedText>
            <Pressable onPress={() => setShowFullDesc(!showFullDesc)}>
              <ThemedText style={styles.readMore}>{showFullDesc ? 'Ver menos' : 'Ver mais'}</ThemedText>
            </Pressable>
          </View>
        ) : null}

        {/* Chapters */}
        <View style={styles.chaptersSection}>
          <View style={styles.chapterHeader}>
            {selectionMode ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable onPress={exitSelection} style={styles.selectionCloseBtn}>
                    <IconSymbol name="xmark" size={18} color={Colors.dark.text} />
                  </Pressable>
                  <ThemedText style={styles.sectionTitle}>
                    {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
                  </ThemedText>
                </View>
                <Pressable onPress={selectAll}>
                  <ThemedText style={styles.selectAllText}>Selecionar tudo</ThemedText>
                </Pressable>
              </>
            ) : (
              <>
                <ThemedText style={styles.sectionTitle}>Capítulos</ThemedText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ThemedText style={styles.chapterCount}>{chapters.length} caps</ThemedText>
                  <Pressable style={styles.sortBtn} onPress={() => setChaptersAsc((v) => !v)}>
                    <ThemedText style={styles.sortBtnText}>
                      {chaptersAsc ? '1→99' : '99→1'}
                    </ThemedText>
                  </Pressable>
                </View>
              </>
            )}
          </View>
          {sortedChapters.map((ch) => {
            const isSelected = selectedIds.has(ch.id);
            const isDownloaded = downloadedIds.has(ch.id);
            const isQueued = queueIds.has(ch.id);
            const isOfflineUnavailable = isOfflineMode && !isDownloaded;
            const isRead = readIds.has(ch.id);
            const pageProgress = chapterPagesMap[ch.id];
            const isCurrentChapter = lastRead === ch.number;

            return (
              <Pressable
                key={ch.id}
                style={[
                  styles.chapterItem,
                  isSelected && styles.chapterItemSelected,
                  isOfflineUnavailable && styles.chapterItemDisabled,
                  isRead && styles.chapterItemRead,
                ]}
                onPress={() => {
                  if (selectionMode) {
                    toggleSelect(ch.id);
                    return;
                  }
                  if (isOfflineUnavailable) return;
                  openReader(ch);
                }}
                onLongPress={() => {
                  if (!selectionMode) {
                    setSelectionMode(true);
                    setSelectedIds(new Set([ch.id]));
                  }
                }}
                delayLongPress={400}
                disabled={isOfflineUnavailable && !selectionMode}
              >
                {selectionMode && (
                  <IconSymbol
                    name={isSelected ? 'checkmark.circle.fill' : 'circle'}
                    size={22}
                    color={isSelected ? Colors.dark.primary : Colors.dark.textMuted}
                  />
                )}

                <View style={styles.chapterInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {isCurrentChapter && !isRead && (
                      <View style={styles.currentDot} />
                    )}
                    <ThemedText style={[styles.chapterNumber, isRead && styles.chapterTextRead, isOfflineUnavailable && { color: Colors.dark.textMuted }]}>
                      Capítulo {ch.number}
                    </ThemedText>
                  </View>
                  {ch.title && (
                    <ThemedText style={[styles.chapterTitle, isRead && styles.chapterTextRead]} numberOfLines={1}>{ch.title}</ThemedText>
                  )}
                </View>
                <View style={styles.chapterMeta}>
                  <ThemedText style={[styles.chapterDate, isRead && styles.chapterTextRead]}>{formatDate(ch.createdAt)}</ThemedText>
                  {pageProgress && !isRead ? (
                    <ThemedText style={styles.chapterPageProgress}>Página: {pageProgress}</ThemedText>
                  ) : (
                    <ThemedText style={[styles.chapterViews, isRead && styles.chapterTextRead]}>{formatViews(ch.views)} views</ThemedText>
                  )}
                </View>

                {isDownloaded ? (
                  <IconSymbol name="checkmark.circle.fill" size={16} color="#10B981" />
                ) : isQueued ? (
                  <ActivityIndicator size="small" color={Colors.dark.primary} />
                ) : isOfflineUnavailable ? (
                  <IconSymbol name="globe" size={14} color={Colors.dark.textMuted} />
                ) : !selectionMode ? (
                  <IconSymbol name="chevron.right" size={14} color={Colors.dark.textMuted} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: selectionMode ? insets.bottom + 100 : insets.bottom + 40 }} />
      </ScrollView>

      {/* ========== Floating action bar (selection mode) ========== */}
      {selectionMode && (
        <View style={[styles.floatingBar, { paddingBottom: insets.bottom + 12 }]}>
          {/* Mark as read */}
          <Pressable style={styles.fabBtn} onPress={markSelectedAsRead} disabled={selectedIds.size === 0}>
            <IconSymbol name="checkmark" size={22} color={selectedIds.size > 0 ? Colors.dark.text : Colors.dark.textMuted} />
          </Pressable>

          {/* Mark below as read */}
          <Pressable style={styles.fabBtn} onPress={markBelowAsRead} disabled={selectedIds.size === 0}>
            <IconSymbol name="checkmark.circle.fill" size={22} color={selectedIds.size > 0 ? Colors.dark.text : Colors.dark.textMuted} />
          </Pressable>

          {/* Mark as unread */}
          <Pressable style={styles.fabBtn} onPress={markSelectedAsUnread} disabled={selectedIds.size === 0}>
            <IconSymbol name="xmark" size={22} color={selectedIds.size > 0 ? Colors.dark.text : Colors.dark.textMuted} />
          </Pressable>

          {/* Download */}
          <Pressable
            style={styles.fabBtn}
            onPress={downloadSelected}
            disabled={selectedIds.size === 0 || downloading}
          >
            {downloading ? (
              <ActivityIndicator size={20} color={Colors.dark.primary} />
            ) : (
              <IconSymbol name="arrow.down.circle.fill" size={22} color={selectedIds.size > 0 ? Colors.dark.text : Colors.dark.textMuted} />
            )}
          </Pressable>

          {/* Delete (only if any selected are downloaded or in queue) */}
          {(selectedDownloadedCount > 0 || [...selectedIds].some((id) => queueIds.has(id))) && (
            <Pressable style={styles.fabBtn} onPress={deleteSelected}>
              <IconSymbol name="trash.fill" size={22} color={Colors.dark.text} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  centerBox: { justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: Colors.dark.textSecondary },
  backLink: { fontSize: 14, color: Colors.dark.primaryLight, marginTop: 8 },

  hero: { alignItems: 'center', paddingBottom: 24, overflow: 'hidden' },
  heroBg: { ...StyleSheet.absoluteFillObject, opacity: 0.4 },
  heroBgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.dark.background, opacity: 0.7 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.dark.surface + 'CC', justifyContent: 'center', alignItems: 'center' },
  backBtnText: { fontSize: 24, color: Colors.dark.text, fontWeight: '300', lineHeight: 28 },
  topTitle: { fontSize: 16, fontWeight: '600', color: Colors.dark.text },
  offlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.dark.surfaceLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  offlineBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.dark.textMuted },
  menuOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  popover: { position: 'absolute', right: 16, zIndex: 11, backgroundColor: Colors.dark.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.dark.border, paddingVertical: 4, minWidth: 200, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  popoverItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  popoverText: { fontSize: 14, fontWeight: '600', color: Colors.dark.text },
  popoverDivider: { height: 1, backgroundColor: Colors.dark.border, marginHorizontal: 12 },

  coverContainer: { marginTop: 8, marginBottom: 20, shadowColor: Colors.dark.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 24, elevation: 12 },
  coverImage: { width: 200, height: 280, borderRadius: 16 },
  coverPlaceholder: { backgroundColor: Colors.dark.surfaceLight, justifyContent: 'center', alignItems: 'center' },

  mangaTitle: { fontSize: 24, fontWeight: '800', color: Colors.dark.text, textAlign: 'center', paddingHorizontal: 32 },
  mangaAuthor: { fontSize: 14, color: Colors.dark.textSecondary, marginTop: 4 },

  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14, paddingHorizontal: 20 },
  categoryTag: { backgroundColor: Colors.dark.surfaceLight, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: Colors.dark.border },
  categoryTagText: { fontSize: 12, color: Colors.dark.primaryLight, fontWeight: '600' },

  actionRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginTop: 18 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.dark.surface, borderWidth: 1, borderColor: Colors.dark.border },
  actionBtnActive: { backgroundColor: Colors.dark.primary + '20', borderColor: Colors.dark.primary },
  actionBtnPrimary: { backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary },
  actionBtnDone: { backgroundColor: '#10B981' + '15', borderColor: '#10B981' + '40' },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: Colors.dark.textSecondary },
  actionBtnTextActive: { color: Colors.dark.primaryLight },
  actionBtnTextPrimary: { fontSize: 13, fontWeight: '700', color: '#fff' },
  actionBtnTextDone: { fontSize: 13, fontWeight: '700', color: '#10B981' },

  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginHorizontal: 20, marginTop: 20, backgroundColor: Colors.dark.surface, borderRadius: 16, paddingVertical: 16, borderWidth: 1, borderColor: Colors.dark.border },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 16, fontWeight: '800', color: Colors.dark.text },
  statusValue: { fontSize: 11, fontWeight: '700' },
  statLabel: { fontSize: 11, color: Colors.dark.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.dark.border },

  descSection: { marginTop: 24, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.dark.text, marginBottom: 10 },
  descText: { fontSize: 14, color: Colors.dark.textSecondary, lineHeight: 22 },
  readMore: { fontSize: 13, color: Colors.dark.primaryLight, fontWeight: '600', marginTop: 6 },

  chaptersSection: { marginTop: 28, paddingHorizontal: 20 },
  chapterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sortBtn: { backgroundColor: Colors.dark.surfaceLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: Colors.dark.border },
  sortBtnText: { fontSize: 11, fontWeight: '700', color: Colors.dark.primaryLight },
  chapterCount: { fontSize: 13, color: Colors.dark.textMuted },
  chapterItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: Colors.dark.border },
  chapterItemDisabled: { opacity: 0.4 },
  chapterItemRead: { opacity: 0.45 },
  chapterTextRead: { color: Colors.dark.textMuted },
  chapterPageProgress: { fontSize: 11, color: Colors.dark.primaryLight, fontWeight: '600', marginTop: 2 },
  currentDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.dark.primary },
  chapterInfo: { flex: 1 },
  chapterNumber: { fontSize: 14, fontWeight: '600', color: Colors.dark.text },
  chapterTitle: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 2 },
  chapterMeta: { alignItems: 'flex-end' },
  chapterDate: { fontSize: 11, color: Colors.dark.textMuted },
  chapterViews: { fontSize: 10, color: Colors.dark.textMuted, marginTop: 2 },
  chapterItemSelected: { backgroundColor: Colors.dark.primary + '15', borderRadius: 10, marginHorizontal: -8, paddingHorizontal: 8 },

  selectionCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.dark.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  selectAllText: { fontSize: 13, fontWeight: '600', color: Colors.dark.primaryLight },

  floatingBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 16, paddingTop: 12, backgroundColor: Colors.dark.surface, borderTopWidth: 1, borderTopColor: Colors.dark.border },
  fabBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16 },
});
