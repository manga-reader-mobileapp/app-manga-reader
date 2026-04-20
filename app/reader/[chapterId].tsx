import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getChapterPages } from '@/services/nexus/api';
import type { NexusChapterRead, NexusReaderPage } from '@/services/nexus/types';
import * as MangaLivreApi from '@/services/mangalivre/api';
import { updateReadProgress, markChapterRead } from '@/services/library';
import { addToHistory } from '@/services/history';
import { getLocalPages } from '@/services/downloads';
import * as FileSystem from 'expo-file-system/legacy';

const SCREEN = Dimensions.get('window');
const W = SCREEN.width;
const H = SCREEN.height;

type ReadingMode = 'scroll' | 'page';
type PageFit = 'width' | 'height';

// ─── Flat list item types ─────────────────────────────────────────────────────

interface PageItem {
  type: 'page';
  key: string;
  chapterId: number;
  chapterNumber: string;
  pageNumber: number;
  totalPages: number;
  imageUrl: string;
  onlineUrl?: string; // original URL for re-download in offline mode
  localPath?: string; // local file path in offline mode
}

interface SeparatorItem {
  type: 'separator';
  key: string;
  chapterNumber: string;
  nextChapterNumber: string | null;
  nextChapterId: number | null;
}

interface EndItem {
  type: 'end';
  key: string;
}

interface LoadingItem {
  type: 'loading';
  key: string;
}

type FlatItem = PageItem | SeparatorItem | EndItem | LoadingItem;

// ─── Global image dimension cache ─────────────────────────────────────────────
// Survives re-renders, recycling, and chapter changes.
// Once an image's dimensions are known, they NEVER change.
const _imageSizeCache: Record<string, number> = {}; // uri → height for given width

// ─── AutoImage with error handling ────────────────────────────────────────────

interface AutoImageProps {
  uri: string;
  fitWidth: number;
  pageNumber?: number;
  onRedownload?: () => Promise<string | null>;
}

