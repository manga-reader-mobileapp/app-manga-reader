import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  getLibrary,
  redownloadCovers,
  removeFromLibrary,
  setMangasCategory,
  type LibraryManga,
  type LibrarySortBy,
} from '@/services/library';
import { getCategories } from '@/services/categories';
import { checkForUpdates, getUpdaterConfig, saveUpdaterConfig } from '@/services/updater';

const GRID_KEY = 'mangaVerse_library_grid';
const SORT_KEY = 'mangaVerse_library_sort';
const CAT_KEY = 'mangaVerse_library_active_cat';
const GRID_OPTIONS = [2, 4, 6] as const;
type GridSize = (typeof GRID_OPTIONS)[number];

const SORT_OPTIONS: { value: LibrarySortBy; label: string }[] = [
  { value: 'addedAt', label: 'Adicionado' },
  { value: 'lastReadAt', label: 'Último lido' },
  { value: 'lastChapterAt', label: 'Último cap.' },
  { value: 'title', label: 'A-Z' },
];

const W = Dimensions.get('window').width;
const PAD = 16;
const GAP = 8;

interface LibraryViewProps {
  topInset?: number;
  showHeader?: boolean;
}

export function LibraryView({ topInset = 0, showHeader = true }: LibraryViewProps) {
  const router = useRouter();
  const [allMangas, setAllMangas] = useState<LibraryManga[]>([]);
  const [loading, setLoading] = useState(true);
  const [grid, setGrid] = useState<GridSize>(2);
  const [sortBy, setSortBy] = useState<LibrarySortBy>('addedAt');
  const [showDrawer, setShowDrawer] = useState(false);
  const [redownloading, setRedownloading] = useState(false);

  // Categories
  const [categories, setCategories_] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null); // null = "Padrão"

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()); // manga ids
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [updating, setUpdating] = useState(false);

  const drawerTranslate = useSharedValue(W);

  useEffect(() => {
    drawerTranslate.value = withTiming(showDrawer ? 0 : W, { duration: 250 });
  }, [showDrawer]);

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drawerTranslate.value }],
  }));

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(GRID_KEY),
      AsyncStorage.getItem(SORT_KEY),
      AsyncStorage.getItem(CAT_KEY),
    ]).then(([g, s, c]) => {
      if (g && GRID_OPTIONS.includes(Number(g) as GridSize)) setGrid(Number(g) as GridSize);
      if (s) setSortBy(s as LibrarySortBy);
      if (c !== null) setActiveCategory(c === '__default__' ? null : c);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLibrary();
      loadCategories();
    }, [sortBy]),
  );

  async function loadLibrary() {
    try {
      setLoading(true);
      const data = await getLibrary(sortBy);
      setAllMangas(data);
    } catch (err) {
      console.error('[LIBRARY] Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    const cats = await getCategories();
    setCategories_(cats);
  }

  // Filter mangas by active category
  const mangas = allMangas.filter((m) => {
    if (activeCategory === null) {
      return !m.userCategory; // "Padrão" = uncategorized
    }
    return m.userCategory === activeCategory;
  });

  const allTabs = [null, ...categories]; // null = "Padrão"

  async function changeGrid(size: GridSize) {
    setGrid(size);
    await AsyncStorage.setItem(GRID_KEY, String(size));
  }

  async function changeSort(sort: LibrarySortBy) {
    setSortBy(sort);
    await AsyncStorage.setItem(SORT_KEY, sort);
    const data = await getLibrary(sort);
    setAllMangas(data);
  }

  async function handleRedownload() {
    setRedownloading(true);
    try {
      await redownloadCovers();
      await loadLibrary();
    } catch (err) {
      console.error('[LIBRARY] Redownload error:', err);
    } finally {
      setRedownloading(false);
    }
  }

  async function updateCurrentCategory() {
    setShowHeaderMenu(false);
    setUpdating(true);
    try {
      const catName = activeCategory || 'Padrão';
      await checkForUpdates([catName]);
      await loadLibrary();
    } catch (err) {
      console.error('[LIBRARY] Update error:', err);
    } finally {
      setUpdating(false);
    }
  }

  function getUnreadCount(manga: LibraryManga): number {
    const completed = manga.completedChapter || manga.lastReadChapter;
    if (!completed) return manga.totalChapters;
    const read = parseFloat(completed);
    if (isNaN(read)) return 0;
    return Math.max(0, manga.totalChapters - Math.floor(read));
  }

  // Selection
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setShowCategoryPicker(false);
  }

  async function unfavoriteSelected() {
    for (const id of selectedIds) {
      const manga = allMangas.find((m) => m.id === id);
      if (manga) await removeFromLibrary(manga.source, manga.sourceId);
    }
    await loadLibrary();
    exitSelection();
  }

  async function moveToCategorySelected(cat: string | null) {
    const ids = [...selectedIds].map((id) => {
      const m = allMangas.find((mg) => mg.id === id)!;
      return { source: m.source, sourceId: m.sourceId };
    }).filter(Boolean);
    await setMangasCategory(ids, cat);
    await loadLibrary();
    setShowCategoryPicker(false);
    exitSelection();
  }

  const cardWidth = (W - PAD * 2 - GAP * (grid - 1)) / grid;

  function renderCard({ item }: { item: LibraryManga }) {
    const cover = item.localCover
      ? { uri: item.localCover }
      : item.coverUrl
        ? { uri: item.coverUrl }
        : null;
    const unread = getUnreadCount(item);
    const isSelected = selectedIds.has(item.id);

    return (
      <Pressable
        style={[{ width: cardWidth }, isSelected && styles.cardSelected]}
        onPress={() => {
          if (selectionMode) {
            toggleSelect(item.id);
            return;
          }
          router.push(`/manga/${item.slug}`);
        }}
        onLongPress={() => {
          if (!selectionMode) {
            setSelectionMode(true);
            setSelectedIds(new Set([item.id]));
          }
        }}
        delayLongPress={400}
      >
        <View style={styles.coverWrap}>
          {cover ? (
            <Image source={cover} style={styles.cover} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.cover, styles.placeholder]}>
              <IconSymbol name="book.fill" size={grid <= 2 ? 32 : 20} color={Colors.dark.textMuted} />
            </View>
          )}

          {unread > 0 && (
            <View style={styles.unreadBadge}>
              <ThemedText style={styles.unreadText}>{unread}</ThemedText>
            </View>
          )}

          {selectionMode && (
            <View style={styles.selectOverlay}>
              <IconSymbol
                name={isSelected ? 'checkmark.circle.fill' : 'circle'}
                size={24}
                color={isSelected ? Colors.dark.primary : 'rgba(255,255,255,0.7)'}
              />
            </View>
          )}
        </View>
        <ThemedText style={[styles.cardTitle, grid >= 6 && { fontSize: 9 }]} numberOfLines={2}>
          {item.title}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      {/* ========== HEADER ========== */}
      {showHeader && !selectionMode && (
        <View style={[styles.header, { paddingTop: topInset + 12 }]}>
          <ThemedText style={styles.title}>Biblioteca</ThemedText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {updating && <ActivityIndicator size={18} color={Colors.dark.primary} style={{ marginRight: 4 }} />}
            <Pressable style={styles.headerBtn} onPress={() => setShowHeaderMenu((v) => !v)}>
              <IconSymbol name="server.rack" size={18} color={Colors.dark.primaryLight} />
            </Pressable>
          </View>
        </View>
      )}
      {/* Header popover menu */}
      {showHeaderMenu && (
        <>
          <Pressable style={styles.menuOverlay} onPress={() => setShowHeaderMenu(false)} />
          <View style={[styles.headerPopover, { top: topInset + 52 }]}>
            <Pressable style={styles.popoverItem} onPress={updateCurrentCategory}>
              <IconSymbol name="globe" size={16} color={Colors.dark.primaryLight} />
              <ThemedText style={styles.popoverText}>
                Atualizar "{activeCategory || 'Padrão'}"
              </ThemedText>
            </Pressable>
            <View style={styles.popoverDivider} />
            <Pressable style={styles.popoverItem} onPress={() => { setShowHeaderMenu(false); setShowDrawer(true); }}>
              <IconSymbol name="server.rack" size={16} color={Colors.dark.primaryLight} />
              <ThemedText style={styles.popoverText}>Configurações da grade</ThemedText>
            </Pressable>
          </View>
        </>
      )}

      {selectionMode && (
        <View style={[styles.selectionBar, { paddingTop: topInset + 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={exitSelection} style={styles.closeBtn}>
              <IconSymbol name="xmark" size={18} color={Colors.dark.text} />
            </Pressable>
            <ThemedText style={styles.selectionCount}>{selectedIds.size}</ThemedText>
          </View>
          <Pressable onPress={() => setSelectedIds(new Set(mangas.map((m) => m.id)))}>
            <IconSymbol name="checkmark.circle.fill" size={22} color={Colors.dark.textSecondary} />
          </Pressable>
        </View>
      )}

      {/* ========== CATEGORY TABS ========== */}
      {allTabs.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
          style={{ flexGrow: 0 }}
        >
          {allTabs.map((cat) => {
            const isActive = cat === activeCategory;
            const label = cat || 'Padrão';
            return (
              <Pressable
                key={label}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => {
                  setActiveCategory(cat);
                  AsyncStorage.setItem(CAT_KEY, cat === null ? '__default__' : cat);
                }}
              >
                <ThemedText style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* ========== CONTENT ========== */}
      {!loading && mangas.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol name="bookmark" size={48} color={Colors.dark.textMuted} />
          <ThemedText style={styles.emptyTitle}>
            {activeCategory ? `"${activeCategory}" vazia` : 'Biblioteca vazia'}
          </ThemedText>
          <ThemedText style={styles.emptyText}>
            Adicione mangás à biblioteca pela página de detalhes
          </ThemedText>
        </View>
      ) : (
        <FlatList
          key={`grid-${grid}-${activeCategory}`}
          data={mangas}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          numColumns={grid}
          columnWrapperStyle={grid > 1 ? { gap: GAP, marginBottom: GAP } : undefined}
          contentContainerStyle={{ paddingHorizontal: PAD, paddingTop: 4, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ========== SELECTION ACTION BAR ========== */}
      {selectionMode && (
        <View style={[styles.actionBar, { paddingBottom: 20 }]}>
          <View style={styles.actionIcons}>
            <Pressable style={styles.actionIcon} onPress={() => {
              // Pre-select the current category of first selected manga
              const firstId = [...selectedIds][0];
              const firstManga = allMangas.find((m) => m.id === firstId);
              setPickerCategory(firstManga?.userCategory || null);
              setShowCategoryPicker(true);
            }}>
              <IconSymbol name="folder.fill" size={20} color={Colors.dark.text} />
            </Pressable>
            <Pressable style={styles.actionIcon} onPress={() => {
              Alert.alert('Desfavoritar', `Remover ${selectedIds.size} mangá(s) da biblioteca?`, [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Remover', style: 'destructive', onPress: unfavoriteSelected },
              ]);
            }}>
              <IconSymbol name="bookmark" size={20} color={Colors.dark.text} />
            </Pressable>
          </View>
        </View>
      )}

      {/* ========== CATEGORY PICKER MODAL ========== */}
      {showCategoryPicker && (
        <>
          <Pressable style={styles.modalOverlay} onPress={() => setShowCategoryPicker(false)} />
          <View style={styles.modal}>
            <ThemedText style={styles.modalTitle}>Definir categorias</ThemedText>

            {/* Padrão option */}
            <Pressable
              style={styles.modalOption}
              onPress={() => setPickerCategory(null)}
            >
              <View style={[styles.checkbox, pickerCategory === null && styles.checkboxActive]}>
                {pickerCategory === null && (
                  <IconSymbol name="checkmark" size={14} color="#fff" />
                )}
              </View>
              <ThemedText style={styles.modalOptionText}>Padrão</ThemedText>
            </Pressable>

            {/* User categories */}
            {categories.map((cat) => (
              <Pressable
                key={cat}
                style={styles.modalOption}
                onPress={() => setPickerCategory(cat)}
              >
                <View style={[styles.checkbox, pickerCategory === cat && styles.checkboxActive]}>
                  {pickerCategory === cat && (
                    <IconSymbol name="checkmark" size={14} color="#fff" />
                  )}
                </View>
                <ThemedText style={styles.modalOptionText}>{cat}</ThemedText>
              </Pressable>
            ))}

            {categories.length === 0 && (
              <ThemedText style={styles.modalEmpty}>Crie categorias em Configurações</ThemedText>
            )}

            {/* Actions */}
            <View style={styles.modalActions}>
              <Pressable onPress={() => {
                setShowCategoryPicker(false);
                // Navigate to settings
              }}>
                <ThemedText style={styles.modalAction}>Editar</ThemedText>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setShowCategoryPicker(false)}>
                <ThemedText style={styles.modalAction}>Cancelar</ThemedText>
              </Pressable>
              <Pressable onPress={() => moveToCategorySelected(pickerCategory)}>
                <ThemedText style={[styles.modalAction, { color: Colors.dark.primary }]}>OK</ThemedText>
              </Pressable>
            </View>
          </View>
        </>
      )}

      {/* ========== SETTINGS DRAWER ========== */}
      {showDrawer && (
        <Pressable style={styles.drawerOverlay} onPress={() => setShowDrawer(false)} />
      )}
      <Animated.View style={[styles.drawer, drawerStyle, { paddingTop: topInset + 16 }]}>
        <View style={styles.drawerHeader}>
          <ThemedText style={styles.drawerTitle}>Configurações</ThemedText>
          <Pressable onPress={() => setShowDrawer(false)}>
            <ThemedText style={styles.drawerClose}>✕</ThemedText>
          </Pressable>
        </View>

        <View style={styles.drawerSection}>
          <ThemedText style={styles.drawerLabel}>Grade</ThemedText>
          <View style={styles.drawerOptions}>
            {GRID_OPTIONS.map((size) => (
              <Pressable
                key={size}
                style={[styles.optionBtn, grid === size && styles.optionBtnActive]}
                onPress={() => changeGrid(size)}
              >
                <ThemedText style={[styles.optionText, grid === size && styles.optionTextActive]}>
                  {size}x
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.drawerSection}>
          <ThemedText style={styles.drawerLabel}>Ordenar por</ThemedText>
          <View style={styles.sortList}>
            {SORT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[styles.sortItem, sortBy === opt.value && styles.sortItemActive]}
                onPress={() => changeSort(opt.value)}
              >
                <ThemedText style={[styles.sortItemText, sortBy === opt.value && styles.sortItemTextActive]}>
                  {opt.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable
          style={styles.redownloadBtn}
          onPress={handleRedownload}
          disabled={redownloading}
        >
          <IconSymbol name="globe" size={16} color={redownloading ? Colors.dark.textMuted : Colors.dark.primaryLight} />
          <ThemedText style={[styles.redownloadText, redownloading && { color: Colors.dark.textMuted }]}>
            {redownloading ? 'Baixando...' : 'Regerar imagens'}
          </ThemedText>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: PAD, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: Colors.dark.text },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.dark.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.dark.border },

  // Selection header
  selectionBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: PAD, paddingBottom: 8 },
  selectionCount: { fontSize: 22, fontWeight: '800', color: Colors.dark.text },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.dark.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  menuOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  headerPopover: { position: 'absolute', right: 16, zIndex: 11, backgroundColor: Colors.dark.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.dark.border, paddingVertical: 4, minWidth: 220, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  popoverItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  popoverText: { fontSize: 14, fontWeight: '600', color: Colors.dark.text },
  popoverDivider: { height: 1, backgroundColor: Colors.dark.border, marginHorizontal: 12 },

  // Category tabs
  tabsRow: { paddingHorizontal: PAD, gap: 0, marginBottom: 4 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.dark.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: Colors.dark.textMuted },
  tabTextActive: { color: Colors.dark.text },

  // Grid
  grid: { paddingHorizontal: PAD, paddingBottom: 100 },
  coverWrap: { borderRadius: 12, overflow: 'hidden', position: 'relative' },
  cover: { width: '100%', aspectRatio: 0.68 },
  placeholder: { backgroundColor: Colors.dark.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  unreadBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: Colors.dark.primary, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, minWidth: 24, alignItems: 'center' },
  unreadText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  selectOverlay: { position: 'absolute', top: 6, right: 6 },
  cardSelected: { opacity: 0.8 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: Colors.dark.text, marginTop: 6, lineHeight: 15 },

  // Empty
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingBottom: 100 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.dark.text },
  emptyText: { fontSize: 14, color: Colors.dark.textMuted, textAlign: 'center', paddingHorizontal: 40 },

  // Selection action bar
  actionBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.dark.surface, borderTopWidth: 1, borderTopColor: Colors.dark.border, paddingHorizontal: 20, paddingTop: 12 },
  actionIcons: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  actionIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.dark.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  // Category modal
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 20 },
  modal: { position: 'absolute', left: 32, right: 32, top: '30%', backgroundColor: Colors.dark.surface, borderRadius: 16, padding: 24, zIndex: 21, borderWidth: 1, borderColor: Colors.dark.border },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.dark.text, marginBottom: 20 },
  modalOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  modalOptionText: { fontSize: 15, color: Colors.dark.text },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: Colors.dark.textMuted, justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary },
  modalEmpty: { fontSize: 13, color: Colors.dark.textMuted, paddingVertical: 12 },
  modalActions: { flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.dark.border },
  modalAction: { fontSize: 14, fontWeight: '600', color: Colors.dark.primaryLight },

  // Drawer
  drawerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  drawer: { position: 'absolute', top: 0, bottom: 0, right: 0, width: W * 0.72, backgroundColor: Colors.dark.surface, paddingHorizontal: 20, paddingBottom: 40, borderLeftWidth: 1, borderLeftColor: Colors.dark.border },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  drawerTitle: { fontSize: 20, fontWeight: '800', color: Colors.dark.text },
  drawerClose: { fontSize: 18, color: Colors.dark.textMuted, padding: 4 },
  drawerSection: { marginBottom: 28 },
  drawerLabel: { fontSize: 13, fontWeight: '700', color: Colors.dark.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  drawerOptions: { flexDirection: 'row', gap: 8 },
  optionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.dark.surfaceLight, alignItems: 'center', borderWidth: 1, borderColor: Colors.dark.border },
  optionBtnActive: { backgroundColor: Colors.dark.primary + '30', borderColor: Colors.dark.primary },
  optionText: { fontSize: 14, fontWeight: '700', color: Colors.dark.textMuted },
  optionTextActive: { color: Colors.dark.primaryLight },
  sortList: { gap: 4 },
  sortItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, backgroundColor: Colors.dark.surfaceLight, borderWidth: 1, borderColor: Colors.dark.border },
  sortItemActive: { backgroundColor: Colors.dark.primary + '20', borderColor: Colors.dark.primary },
  sortItemText: { fontSize: 14, fontWeight: '600', color: Colors.dark.textMuted },
  sortItemTextActive: { color: Colors.dark.primaryLight },
  redownloadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.dark.surfaceLight, borderWidth: 1, borderColor: Colors.dark.border },
  redownloadText: { fontSize: 14, fontWeight: '600', color: Colors.dark.primaryLight },
});
