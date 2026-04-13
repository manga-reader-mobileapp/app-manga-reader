import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  getDownloadedMangas,
  getDownloadQueue,
  onQueueChange,
  removeFromQueue,
  deleteDownloadedChapter,
  type DownloadedManga,
  type QueueItem,
} from '@/services/downloads';

interface DownloadsViewProps {
  topInset?: number;
  showHeader?: boolean;
}

interface FlatDownloadItem {
  type: 'downloaded' | 'queue';
  chapterId: number;
  chapterNumber: string;
  title: string | null;
  mangaTitle: string;
  mangaSlug: string;
  source: string;
  sourceId: number;
  coverUrl: string | null;
  localCover: string | null;
  totalPages: number;
  downloadedPages: number;
  status: string;
  sortDate: string;
}

export function DownloadsView({ topInset = 0, showHeader = true }: DownloadsViewProps) {
  const router = useRouter();
  const [mangas, setMangas] = useState<DownloadedManga[]>([]);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useFocusEffect(
    useCallback(() => {
      loadDownloads();
    }, []),
  );

  useEffect(() => {
    const unsub = onQueueChange((q) => {
      setQueue(q);
      loadDownloads();
    });
    getDownloadQueue().then(setQueue);
    return unsub;
  }, []);

  async function loadDownloads() {
    try {
      const data = await getDownloadedMangas();
      setMangas(data);
    } catch (err) {
      console.error('[DOWNLOADS_VIEW] Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: number) {
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
  }

  function selectAll() {
    setSelectedIds(new Set(items.map((i) => i.chapterId)));
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    for (const item of items) {
      if (!selectedIds.has(item.chapterId)) continue;
      if (item.type === 'queue') {
        await removeFromQueue(item.chapterId);
      } else {
        await deleteDownloadedChapter(item.source, item.sourceId, item.chapterId);
      }
    }
    await loadDownloads();
    const q = await getDownloadQueue();
    setQueue(q);
    exitSelection();
  }

  function confirmDeleteAll() {
    Alert.alert(
      'Limpar downloads',
      'Remover todos os downloads e cancelar pendentes?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar tudo',
          style: 'destructive',
          onPress: async () => {
            // Select all and delete
            for (const item of items) {
              if (item.type === 'queue') {
                await removeFromQueue(item.chapterId);
              } else {
                await deleteDownloadedChapter(item.source, item.sourceId, item.chapterId);
              }
            }
            await loadDownloads();
            const q = await getDownloadQueue();
            setQueue(q);
          },
        },
      ],
    );
  }

  // Build flat list
  const items: FlatDownloadItem[] = [];

  for (const q of queue) {
    const manga = mangas.find((m) => m.id === q.mangaId);
    items.push({
      type: 'queue',
      chapterId: q.chapterId,
      chapterNumber: q.chapterNumber,
      title: q.chapterTitle,
      mangaTitle: q.mangaTitle,
      mangaSlug: q.slug,
      source: q.source,
      sourceId: q.sourceId,
      coverUrl: q.coverUrl,
      localCover: manga?.localCover || null,
      totalPages: q.totalPages,
      downloadedPages: q.downloadedPages,
      status: q.status,
      sortDate: q.addedAt,
    });
  }

  const queueIds = new Set(queue.map((q) => q.chapterId));
  for (const manga of mangas) {
    for (const ch of Object.values(manga.chapters)) {
      if (queueIds.has(ch.chapterId)) continue;
      if (ch.downloadedPages === 0) continue;
      items.push({
        type: 'downloaded',
        chapterId: ch.chapterId,
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        mangaTitle: manga.title,
        mangaSlug: manga.slug,
        source: manga.source,
        sourceId: manga.sourceId,
        coverUrl: manga.coverUrl,
        localCover: manga.localCover,
        totalPages: ch.totalPages,
        downloadedPages: ch.downloadedPages,
        status: 'done',
        sortDate: ch.downloadedAt,
      });
    }
  }

  items.sort((a, b) => {
    if (a.type === 'queue' && b.type !== 'queue') return -1;
    if (a.type !== 'queue' && b.type === 'queue') return 1;
    return new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime();
  });

  function renderItem({ item }: { item: FlatDownloadItem }) {
    const cover = item.localCover || item.coverUrl;
    const isComplete = item.downloadedPages >= item.totalPages && item.totalPages > 0;
    const isDownloading = item.status === 'downloading';
    const isError = item.status === 'error';
    const isSelected = selectedIds.has(item.chapterId);

    return (
      <Pressable
        style={[styles.row, isSelected && styles.rowSelected]}
        onPress={() => {
          if (selectionMode) {
            toggleSelect(item.chapterId);
            return;
          }
          if (!isComplete) {
            router.push(`/manga/${item.mangaSlug}`);
            return;
          }
          router.push({
            pathname: '/reader/[chapterId]' as any,
            params: {
              chapterId: String(item.chapterId),
              mangaTitle: item.mangaTitle,
              mangaSlug: item.mangaSlug,
              chapterNumber: item.chapterNumber,
              chapterList: JSON.stringify([{ id: item.chapterId, number: item.chapterNumber }]),
              offline: 'true',
              offlineSource: item.source,
              offlineSourceId: String(item.sourceId),
            },
          });
        }}
        onLongPress={() => {
          if (!selectionMode) {
            setSelectionMode(true);
            setSelectedIds(new Set([item.chapterId]));
          }
        }}
        delayLongPress={400}
      >
        {selectionMode && (
          <IconSymbol
            name={isSelected ? 'checkmark.circle.fill' : 'circle'}
            size={20}
            color={isSelected ? Colors.dark.primary : Colors.dark.textMuted}
          />
        )}

        <View style={styles.coverWrap}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <IconSymbol name="book.fill" size={14} color={Colors.dark.textMuted} />
            </View>
          )}
        </View>

        <View style={styles.info}>
          <ThemedText style={styles.mangaName} numberOfLines={1}>{item.mangaTitle}</ThemedText>
          <ThemedText style={styles.chapterNum} numberOfLines={1}>
            Capítulo {item.chapterNumber}
            {item.title ? ` — ${item.title}` : ''}
          </ThemedText>
        </View>

        {isComplete ? (
          <IconSymbol name="checkmark.circle.fill" size={18} color="#10B981" />
        ) : isDownloading ? (
          <View style={styles.progressWrap}>
            <ActivityIndicator size={14} color={Colors.dark.primary} />
            {item.totalPages > 0 && (
              <ThemedText style={styles.progressText}>{item.downloadedPages}/{item.totalPages}</ThemedText>
            )}
          </View>
        ) : isError ? (
          <IconSymbol name="xmark" size={16} color="#EF4444" />
        ) : (
          <ThemedText style={styles.pendingText}>Na fila</ThemedText>
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      {showHeader && (
        <View style={[styles.header, { paddingTop: topInset + 12 }]}>
          {selectionMode ? (
            <View style={styles.selectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable onPress={exitSelection} style={styles.closeBtn}>
                  <IconSymbol name="xmark" size={16} color={Colors.dark.text} />
                </Pressable>
                <ThemedText style={styles.title}>
                  {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
                </ThemedText>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable onPress={selectAll}>
                  <ThemedText style={styles.actionText}>Tudo</ThemedText>
                </Pressable>
                <Pressable onPress={deleteSelected} disabled={selectedIds.size === 0}>
                  <IconSymbol name="trash.fill" size={20} color={selectedIds.size > 0 ? '#EF4444' : Colors.dark.textMuted} />
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.normalHeader}>
              <View>
                <ThemedText style={styles.title}>Downloads</ThemedText>
                <ThemedText style={styles.subtitle}>
                  {items.length} item{items.length !== 1 ? 's' : ''}
                  {queue.length > 0 ? ` · ${queue.length} na fila` : ''}
                </ThemedText>
              </View>
              {items.length > 0 && (
                <Pressable onPress={confirmDeleteAll} style={styles.clearBtn}>
                  <IconSymbol name="trash.fill" size={16} color="#EF4444" />
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {!loading && items.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol name="arrow.down.circle" size={48} color={Colors.dark.textMuted} />
          <ThemedText style={styles.emptyTitle}>Sem downloads</ThemedText>
          <ThemedText style={styles.emptyText}>
            Selecione capítulos na página do mangá para baixar
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.type}-${item.chapterId}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  normalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  selectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: '800', color: Colors.dark.text },
  subtitle: { fontSize: 14, color: Colors.dark.textMuted },
  actionText: { fontSize: 14, fontWeight: '600', color: Colors.dark.primaryLight },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.dark.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  clearBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.dark.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.dark.border, marginTop: 4 },

  list: { paddingHorizontal: 16, paddingBottom: 100 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.dark.border },
  rowSelected: { backgroundColor: Colors.dark.primary + '15', borderRadius: 10, marginHorizontal: -8, paddingHorizontal: 8 },
  coverWrap: { borderRadius: 6, overflow: 'hidden' },
  cover: { width: 36, height: 50, borderRadius: 6 },
  coverPlaceholder: { backgroundColor: Colors.dark.surfaceLight, justifyContent: 'center', alignItems: 'center' },

  info: { flex: 1 },
  mangaName: { fontSize: 14, fontWeight: '700', color: Colors.dark.text },
  chapterNum: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 2 },

  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressText: { fontSize: 10, fontWeight: '600', color: Colors.dark.textMuted },
  pendingText: { fontSize: 11, color: Colors.dark.textMuted },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingBottom: 100 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.dark.text },
  emptyText: { fontSize: 14, color: Colors.dark.textMuted, textAlign: 'center', paddingHorizontal: 40 },
});
