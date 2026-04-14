import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SearchBar } from '@/components/search-bar';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getPopularMangas, getRecentMangas, searchMangas } from '@/services/nexus/api';
import type { NexusManga } from '@/services/nexus/types';
import * as MangaLivreApi from '@/services/mangalivre/api';
import { getActiveSource } from '@/services/source-context';

type ScanTab = 'recent' | 'popular';

// Generic manga item for display (works with both sources)
interface DisplayManga {
  id: string;
  slug: string;
  title: string;
  coverImage: string | null;
  chapterCount: number;
  views: number;
  lastChapterAt: string;
  source: string;
}

function nexusToDisplay(m: NexusManga): DisplayManga {
  return {
    id: String(m.id),
    slug: m.slug,
    title: m.title,
    coverImage: m.coverImage,
    chapterCount: m.chapterCount,
    views: m.views,
    lastChapterAt: m.lastChapterAt || m.updatedAt,
    source: 'nexus',
  };
}

function mlToDisplay(m: { slug: string; title: string; coverUrl: string | null }): DisplayManga {
  return {
    id: m.slug,
    slug: m.slug,
    title: m.title,
    coverImage: m.coverUrl,
    chapterCount: 0,
    views: 0,
    lastChapterAt: '',
    source: 'mangalivre',
  };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [popular, setPopular] = useState<DisplayManga[]>([]);
  const [recent, setRecent] = useState<DisplayManga[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanTab, setScanTab] = useState<ScanTab>('recent');
  const [source, setSource] = useState(getActiveSource());

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DisplayManga[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSearchActive = searchQuery.length > 0;

  const lastSourceRef = useRef(getActiveSource());

  useFocusEffect(
    useCallback(() => {
      const s = getActiveSource();
      if (s !== lastSourceRef.current || popular.length === 0) {
        lastSourceRef.current = s;
        setSource(s);
        setPopular([]);
        setRecent([]);
        loadData(s);
      }
    }, []),
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchTotal(0);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        if (source === 'mangalivre') {
          const results = await MangaLivreApi.searchMangas(searchQuery);
          setSearchResults(results.map(mlToDisplay));
          setSearchTotal(results.length);
        } else {
          const res = await searchMangas(searchQuery, 20);
          setSearchResults(res.data.map(nexusToDisplay));
          setSearchTotal(res.total);
        }
      } catch (err) {
        console.error('[SEARCH] ERROR:', err);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  async function loadData(src?: string) {
    const activeSource = src || source;
    try {
      setLoading(true);
      if (activeSource === 'mangalivre') {
        const [popRes, recRes] = await Promise.all([
          MangaLivreApi.getPopularMangas(),
          MangaLivreApi.getRecentMangas(),
        ]);
        setPopular(popRes.map(mlToDisplay));
        setRecent(recRes.map(mlToDisplay));
      } else {
        const [popRes, recRes] = await Promise.all([
          getPopularMangas(10),
          getRecentMangas(20),
        ]);
        setPopular(popRes.data.map(nexusToDisplay));
        setRecent(recRes.data.map(nexusToDisplay));
      }
    } catch (err) {
      console.error('[HOME] ERROR:', err);
    } finally {
      setLoading(false);
    }
  }

  function formatViews(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
    return String(v);
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} min atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    const days = Math.floor(hours / 24);
    return `${days}d atrás`;
  }

  function openManga(slug: string) {
    router.push(`/manga/${slug}`);
  }

  const listData = scanTab === 'recent' ? recent : popular;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.appName}>MangaVerse</ThemedText>
          <ThemedText style={styles.subtitle}>Leia seus mangás favoritos</ThemedText>
        </View>
        <Pressable style={styles.sourceButton} onPress={() => router.push('/')}>
          <IconSymbol name="server.rack" size={20} color={Colors.dark.primaryLight} />
        </Pressable>
      </View>

      {/* Search */}
      <SearchBar value={searchQuery} onChangeText={setSearchQuery} />

      {isSearchActive ? (
        <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Resultados</ThemedText>
              {!searching && <ThemedText style={styles.seeMore}>{searchTotal} encontrados</ThemedText>}
            </View>
            {searching ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="small" color={Colors.dark.primary} />
                <ThemedText style={styles.loadingText}>Buscando...</ThemedText>
              </View>
            ) : searchResults.length === 0 ? (
              <View style={styles.centerBox}>
                <ThemedText style={styles.emptyText}>Nenhum mangá encontrado</ThemedText>
              </View>
            ) : (
              searchResults.map((manga) => (
                <Pressable key={manga.id} style={styles.listItem} onPress={() => openManga(manga.slug)}>
                  {manga.coverImage ? (
                    <Image source={{ uri: manga.coverImage }} style={styles.listCover} contentFit="cover" />
                  ) : (
                    <View style={[styles.listCover, styles.coverPlaceholder]}>
                      <IconSymbol name="book.fill" size={20} color={Colors.dark.textMuted} />
                    </View>
                  )}
                  <View style={styles.listInfo}>
                    <ThemedText style={styles.listTitle} numberOfLines={1}>{manga.title}</ThemedText>
                    {manga.chapterCount > 0 && (
                      <ThemedText style={styles.listSub}>Cap. {manga.chapterCount}</ThemedText>
                    )}
                  </View>
                </Pressable>
              ))
            )}
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      ) : loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
          <ThemedText style={styles.loadingText}>Carregando mangás...</ThemedText>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
          {/* Trending */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitleItalic}>Trending Today</ThemedText>
              <Pressable><ThemedText style={styles.seeMore}>Ver mais</ThemedText></Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingRow}>
              {popular.map((manga) => (
                <Pressable key={manga.id} style={styles.trendingCard} onPress={() => openManga(manga.slug)}>
                  {manga.coverImage ? (
                    <Image source={{ uri: manga.coverImage }} style={styles.trendingCover} contentFit="cover" />
                  ) : (
                    <View style={[styles.trendingCover, styles.coverPlaceholder]}>
                      <IconSymbol name="book.fill" size={28} color={Colors.dark.textMuted} />
                    </View>
                  )}
                  <ThemedText style={styles.trendingTitle} numberOfLines={1}>{manga.title}</ThemedText>
                  <ThemedText style={styles.trendingAuthor} numberOfLines={1}>
                    {manga.source === 'mangalivre' ? 'MangaLivre' : 'NEXUS'}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Tabs */}
          <View style={styles.section}>
            <View style={styles.tabRow}>
              <Pressable onPress={() => setScanTab('recent')}>
                <ThemedText style={[styles.tabText, scanTab === 'recent' && styles.tabTextActive]}>
                  Últimas Atualizações
                </ThemedText>
                {scanTab === 'recent' && <View style={styles.tabIndicator} />}
              </Pressable>
              <Pressable onPress={() => setScanTab('popular')}>
                <ThemedText style={[styles.tabText, scanTab === 'popular' && styles.tabTextActive]}>
                  Mais Populares
                </ThemedText>
                {scanTab === 'popular' && <View style={styles.tabIndicator} />}
              </Pressable>
            </View>

            {listData.map((manga) => (
              <Pressable key={manga.id} style={styles.listItem} onPress={() => openManga(manga.slug)}>
                {manga.coverImage ? (
                  <Image source={{ uri: manga.coverImage }} style={styles.listCover} contentFit="cover" />
                ) : (
                  <View style={[styles.listCover, styles.coverPlaceholder]}>
                    <IconSymbol name="book.fill" size={20} color={Colors.dark.textMuted} />
                  </View>
                )}
                <View style={styles.listInfo}>
                  <ThemedText style={styles.listTitle} numberOfLines={1}>{manga.title}</ThemedText>
                  <ThemedText style={styles.moreChapter}>More Chapter</ThemedText>
                  <ThemedText style={styles.listTime}>
                    {manga.lastChapterAt ? timeAgo(manga.lastChapterAt) : manga.chapterCount > 0 ? `Cap. ${manga.chapterCount}` : ''}
                  </ThemedText>
                </View>
                <IconSymbol name="chevron.right" size={14} color={Colors.dark.textMuted} />
              </Pressable>
            ))}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  appName: { fontSize: 32, fontWeight: '800', color: Colors.dark.text },
  subtitle: { fontSize: 14, color: Colors.dark.textSecondary, marginTop: 2 },
  sourceButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.dark.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.dark.border },
  content: { flex: 1 },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingVertical: 60 },
  loadingText: { fontSize: 14, color: Colors.dark.textSecondary },
  emptyText: { fontSize: 14, color: Colors.dark.textMuted },
  section: { marginTop: 20, paddingHorizontal: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.dark.text },
  sectionTitleItalic: { fontSize: 18, fontWeight: '700', fontStyle: 'italic', color: Colors.dark.text },
  seeMore: { fontSize: 13, color: Colors.dark.primaryLight, fontWeight: '500', textDecorationLine: 'underline' },
  trendingRow: { gap: 14 },
  trendingCard: { width: 130 },
  trendingCover: { width: 130, height: 175, borderRadius: 12, marginBottom: 8 },
  trendingTitle: { fontSize: 13, fontWeight: '700', color: Colors.dark.text },
  trendingAuthor: { fontSize: 11, color: Colors.dark.textSecondary, marginTop: 2 },
  coverPlaceholder: { backgroundColor: Colors.dark.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  tabRow: { flexDirection: 'row', gap: 24, marginBottom: 16 },
  tabText: { fontSize: 15, fontWeight: '600', color: Colors.dark.textMuted, paddingBottom: 6 },
  tabTextActive: { color: Colors.dark.text },
  tabIndicator: { height: 3, borderRadius: 1.5, backgroundColor: Colors.dark.primary },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: Colors.dark.border },
  listCover: { width: 60, height: 80, borderRadius: 8 },
  listInfo: { flex: 1, gap: 2 },
  listTitle: { fontSize: 15, fontWeight: '700', color: Colors.dark.text },
  listSub: { fontSize: 13, color: Colors.dark.textSecondary },
  moreChapter: { fontSize: 12, color: Colors.dark.primaryLight, fontWeight: '600' },
  listTime: { fontSize: 11, color: Colors.dark.textMuted, marginTop: 2 },
  tagRow: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  tag: { backgroundColor: Colors.dark.surfaceLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 10, color: Colors.dark.textSecondary, fontWeight: '600' },
});
