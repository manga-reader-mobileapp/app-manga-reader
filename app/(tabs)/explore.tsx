import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SearchBar } from '@/components/search-bar';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  exploreMangas,
  type ExploreFilters,
  type MangaStatus,
  type MangaType,
  type SortBy,
} from '@/services/nexus/api';
import type { NexusManga } from '@/services/nexus/types';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'updatedAt', label: 'Recentes' },
  { value: 'views', label: 'Populares' },
  { value: 'lastChapterAt', label: 'Último cap.' },
  { value: 'title', label: 'A-Z' },
];

const TYPE_OPTIONS: { value: MangaType | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'manga', label: 'Manga' },
  { value: 'manhwa', label: 'Manhwa' },
  { value: 'manhua', label: 'Manhua' },
  { value: 'webtoon', label: 'Webtoon' },
];

const STATUS_OPTIONS: { value: MangaStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'ongoing', label: 'Em andamento' },
  { value: 'completed', label: 'Completo' },
  { value: 'hiatus', label: 'Hiato' },
];

const NUM_COLUMNS = 3;

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [mangas, setMangas] = useState<NexusManga[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt');
  const [typeFilter, setTypeFilter] = useState<MangaType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<MangaStatus | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList>(null);

  // Fetch on filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadMangas(true);
    }, searchQuery ? 500 : 0);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, sortBy, typeFilter, statusFilter]);

  async function loadMangas(reset = false) {
    const nextPage = reset ? 1 : page + 1;
    if (!reset && nextPage > totalPages) return;

    if (reset) {
      setLoading(true);
      setMangas([]);
    } else {
      setLoadingMore(true);
    }

    try {
      const filters: ExploreFilters = {
        page: nextPage,
        limit: 30,
        sortBy,
        sortOrder: sortBy === 'title' ? 'asc' : 'desc',
        search: searchQuery || undefined,
        type: typeFilter === 'all' ? undefined : typeFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
      };
      const res = await exploreMangas(filters);
      setMangas((prev) => (reset ? res.data : [...prev, ...res.data]));
      setPage(nextPage);
      setTotalPages(res.pages);
      setTotal(res.total);
    } catch (err) {
      console.error('[EXPLORE] ERROR:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  function formatViews(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
    return String(v);
  }

  function renderMangaCard({ item }: { item: NexusManga }) {
    return (
      <Pressable style={styles.card} onPress={() => router.push(`/manga/${item.slug}`)}>
        {item.coverImage ? (
          <Image source={{ uri: item.coverImage }} style={styles.cardCover} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.cardCover, styles.placeholder]}>
            <IconSymbol name="book.fill" size={24} color={Colors.dark.textMuted} />
          </View>
        )}
        <ThemedText style={styles.cardTitle} numberOfLines={2}>{item.title}</ThemedText>
        <ThemedText style={styles.cardSub}>Cap. {item.chapterCount}</ThemedText>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.title}>Explorar</ThemedText>
        <Pressable style={styles.filterBtn} onPress={() => setShowFilters((v) => !v)}>
          <IconSymbol name="chevron.right" size={16} color={showFilters ? Colors.dark.primary : Colors.dark.textSecondary} style={{ transform: [{ rotate: showFilters ? '90deg' : '0deg' }] }} />
          <ThemedText style={[styles.filterBtnText, showFilters && { color: Colors.dark.primary }]}>Filtros</ThemedText>
        </Pressable>
      </View>

      {/* Search */}
      <SearchBar value={searchQuery} onChangeText={setSearchQuery} />

      {/* Filters */}
      {showFilters && (
        <View style={styles.filtersContainer}>
          {/* Sort */}
          <View style={styles.filterSection}>
            <ThemedText style={styles.filterLabel}>Ordenar por</ThemedText>
            <View style={styles.filterChips}>
              {SORT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.chip, sortBy === opt.value && styles.chipActive]}
                  onPress={() => setSortBy(opt.value)}
                >
                  <ThemedText style={[styles.chipText, sortBy === opt.value && styles.chipTextActive]}>
                    {opt.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Type */}
          <View style={styles.filterSection}>
            <ThemedText style={styles.filterLabel}>Tipo</ThemedText>
            <View style={styles.filterChips}>
              {TYPE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.chip, typeFilter === opt.value && styles.chipActive]}
                  onPress={() => setTypeFilter(opt.value)}
                >
                  <ThemedText style={[styles.chipText, typeFilter === opt.value && styles.chipTextActive]}>
                    {opt.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Status */}
          <View style={styles.filterSection}>
            <ThemedText style={styles.filterLabel}>Status</ThemedText>
            <View style={styles.filterChips}>
              {STATUS_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.chip, statusFilter === opt.value && styles.chipActive]}
                  onPress={() => setStatusFilter(opt.value)}
                >
                  <ThemedText style={[styles.chipText, statusFilter === opt.value && styles.chipTextActive]}>
                    {opt.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Results count */}
      {!loading && (
        <View style={styles.resultsBar}>
          <ThemedText style={styles.resultsText}>{total.toLocaleString()} mangás</ThemedText>
          <ThemedText style={styles.resultsPage}>Página {page}/{totalPages}</ThemedText>
        </View>
      )}

      {/* Grid */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
          <ThemedText style={styles.loadingText}>Carregando...</ThemedText>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={mangas}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMangaCard}
          numColumns={NUM_COLUMNS}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (!loadingMore && page < totalPages) loadMangas(false);
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={Colors.dark.primary} />
                <ThemedText style={styles.loadingText}>Carregando mais...</ThemedText>
              </View>
            ) : page >= totalPages && mangas.length > 0 ? (
              <View style={styles.footerLoader}>
                <ThemedText style={styles.loadingText}>Fim dos resultados</ThemedText>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <ThemedText style={styles.emptyText}>Nenhum mangá encontrado</ThemedText>
            </View>
          }
        />
      )}
    </View>
  );
}

const cardWidth = (375 - 40 - 16) / NUM_COLUMNS; // approximate, will flex

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.dark.text,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.dark.textSecondary,
  },

  // Filters
  filtersContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 16,
  },
  filterSection: {
    gap: 8,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.dark.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  chipActive: {
    backgroundColor: Colors.dark.primary + '25',
    borderColor: Colors.dark.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.dark.textMuted,
  },
  chipTextActive: {
    color: Colors.dark.primaryLight,
  },

  // Results bar
  resultsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  resultsText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: '600',
  },
  resultsPage: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },

  // Grid
  grid: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  row: {
    gap: 8,
    marginBottom: 16,
  },
  card: {
    flex: 1,
    maxWidth: `${100 / NUM_COLUMNS}%` as any,
  },
  cardCover: {
    width: '100%',
    aspectRatio: 0.7,
    borderRadius: 10,
    marginBottom: 6,
  },
  placeholder: {
    backgroundColor: Colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.dark.text,
    lineHeight: 15,
  },
  cardSub: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },

  // States
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  footerLoader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
  },
});
