import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  getDownloadedChapters,
  deleteDownloadedChapter,
  deleteDownloadedManga,
  getDownloadQueue,
  onQueueChange,
  removeFromQueue,
  type DownloadedChapter,
  type QueueItem,
} from '@/services/downloads';

export default function DownloadedChaptersScreen() {
  const { mangaId, mangaTitle, mangaSlug, source, sourceId } = useLocalSearchParams<{
    mangaId: string;
    mangaTitle: string;
    mangaSlug: string;
    source: string;
    sourceId: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [chapters, setChapters] = useState<DownloadedChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [chaptersAsc, setChaptersAsc] = useState(true);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  const srcId = Number(sourceId);

  useFocusEffect(
    useCallback(() => {
      loadChapters();
    }, []),
  );

  useEffect(() => {
    const unsub = onQueueChange((q) => {
      setQueue(q.filter((qi) => qi.sourceId === srcId && qi.source === source));
      loadChapters();
    });
    getDownloadQueue().then((q) =>
      setQueue(q.filter((qi) => qi.sourceId === srcId && qi.source === source)),
    );
    return unsub;
  }, []);

  async function loadChapters() {
    try {
      const data = await getDownloadedChapters(source!, srcId);
      setChapters(data);
    } catch (err) {
      console.error('[DL_CHAPTERS] Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  function confirmDeleteChapter(ch: DownloadedChapter) {
    Alert.alert(
      'Deletar capítulo',
      `Remover o capítulo ${ch.chapterNumber} dos downloads?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deletar',
          style: 'destructive',
          onPress: async () => {
            await deleteDownloadedChapter(source!, srcId, ch.chapterId);
            await loadChapters();
            // If no chapters left, go back
            const remaining = await getDownloadedChapters(source!, srcId);
            if (remaining.length === 0) router.back();
          },
        },
      ],
    );
  }

  function confirmDeleteAll() {
    Alert.alert(
      'Deletar tudo',
      `Remover todos os capítulos baixados de "${mangaTitle}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deletar tudo',
          style: 'destructive',
          onPress: async () => {
            await deleteDownloadedManga(source!, srcId);
            router.back();
          },
        },
      ],
    );
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  const sortedChapters = chaptersAsc
    ? [...chapters]
    : [...chapters].reverse();

  // Build list of downloading chapters from queue
  const queueChapterIds = new Set(queue.map((q) => q.chapterId));

  if (loading) {
    return (
      <View style={[styles.container, styles.centerBox, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <ThemedText style={styles.backBtnText}>{'‹'}</ThemedText>
          </Pressable>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {mangaTitle}
          </ThemedText>
          <Pressable style={styles.backBtn} onPress={confirmDeleteAll}>
            <IconSymbol name="trash.fill" size={16} color="#EF4444" />
          </Pressable>
        </View>

        {/* Chapter count + sort */}
        <View style={styles.chapterHeader}>
          <ThemedText style={styles.sectionTitle}>Capítulos baixados</ThemedText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ThemedText style={styles.chapterCount}>
              {chapters.length} cap{chapters.length !== 1 ? 's' : ''}
            </ThemedText>
            <Pressable
              style={styles.sortBtn}
              onPress={() => setChaptersAsc((v) => !v)}
            >
              <ThemedText style={styles.sortBtnText}>
                {chaptersAsc ? '1→99' : '99→1'}
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Downloading queue items */}
        {queue.length > 0 && (
          <View style={styles.queueSection}>
            <ThemedText style={styles.queueTitle}>
              Baixando ({queue.length})
            </ThemedText>
            {queue.map((q) => (
              <View key={q.chapterId} style={styles.queueItem}>
                {q.status === 'error' ? (
                  <IconSymbol name="xmark" size={16} color="#EF4444" />
                ) : (
                  <ActivityIndicator size="small" color={Colors.dark.primary} />
                )}
                <View style={styles.queueInfo}>
                  <ThemedText style={styles.chapterNumber}>
                    Capítulo {q.chapterNumber}
                  </ThemedText>
                  <ThemedText style={[styles.queueProgress, q.status === 'error' && { color: '#EF4444' }]}>
                    {q.status === 'error'
                      ? q.error || 'Erro'
                      : q.totalPages > 0
                        ? `${q.downloadedPages}/${q.totalPages} páginas`
                        : 'Aguardando...'}
                  </ThemedText>
                </View>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => removeFromQueue(q.chapterId)}
                  hitSlop={10}
                >
                  <IconSymbol name="xmark" size={14} color={Colors.dark.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Chapter list */}
        <View style={styles.chaptersSection}>
          {sortedChapters.map((ch) => {
            const isComplete = ch.downloadedPages >= ch.totalPages;

            return (
              <Pressable
                key={ch.chapterId}
                style={styles.chapterItem}
                onPress={() => {
                  if (!isComplete) return;
                  // Build chapter list from downloaded chapters for nav
                  const chaptersForNav = chapters.map((c) => ({
                    id: c.chapterId,
                    number: c.chapterNumber,
                  }));
                  router.push({
                    pathname: '/reader/[chapterId]',
                    params: {
                      chapterId: String(ch.chapterId),
                      mangaTitle: mangaTitle!,
                      mangaSlug: mangaSlug!,
                      chapterNumber: ch.chapterNumber,
                      chapterList: JSON.stringify(chaptersForNav),
                      offline: 'true',
                      offlineSource: source!,
                      offlineSourceId: sourceId!,
                    },
                  });
                }}
                onLongPress={() => confirmDeleteChapter(ch)}
                delayLongPress={500}
              >
                <View style={styles.chapterInfo}>
                  <ThemedText style={styles.chapterNumber}>
                    Capítulo {ch.chapterNumber}
                  </ThemedText>
                  {ch.title && (
                    <ThemedText style={styles.chapterTitle} numberOfLines={1}>
                      {ch.title}
                    </ThemedText>
                  )}
                  <ThemedText style={styles.chapterMeta}>
                    {ch.totalPages} páginas · {formatDate(ch.downloadedAt)}
                  </ThemedText>
                </View>

                {isComplete ? (
                  <IconSymbol name="checkmark.circle.fill" size={18} color="#10B981" />
                ) : (
                  <View style={styles.progressWrap}>
                    <ThemedText style={styles.progressText}>
                      {ch.downloadedPages}/{ch.totalPages}
                    </ThemedText>
                  </View>
                )}

                <IconSymbol name="chevron.right" size={14} color={Colors.dark.textMuted} />
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  centerBox: { justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface + 'CC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 24,
    color: Colors.dark.text,
    fontWeight: '300',
    lineHeight: 28,
  },
  topTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.dark.text,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },

  chapterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.dark.text,
  },
  chapterCount: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  sortBtn: {
    backgroundColor: Colors.dark.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sortBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.dark.primaryLight,
  },

  // Queue
  queueSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  queueTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F59E0B',
    marginBottom: 8,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Colors.dark.surface,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  queueInfo: { flex: 1 },
  queueProgress: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },

  // Chapters
  chaptersSection: {
    paddingHorizontal: 20,
  },
  chapterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  chapterInfo: { flex: 1 },
  chapterNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.dark.text,
  },
  chapterTitle: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  chapterMeta: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  progressWrap: {
    backgroundColor: Colors.dark.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cancelBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.surfaceLight,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  progressText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.dark.textMuted,
  },
});