function AutoImage({ uri, fitWidth, pageNumber, onRedownload }: AutoImageProps) {
  // Use cached height if available, otherwise use a tall default
  const cachedHeight = _imageSizeCache[uri];
  const [height, setHeight] = useState(cachedHeight || fitWidth * 1.5);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [currentUri, setCurrentUri] = useState(uri);
  const heightLocked = useRef(!!cachedHeight);

  // Check if local file exists on mount (offline mode)
  useEffect(() => {
    if (onRedownload && uri && !uri.startsWith('http')) {
      FileSystem.getInfoAsync(uri).then((info) => {
        if (!info.exists) setFailed(true);
      });
    }
  }, [uri, onRedownload]);

  async function handleRedownload() {
    if (!onRedownload) return;
    setDownloading(true);
    try {
      const newUri = await onRedownload();
      if (newUri) {
        setCurrentUri(newUri + '?t=' + Date.now());
        setFailed(false);
        setRetryKey((k) => k + 1);
      }
    } catch (err) {
      console.warn('[READER] Re-download failed:', err);
    } finally {
      setDownloading(false);
    }
  }

  if (failed) {
    return (
      <View style={{ width: fitWidth, height: fitWidth * 0.5, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' }}>
        <IconSymbol name="xmark" size={28} color={Colors.dark.textMuted} />
        <ThemedText style={{ fontSize: 13, color: Colors.dark.textMuted, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 }}>
          {pageNumber ? `Página ${pageNumber} não carregou` : 'Página não carregou'}
        </ThemedText>

        {onRedownload ? (
          <Pressable
            onPress={handleRedownload}
            disabled={downloading}
            style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.dark.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}
          >
            {downloading ? (
              <ActivityIndicator size={14} color="#fff" />
            ) : (
              <IconSymbol name="arrow.down.circle.fill" size={16} color="#fff" />
            )}
            <ThemedText style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>
              {downloading ? 'Baixando...' : 'Baixar agora'}
            </ThemedText>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => { setFailed(false); setRetryKey((k) => k + 1); }}
            style={{ marginTop: 12, backgroundColor: Colors.dark.surface, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.dark.border }}
          >
            <ThemedText style={{ fontSize: 12, fontWeight: '600', color: Colors.dark.primaryLight }}>Tentar novamente</ThemedText>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <Image
      key={retryKey}
      source={{ uri: currentUri }}
      style={{ width: fitWidth, height }}
      contentFit="contain"
     
      onLoad={(e) => {
        const { width: w, height: h } = e.source;
        if (w && h && !heightLocked.current) {
          const newHeight = fitWidth * (h / w);
          _imageSizeCache[uri] = newHeight;
          heightLocked.current = true;
          setHeight(newHeight);
        }
      }}
      onError={() => setFailed(true)}
    />
  );
}

// ─── Main Reader ──────────────────────────────────────────────────────────────

export default function ReaderScreen() {
  const { chapterId, mangaTitle, mangaSlug, mangaCover, chapterNumber, chapterList, offline, offlineSource, offlineSourceId, resumePage, sourceMangaId, sourceType, chapterSlugs } =
    useLocalSearchParams<{
      chapterId: string;
      mangaTitle?: string;
      mangaSlug?: string;
      mangaCover?: string;
      chapterNumber?: string;
      chapterList?: string;
      offline?: string;
      offlineSource?: string;
      offlineSourceId?: string;
      resumePage?: string;
      sourceMangaId?: string;
      sourceType?: string;
      chapterSlugs?: string;
    }>();

  const isOffline = offline === 'true';
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // All chapters ascending
  const chapters: { id: number; number: string }[] = chapterList ? JSON.parse(chapterList) : [];

  // TODO: implement resume scroll position (saved in memory for future)

  // ── State (only for UI rendering) ──
  const [flatData, setFlatData] = useState<FlatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [readingMode, setReadingMode] = useState<ReadingMode>('scroll');
  const [pageFit, setPageFit] = useState<PageFit>('width');
  const [infiniteScroll, setInfiniteScroll] = useState(true);

  // Display state (updated via throttled timer, not on every scroll)
  const [displayPage, setDisplayPage] = useState(1);
  const [displayTotalPages, setDisplayTotalPages] = useState(0);
  const [displayChapterNumber, setDisplayChapterNumber] = useState(chapterNumber || '');
  const [displayChapterId, setDisplayChapterId] = useState(Number(chapterId));

  // ── Refs for internal tracking (no re-renders) ──
  const activeChapterIdRef = useRef(Number(chapterId));
  const activeChapterNumberRef = useRef(chapterNumber || '');
  const currentPageRef = useRef(1);
  const currentTotalPagesRef = useRef(0);
  const loadedChaptersRef = useRef<Set<number>>(new Set());
  const loadingChaptersRef = useRef<Set<number>>(new Set());
  const mangaIdRef = useRef<number | null>(sourceMangaId ? Number(sourceMangaId) : null);
  const onlineUrlsCache = useRef<Record<number, string[]>>({});
  // Map chapter id → slug (for MangaLivre)
  const chapterSlugsRef = useRef<Record<number, string>>(
    chapterSlugs ? JSON.parse(chapterSlugs) : {},
  );
  // Scroll offset tracking (for saving position + slider)
  const scrollOffsetRef = useRef(0);
  const contentHeightRef = useRef(0);
  const chaptersRef = useRef(chapters);
  chaptersRef.current = chapters;
  const infiniteScrollRef = useRef(infiniteScroll);
  infiniteScrollRef.current = infiniteScroll;
  const flatDataRef = useRef(flatData);
  flatDataRef.current = flatData;

  // Throttled UI update — sync refs → state at most every 300ms
  const uiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleUIUpdate() {
    if (uiTimerRef.current) return;
    uiTimerRef.current = setTimeout(() => {
      uiTimerRef.current = null;
      setDisplayPage(currentPageRef.current);
      setDisplayTotalPages(currentTotalPagesRef.current);
      setDisplayChapterNumber(activeChapterNumberRef.current);
      setDisplayChapterId(activeChapterIdRef.current);
    }, 300);
  }

  const controlsOpacity = useSharedValue(1);

  // Pinch zoom + pan for scroll mode
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      focalX.value = e.focalX;
      focalY.value = e.focalY;
    })
    .onUpdate((e) => {
      const newScale = Math.max(1, Math.min(savedScale.value * e.scale, 4));
      scale.value = newScale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        // Reset pan when zoomed out
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .minPointers(2)
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const zoomGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));
  const settingsTranslate = useSharedValue(W);
  const scrollListRef = useRef<FlatList>(null);
  const pageListRef = useRef<FlatList>(null);
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);

  const idx = chapters.findIndex((c) => c.id === displayChapterId);
  const prevChapter = idx > 0 ? chapters[idx - 1] : null;
  const nextChapter = idx < chapters.length - 1 ? chapters[idx + 1] : null;

  // ── Animations ──
  useEffect(() => {
    controlsOpacity.value = withTiming(showControls ? 1 : 0, { duration: 200 });
  }, [showControls]);

  useEffect(() => {
    settingsTranslate.value = withTiming(showSettings ? 0 : W, { duration: 250 });
  }, [showSettings]);

  const controlsStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    pointerEvents: controlsOpacity.value < 0.5 ? 'none' : 'auto',
  }));

  const settingsStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: settingsTranslate.value }],
  }));

  // ── Load initial chapter ──
  useEffect(() => {
    loadInitialChapter();
  }, []);

  async function loadInitialChapter() {
    setLoading(true);
    const pages = await fetchChapterPages(Number(chapterId));
    if (!pages) {
      setLoading(false);
      return;
    }

    const startIdx = chapters.findIndex((c) => c.id === Number(chapterId));
    const nextCh = startIdx < chapters.length - 1 ? chapters[startIdx + 1] : null;

    const items: FlatItem[] = buildChapterItems(Number(chapterId), chapterNumber || '', pages, nextCh, infiniteScroll);
    setFlatData(items);
    currentTotalPagesRef.current = pages.length;
    setDisplayTotalPages(pages.length);
    setLoading(false);

    // Save initial position
    if (mangaIdRef.current) {
      updateReadProgress(sourceType || 'nexus', mangaIdRef.current, chapterNumber || '', Number(chapterId), 1).catch(() => {});
    }

    // resumeOffsetY will be applied via contentOffset prop on FlatList
  }

  // ── Fetch pages (online or offline) ──
  async function fetchChapterPages(id: number): Promise<NexusReaderPage[] | null> {
    if (loadedChaptersRef.current.has(id) || loadingChaptersRef.current.has(id)) return null;
    loadingChaptersRef.current.add(id);

    try {
      if (isOffline && offlineSource && offlineSourceId) {
        const localPages = await getLocalPages(offlineSource, Number(offlineSourceId), id);
        if (localPages && localPages.length > 0) {
          const p: NexusReaderPage[] = localPages.map((path, i) => ({
            pageNumber: i + 1,
            imageUrl: path,
          }));
          loadedChaptersRef.current.add(id);
          return p;
        }
        return null;
      } else if (sourceType === 'mangalivre') {
        // MangaLivre: find the chapter slug from chapterSlugsRef
        const chSlug = chapterSlugsRef.current[id];
        if (!chSlug) {
          console.error('[READER] No slug found for chapter id:', id);
          return null;
        }
        const pages = await MangaLivreApi.getChapterPages(chSlug);
        loadedChaptersRef.current.add(id);
        return pages;
      } else {
        const { pages: p, chapter: ch } = await getChapterPages(id);
        loadedChaptersRef.current.add(id);
        if (ch?.mangaId && !mangaIdRef.current) {
          mangaIdRef.current = ch.mangaId;
        }
        return p;
      }
    } catch (err) {
      console.error('[READER] Failed to load chapter', id, err);
      return null;
    } finally {
      loadingChaptersRef.current.delete(id);
    }
  }

  // ── Build flat items for a chapter ──
  function buildChapterItems(
    chId: number,
    chNum: string,
    pages: NexusReaderPage[],
    nextCh: { id: number; number: string } | null,
    infinite: boolean = true,
  ): FlatItem[] {
    const items: FlatItem[] = pages.map((p) => ({
      type: 'page' as const,
      key: `p-${chId}-${p.pageNumber}`,
      chapterId: chId,
      chapterNumber: chNum,
      pageNumber: p.pageNumber,
      totalPages: pages.length,
      imageUrl: p.imageUrl,
    }));

    if (infinite && nextCh) {
      // Infinite mode: separator, then next chapter will be appended
      items.push({
        type: 'separator' as const,
        key: `sep-${chId}`,
        chapterNumber: chNum,
        nextChapterNumber: nextCh.number,
        nextChapterId: nextCh.id,
      });
    } else {
      // Non-infinite or last chapter: show end card
      items.push({
        type: 'end' as const,
        key: `end-${chId}`,
      });
    }

    return items;
  }

  // ── Append next chapter to the flat list (infinite mode) ──
  async function appendNextChapter(nextChId: number) {
    if (!infiniteScroll) return; // Don't append if infinite is off
    if (loadedChaptersRef.current.has(nextChId) || loadingChaptersRef.current.has(nextChId)) return;

    const chIdx = chapters.findIndex((c) => c.id === nextChId);
    if (chIdx === -1) return;
    const ch = chapters[chIdx];
    const nextAfter = chIdx < chapters.length - 1 ? chapters[chIdx + 1] : null;

    const pages = await fetchChapterPages(nextChId);
    if (!pages || pages.length === 0) return;

    const newItems = buildChapterItems(nextChId, ch.number, pages, nextAfter, true);

    setFlatData((prev) => {
      const filtered = prev.filter((item) => item.key !== `loading-${nextChId}`);
      return [...filtered, ...newItems];
    });
  }

  // ── Jump to a chapter manually (resets everything) ──
  async function jumpToChapter(ch: { id: number; number: string }) {
    // Mark the chapter we're leaving as completed
    completeChapter(activeChapterIdRef.current, activeChapterNumberRef.current);

    setLoading(true);

    // Reset loaded tracking
    loadedChaptersRef.current.clear();
    loadingChaptersRef.current.clear();

    const pages = await fetchChapterPages(ch.id);
    if (!pages) {
      setLoading(false);
      return;
    }

    const chIdx = chapters.findIndex((c) => c.id === ch.id);
    const nextCh = chIdx < chapters.length - 1 ? chapters[chIdx + 1] : null;

    const items = buildChapterItems(ch.id, ch.number, pages, nextCh, infiniteScroll);
    setFlatData(items);
    activeChapterIdRef.current = ch.id;
    activeChapterNumberRef.current = ch.number;
    currentPageRef.current = 1;
    currentTotalPagesRef.current = pages.length;
    setDisplayChapterId(ch.id);
    setDisplayChapterNumber(ch.number);
    setDisplayPage(1);
    setDisplayTotalPages(pages.length);
    setLoading(false);

    // Save position for jumped chapter
    if (mangaIdRef.current) {
      updateReadProgress(sourceType || 'nexus', mangaIdRef.current, ch.number, ch.id, 1).catch(() => {});
    }

    // Scroll to top
    setTimeout(() => {
      scrollListRef.current?.scrollToOffset({ offset: 0, animated: false });
      pageListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, 50);
  }

  // ── Save reading position (throttled — saves scroll offset as "page") ──
  const lastPositionSaveRef = useRef(0);
  function savePosition(chId: number, chNum: string) {
    const now = Date.now();
    if (now - lastPositionSaveRef.current < 3000) return;
    lastPositionSaveRef.current = now;
    if (mangaIdRef.current) {
      updateReadProgress(sourceType || 'nexus', mangaIdRef.current, chNum, chId, currentPageRef.current).catch(() => {});
      // Update history
      addToHistory({
        mangaId: mangaIdRef.current,
        source: sourceType || 'nexus',
        slug: mangaSlug || '',
        title: mangaTitle || '',
        coverUrl: mangaCover || null,
        chapterNumber: chNum,
        chapterId: chId,
      }).catch(() => {});
    }
  }

  // ── Mark chapter as completed (user reached separator/end) ──
  const completedRef = useRef<Set<number>>(new Set());
  function completeChapter(chId: number, chNum: string) {
    if (completedRef.current.has(chId)) return;
    completedRef.current.add(chId);
    if (mangaIdRef.current) {
      markChapterRead(sourceType || 'nexus', mangaIdRef.current, chId).catch(() => {});
      updateReadProgress(sourceType || 'nexus', mangaIdRef.current, chNum, chId).catch(() => {});
    }
  }

  // ── Viewability callbacks (STABLE — read from refs only) ──
  const onViewableScroll = useRef(({ viewableItems }: { viewableItems: Array<{ item: FlatItem; index: number | null }> }) => {
    if (viewableItems.length === 0) return;

    const firstPage = viewableItems.find((v) => v.item.type === 'page') as { item: PageItem } | undefined;
    if (firstPage) {
      const item = firstPage.item;
      currentPageRef.current = item.pageNumber;
      currentTotalPagesRef.current = item.totalPages;

      // Update which chapter is active (for UI display only)
      if (item.chapterId !== activeChapterIdRef.current) {
        activeChapterIdRef.current = item.chapterId;
        activeChapterNumberRef.current = item.chapterNumber;
      }

      // Save position periodically
      savePosition(item.chapterId, item.chapterNumber);
      scheduleUIUpdate();

      // Preload next chapter when past 70%
      if (item.pageNumber >= item.totalPages * 0.7) {
        const chs = chaptersRef.current;
        const chIdx = chs.findIndex((c) => c.id === item.chapterId);
        const nextCh = chIdx < chs.length - 1 ? chs[chIdx + 1] : null;
        if (nextCh) appendNextChapter(nextCh.id);
      }
    }

    // If separator is visible → mark previous chapter as COMPLETED
    const sep = viewableItems.find((v) => v.item.type === 'separator') as { item: SeparatorItem } | undefined;
    if (sep) {
      completeChapter(
        activeChapterIdRef.current,
        sep.item.chapterNumber, // the chapter that just ended
      );
      if (sep.item.nextChapterId) appendNextChapter(sep.item.nextChapterId);
    }

    // If end item is visible → mark last chapter as completed
    const end = viewableItems.find((v) => v.item.type === 'end');
    if (end) {
      completeChapter(activeChapterIdRef.current, activeChapterNumberRef.current);
    }
  }).current;

  const onViewablePage = useRef(({ viewableItems }: { viewableItems: Array<{ item: FlatItem; index: number | null }> }) => {
    if (viewableItems.length === 0) return;
    const visible = viewableItems[0];
    if (!visible) return;

    if (visible.item.type === 'page') {
      const item = visible.item as PageItem;
      currentPageRef.current = item.pageNumber;
      currentTotalPagesRef.current = item.totalPages;

      if (item.chapterId !== activeChapterIdRef.current) {
        activeChapterIdRef.current = item.chapterId;
        activeChapterNumberRef.current = item.chapterNumber;
      }

      savePosition(item.chapterId, item.chapterNumber);
      scheduleUIUpdate();

      // Preload when near end
      if (item.pageNumber >= item.totalPages - 1) {
        const chs = chaptersRef.current;
        const chIdx = chs.findIndex((c) => c.id === item.chapterId);
        const nextCh = chIdx < chs.length - 1 ? chs[chIdx + 1] : null;
        if (nextCh) appendNextChapter(nextCh.id);
      }
    }

    // End item visible in page mode → mark complete
    if (visible.item.type === 'end') {
      completeChapter(activeChapterIdRef.current, activeChapterNumberRef.current);
    }
  }).current;

  const viewConfigScroll = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const viewConfigPage = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  // ── Tap handling ──
  function onTouchStart(x: number, y: number) {
    touchStart.current = { x, y, time: Date.now() };
  }

  function onTouchEnd(x: number, y: number) {
    if (!touchStart.current) return;
    const dx = Math.abs(x - touchStart.current.x);
    const dy = Math.abs(y - touchStart.current.y);
    const dt = Date.now() - touchStart.current.time;
    touchStart.current = null;

    if (dx > 15 || dy > 15 || dt > 300) return;

    if (showSettings) {
      setShowSettings(false);
      return;
    }

    const xRatio = x / W;

    if (readingMode === 'page') {
      // Page mode: tap left/right to navigate, center to toggle controls
      if (xRatio < 0.25 || xRatio > 0.75) {
        // Let FlatList paging handle navigation
        // Just toggle controls off if they're on
      } else {
        setShowControls((v) => !v);
      }
    } else {
      setShowControls((v) => !v);
    }
  }

  function goBackToManga() {
    router.back();
  }

  // ── Slider interaction ──
  const sliderWidthRef = useRef(0);
  const sliderThrottleRef = useRef(0);
  function handleSliderTouch(locationX: number) {
    // Throttle to avoid too many scroll commands
    const now = Date.now();
    if (now - sliderThrottleRef.current < 100) return;
    sliderThrottleRef.current = now;

    const total = currentTotalPagesRef.current;
    if (total <= 0 || sliderWidthRef.current <= 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / sliderWidthRef.current));
    const targetPage = Math.max(1, Math.round(ratio * total));

    currentPageRef.current = targetPage;
    setDisplayPage(targetPage);

    if (readingMode === 'page') {
      try { pageListRef.current?.scrollToIndex({ index: targetPage - 1, animated: false }); } catch {}
    } else {
      // Scroll mode: use ratio of total content height
      if (contentHeightRef.current > 0) {
        const offset = ratio * contentHeightRef.current;
        scrollListRef.current?.scrollToOffset({ offset, animated: false });
      }
    }
  }

  // ── Re-download a single page (offline mode) ──
  async function redownloadSinglePage(chId: number, pageIndex: number, localFilePath: string): Promise<string | null> {
    try {
      // Get online URLs (cached per chapter)
      if (!onlineUrlsCache.current[chId]) {
        const { pages } = await getChapterPages(chId);
        onlineUrlsCache.current[chId] = pages.map((p) => p.imageUrl);
      }

      const onlineUrl = onlineUrlsCache.current[chId]?.[pageIndex];
      if (!onlineUrl) return null;

      // Resolve 302 redirect
      const res = await fetch(onlineUrl, {
        method: 'HEAD',
        headers: { Referer: 'https://nx-toons.xyz/' },
        redirect: 'follow',
      });
      const realUrl = res.url || onlineUrl;

      // Download to local path
      const result = await FileSystem.downloadAsync(realUrl, localFilePath);
      if (result.status === 200) {
        return localFilePath;
      }
      return null;
    } catch (err) {
      console.warn('[READER] Re-download page failed:', err);
      return null;
    }
  }

  // ── Render items ──

  function renderScrollItem({ item }: { item: FlatItem }) {
    if (item.type === 'page') {
      const redownload = isOffline
        ? () => redownloadSinglePage(item.chapterId, item.pageNumber - 1, item.imageUrl)
        : undefined;
      return <AutoImage uri={item.imageUrl} fitWidth={pageFit === 'width' ? W : W * 0.65} pageNumber={item.pageNumber} onRedownload={redownload} />;
    }
    if (item.type === 'separator') {
      return (
        <View style={sepStyles.container}>
          <View style={sepStyles.line} />
          <ThemedText style={sepStyles.prevText}>Fim — Capítulo {item.chapterNumber}</ThemedText>
          <View style={sepStyles.nextBox}>
            <ThemedText style={sepStyles.nextLabel}>Próximo</ThemedText>
            <ThemedText style={sepStyles.nextNumber}>Capítulo {item.nextChapterNumber}</ThemedText>
          </View>
          <View style={sepStyles.line} />
        </View>
      );
    }
    if (item.type === 'end') {
      return (
        <View style={[eStyles.box, { paddingBottom: insets.bottom + 40 }]}>
          <View style={eStyles.line} />
          <ThemedText style={eStyles.title}>Fim do capítulo</ThemedText>
          {nextChapter ? (
            <>
              <ThemedText style={eStyles.sub}>Próximo: Capítulo {nextChapter.number}</ThemedText>
              <Pressable style={eStyles.nextBtn} onPress={() => jumpToChapter(nextChapter)}>
                <ThemedText style={eStyles.nextTxt}>Ir para o Capítulo {nextChapter.number}</ThemedText>
                <ThemedText style={eStyles.nextArr}>{'›'}</ThemedText>
              </Pressable>
            </>
          ) : (
            <>
              <ThemedText style={eStyles.sub}>Último capítulo disponível</ThemedText>
              <Pressable
                style={eStyles.readAllBtn}
                onPress={() => {
                  if (mangaIdRef.current) {
                    updateReadProgress(sourceType || 'nexus', mangaIdRef.current, activeChapterNumberRef.current, activeChapterIdRef.current);
                  }
                  goBackToManga();
                }}
              >
                <IconSymbol name="checkmark.circle.fill" size={18} color="#10B981" />
                <ThemedText style={eStyles.readAllTxt}>Marcar tudo como lido</ThemedText>
              </Pressable>
            </>
          )}
          <Pressable style={eStyles.backBtn} onPress={goBackToManga}>
            <ThemedText style={eStyles.backTxt}>Voltar para detalhes</ThemedText>
          </Pressable>
        </View>
      );
    }
    if (item.type === 'loading') {
      return (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
          <ThemedText style={{ fontSize: 13, color: Colors.dark.textSecondary, marginTop: 8 }}>Carregando próximo capítulo...</ThemedText>
        </View>
      );
    }
    return null;
  }

  function renderPageItem({ item }: { item: FlatItem }) {
    if (item.type === 'page') {
      return (
        <ScrollView
          style={{ width: W }}
          contentContainerStyle={{ alignItems: 'center', minHeight: H }}
          showsVerticalScrollIndicator={false}
          maximumZoomScale={3}
          minimumZoomScale={1}
        >
          <AutoImage
            uri={item.imageUrl}
            fitWidth={W}
            pageNumber={item.pageNumber}
            onRedownload={isOffline ? () => redownloadSinglePage(item.chapterId, item.pageNumber - 1, item.imageUrl) : undefined}
          />
        </ScrollView>
      );
    }
    if (item.type === 'end') {
      return (
        <View style={{ width: W, justifyContent: 'center' }}>
          <View style={[eStyles.box, { paddingBottom: insets.bottom + 40 }]}>
            <View style={eStyles.line} />
            <ThemedText style={eStyles.title}>Fim</ThemedText>
            {nextChapter ? (
              <>
                <ThemedText style={eStyles.sub}>Próximo: Capítulo {nextChapter.number}</ThemedText>
                <Pressable style={eStyles.nextBtn} onPress={() => jumpToChapter(nextChapter)}>
                  <ThemedText style={eStyles.nextTxt}>Capítulo {nextChapter.number}</ThemedText>
                  <ThemedText style={eStyles.nextArr}>{'›'}</ThemedText>
                </Pressable>
              </>
            ) : (
              <>
                <ThemedText style={eStyles.sub}>Último capítulo disponível</ThemedText>
                <Pressable
                  style={eStyles.readAllBtn}
                  onPress={() => {
                    if (mangaIdRef.current) {
                      updateReadProgress(sourceType || 'nexus', mangaIdRef.current, activeChapterNumberRef.current, activeChapterIdRef.current);
                    }
                    goBackToManga();
                  }}
                >
                  <IconSymbol name="checkmark.circle.fill" size={18} color="#10B981" />
                  <ThemedText style={eStyles.readAllTxt}>Marcar tudo como lido</ThemedText>
                </Pressable>
              </>
            )}
            <Pressable style={eStyles.backBtn} onPress={goBackToManga}>
              <ThemedText style={eStyles.backTxt}>Voltar para detalhes</ThemedText>
            </Pressable>
          </View>
        </View>
      );
    }
    // Separators and loading items are skipped in page mode
    return null;
  }

  // For page mode: filter out separators (seamless)
  const pageData: FlatItem[] = flatData.filter((item) => item.type !== 'separator' && item.type !== 'loading');

  // ── Loading screen ──
  if (loading) {
    return (
      <View style={[styles.container, styles.centerBox]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <ThemedText style={styles.loadingText}>Carregando capítulo...</ThemedText>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onTouchStart={(e) => onTouchStart(e.nativeEvent.pageX, e.nativeEvent.pageY)}
      onTouchEnd={(e) => onTouchEnd(e.nativeEvent.pageX, e.nativeEvent.pageY)}
    >
      {/* ========== SCROLL MODE ========== */}
      {readingMode === 'scroll' && (
        <GestureDetector gesture={zoomGesture}>
          <Animated.View style={[{ flex: 1 }, zoomStyle]}>
            <FlatList
              ref={scrollListRef}
              data={flatData}
              keyExtractor={(item) => item.key}
              renderItem={renderScrollItem}
              showsVerticalScrollIndicator={false}
              onViewableItemsChanged={onViewableScroll}
              viewabilityConfig={viewConfigScroll}
              onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
              scrollEventThrottle={200}
              onContentSizeChange={(_, h) => { contentHeightRef.current = h; }}
              initialNumToRender={8}
              maxToRenderPerBatch={6}
              windowSize={15}
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            />
          </Animated.View>
        </GestureDetector>
      )}

      {/* ========== PAGE MODE ========== */}
      {readingMode === 'page' && (
        <FlatList
          ref={pageListRef}
          data={pageData}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewablePage}
          viewabilityConfig={viewConfigPage}
          renderItem={renderPageItem}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          getItemLayout={(_, index) => ({ length: W, offset: W * index, index })}
        />
      )}

      {/* ========== TOP BAR ========== */}
      <Animated.View style={[styles.topBar, { paddingTop: insets.top + 8 }, controlsStyle]}>
        <Pressable style={styles.ctrlBtn} onPress={goBackToManga}>
          <ThemedText style={styles.backIcon}>{'‹'}</ThemedText>
        </Pressable>
        <View style={styles.topInfo}>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {mangaTitle || ''}
          </ThemedText>
          <ThemedText style={styles.topSub}>Capítulo {displayChapterNumber}</ThemedText>
        </View>
        <Pressable style={styles.ctrlBtn} onPress={() => { setShowSettings(true); setShowControls(false); }}>
          <IconSymbol name="chevron.right" size={16} color={Colors.dark.text} />
        </Pressable>
      </Animated.View>

      {/* ========== BOTTOM BAR ========== */}
      <Animated.View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }, controlsStyle]}>
        <View style={styles.navCompact}>
          {/* Prev chapter */}
          <Pressable
            style={[styles.navIcon, !prevChapter && styles.navIconOff]}
            onPress={() => {
              if (!prevChapter) return;
              const prevIdx = flatData.findIndex((item) => item.type === 'page' && (item as PageItem).chapterId === prevChapter.id);
              if (prevIdx !== -1) {
                if (readingMode === 'scroll') scrollListRef.current?.scrollToIndex({ index: prevIdx, animated: true });
                else {
                  const pIdx = pageData.findIndex((item) => item.type === 'page' && (item as PageItem).chapterId === prevChapter.id);
                  if (pIdx !== -1) pageListRef.current?.scrollToIndex({ index: pIdx, animated: true });
                }
              } else {
                jumpToChapter(prevChapter);
              }
            }}
            disabled={!prevChapter}
          >
            <ThemedText style={styles.navIconText}>{'◀'}</ThemedText>
          </Pressable>

          {/* Page indicator: number ● slider ● number */}
          <ThemedText style={styles.sliderNum}>{displayPage}</ThemedText>
          <View
            style={styles.sliderTrack}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) => handleSliderTouch(e.nativeEvent.locationX)}
            onResponderMove={(e) => handleSliderTouch(e.nativeEvent.locationX)}
            onLayout={(e) => { sliderWidthRef.current = e.nativeEvent.layout.width; }}
          >
            <View
              style={[
                styles.sliderFill,
                { width: displayTotalPages > 0 ? `${(displayPage / displayTotalPages) * 100}%` : '0%' },
              ]}
            />
            {/* Thumb */}
            <View style={[
              styles.sliderThumb,
              { left: displayTotalPages > 0 ? `${(displayPage / displayTotalPages) * 100}%` : '0%' },
            ]} />
          </View>
          <ThemedText style={styles.sliderNum}>{displayTotalPages}</ThemedText>

          {/* Next chapter */}
          <Pressable
            style={[styles.navIcon, !nextChapter && styles.navIconOff]}
            onPress={() => {
              if (!nextChapter) return;
              // Mark current chapter as completed before moving
              completeChapter(activeChapterIdRef.current, activeChapterNumberRef.current);
              const nextIdx = flatData.findIndex((item) => item.type === 'page' && (item as PageItem).chapterId === nextChapter.id);
              if (nextIdx !== -1) {
                if (readingMode === 'scroll') scrollListRef.current?.scrollToIndex({ index: nextIdx, animated: true });
                else {
                  const pIdx = pageData.findIndex((item) => item.type === 'page' && (item as PageItem).chapterId === nextChapter.id);
                  if (pIdx !== -1) pageListRef.current?.scrollToIndex({ index: pIdx, animated: true });
                }
              } else {
                jumpToChapter(nextChapter);
              }
            }}
            disabled={!nextChapter}
          >
            <ThemedText style={styles.navIconText}>{'▶'}</ThemedText>
          </Pressable>
        </View>
      </Animated.View>

      {/* ========== SETTINGS DRAWER ========== */}
      {showSettings && <Pressable style={styles.overlay} onPress={() => setShowSettings(false)} />}
      <Animated.View style={[styles.drawer, settingsStyle, { paddingTop: insets.top + 16 }]}>
        <View style={styles.drawerHead}>
          <ThemedText style={styles.drawerTitle}>Configurações</ThemedText>
          <Pressable onPress={() => setShowSettings(false)}><ThemedText style={styles.drawerX}>✕</ThemedText></Pressable>
        </View>

        <View style={styles.setSection}>
          <ThemedText style={styles.setLabel}>Modo de Leitura</ThemedText>
          <View style={styles.setRow}>
            {(['scroll', 'page'] as const).map((m) => (
              <Pressable key={m} style={[styles.setBtn, readingMode === m && styles.setBtnOn]} onPress={() => setReadingMode(m)}>
                <ThemedText style={[styles.setTxt, readingMode === m && styles.setTxtOn]}>
                  {m === 'scroll' ? 'Scroll' : 'Página'}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.setSection}>
          <ThemedText style={styles.setLabel}>Ajuste da Imagem</ThemedText>
          <View style={styles.setRow}>
            {(['width', 'height'] as const).map((f) => (
              <Pressable key={f} style={[styles.setBtn, pageFit === f && styles.setBtnOn]} onPress={() => setPageFit(f)}>
                <ThemedText style={[styles.setTxt, pageFit === f && styles.setTxtOn]}>
                  {f === 'width' ? '100% Horizontal' : '100% Vertical'}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.setSection}>
          <ThemedText style={styles.setLabel}>Leitura Infinita</ThemedText>
          <View style={styles.setRow}>
            <Pressable
              style={[styles.setBtn, infiniteScroll && styles.setBtnOn]}
              onPress={() => setInfiniteScroll(true)}
            >
              <ThemedText style={[styles.setTxt, infiniteScroll && styles.setTxtOn]}>Ativado</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.setBtn, !infiniteScroll && styles.setBtnOn]}
              onPress={() => setInfiniteScroll(false)}
            >
              <ThemedText style={[styles.setTxt, !infiniteScroll && styles.setTxtOn]}>Desativado</ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.setSection}>
          <ThemedText style={styles.setLabel}>Info</ThemedText>
          {[
            ['Páginas', String(displayTotalPages)],
            ['Capítulo', displayChapterNumber],
            ['Modo', readingMode === 'scroll' ? 'Scroll' : 'Página'],
          ].map(([l, v]) => (
            <View key={l} style={styles.infoRow}>
              <ThemedText style={styles.infoL}>{l}</ThemedText>
              <ThemedText style={styles.infoV}>{v}</ThemedText>
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Chapter separator styles ─────────────────────────────────────────────────

const sepStyles = StyleSheet.create({
  container: {
    paddingVertical: 40,
    paddingHorizontal: 32,
    alignItems: 'center',
    backgroundColor: Colors.dark.background,
    gap: 12,
  },
  line: {
    width: 60,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.dark.border,
  },
  prevText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  nextBox: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  nextLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  nextNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.dark.text,
  },
});

// ─── End of manga styles ──────────────────────────────────────────────────────

const eStyles = StyleSheet.create({
  box: { paddingVertical: 60, paddingHorizontal: 32, alignItems: 'center', gap: 16, backgroundColor: Colors.dark.background },
  line: { width: 60, height: 3, borderRadius: 2, backgroundColor: Colors.dark.border, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.dark.text },
  sub: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: 'center' },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.dark.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  nextTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
  nextArr: { fontSize: 20, fontWeight: '300', color: '#fff' },
  readAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#10B981' + '20', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 8, borderWidth: 1, borderColor: '#10B981' },
  readAllTxt: { fontSize: 14, fontWeight: '700', color: '#10B981' },
  backBtn: { paddingVertical: 10, paddingHorizontal: 20, marginTop: 4 },
  backTxt: { fontSize: 14, color: Colors.dark.textMuted, textDecorationLine: 'underline' },
});

// ─── Main styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centerBox: { justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: Colors.dark.textSecondary },

  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, backgroundColor: 'rgba(0,0,0,0.9)', gap: 12 },
  ctrlBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.dark.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  backIcon: { fontSize: 28, color: Colors.dark.text, fontWeight: '300', lineHeight: 30 },
  topInfo: { flex: 1, alignItems: 'center' },
  topTitle: { fontSize: 15, fontWeight: '700', color: Colors.dark.text },
  topSub: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 1 },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 12, paddingTop: 10, backgroundColor: 'rgba(0,0,0,0.9)' },
  navCompact: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navIcon: { width: 40, height: 40, borderRadius: 8, backgroundColor: Colors.dark.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  navIconOff: { opacity: 0.3 },
  navIconText: { fontSize: 14, color: Colors.dark.text },
  sliderNum: { fontSize: 13, fontWeight: '700', color: Colors.dark.textSecondary, minWidth: 28, textAlign: 'center' },
  sliderTrack: { flex: 1, height: 4, backgroundColor: Colors.dark.surfaceLight, borderRadius: 2, overflow: 'hidden' },
  sliderFill: { height: '100%', backgroundColor: Colors.dark.primary, borderRadius: 2 },
  sliderThumb: { position: 'absolute', top: -6, width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.dark.primary, marginLeft: -8 },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  drawer: { position: 'absolute', top: 0, bottom: 0, right: 0, width: W * 0.75, backgroundColor: Colors.dark.surface, paddingHorizontal: 20, paddingBottom: 40, borderLeftWidth: 1, borderLeftColor: Colors.dark.border },
  drawerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  drawerTitle: { fontSize: 20, fontWeight: '800', color: Colors.dark.text },
  drawerX: { fontSize: 18, color: Colors.dark.textMuted, padding: 4 },

  setSection: { marginBottom: 28 },
  setLabel: { fontSize: 13, fontWeight: '700', color: Colors.dark.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  setRow: { flexDirection: 'row', gap: 8 },
  setBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.dark.surfaceLight, alignItems: 'center', borderWidth: 1, borderColor: Colors.dark.border },
  setBtnOn: { backgroundColor: Colors.dark.primary + '30', borderColor: Colors.dark.primary },
  setTxt: { fontSize: 12, fontWeight: '600', color: Colors.dark.textMuted },
  setTxtOn: { color: Colors.dark.primaryLight },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.dark.border },
  infoL: { fontSize: 13, color: Colors.dark.textMuted },
  infoV: { fontSize: 13, color: Colors.dark.text, fontWeight: '600' },
});
