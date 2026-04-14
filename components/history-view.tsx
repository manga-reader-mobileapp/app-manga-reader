import { Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  getHistory,
  removeFromHistory,
  clearHistory,
  type HistoryEntry,
} from '@/services/history';

interface HistoryViewProps {
  topInset?: number;
}

interface HistorySection {
  title: string;
  data: HistoryEntry[];
}

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const entryDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (entryDate.getTime() === today.getTime()) return 'Hoje';
  if (entryDate.getTime() === yesterday.getTime()) return 'Ontem';

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function HistoryView({ topInset = 0 }: HistoryViewProps) {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      getHistory().then(setHistory);
    }, []),
  );

  function confirmClearAll() {
    Alert.alert('Limpar histórico', 'Remover todo o histórico de leitura?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Limpar',
        style: 'destructive',
        onPress: async () => {
          await clearHistory();
          setHistory([]);
        },
      },
    ]);
  }

  async function handleRemove(entry: HistoryEntry) {
    await removeFromHistory(entry.source, entry.mangaId);
    setHistory((prev) => prev.filter((h) => !(h.source === entry.source && h.mangaId === entry.mangaId)));
  }

  // Group by date
  const sections: HistorySection[] = [];
  const grouped: Record<string, HistoryEntry[]> = {};
  for (const entry of history) {
    const label = getDateLabel(entry.lastReadAt);
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(entry);
  }
  for (const [title, data] of Object.entries(grouped)) {
    sections.push({ title, data });
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <ThemedText style={styles.title}>Histórico</ThemedText>
        {history.length > 0 && (
          <Pressable style={styles.clearBtn} onPress={confirmClearAll}>
            <IconSymbol name="trash.fill" size={18} color={Colors.dark.textMuted} />
          </Pressable>
        )}
      </View>

      {history.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol name="book.fill" size={48} color={Colors.dark.textMuted} />
          <ThemedText style={styles.emptyTitle}>Sem histórico</ThemedText>
          <ThemedText style={styles.emptyText}>Suas leituras aparecerão aqui</ThemedText>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.source}:${item.mangaId}`}
          renderSectionHeader={({ section }) => (
            <ThemedText style={styles.sectionTitle}>{section.title}</ThemedText>
          )}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/manga/${item.slug}`)}
            >
              <View style={styles.coverWrap}>
                {item.coverUrl ? (
                  <Image source={{ uri: item.coverUrl }} style={styles.cover} resizeMode="cover" />
                ) : (
                  <View style={[styles.cover, styles.coverPlaceholder]}>
                    <IconSymbol name="book.fill" size={16} color={Colors.dark.textMuted} />
                  </View>
                )}
              </View>

              <View style={styles.info}>
                <ThemedText style={styles.mangaName} numberOfLines={1}>{item.title}</ThemedText>
                <ThemedText style={styles.chapterInfo}>
                  Cap. {item.lastChapterNumber} — {formatTime(item.lastReadAt)}
                </ThemedText>
              </View>

              <Pressable style={styles.removeBtn} onPress={() => handleRemove(item)} hitSlop={10}>
                <IconSymbol name="trash.fill" size={16} color={Colors.dark.textMuted} />
              </Pressable>
            </Pressable>
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 28, fontWeight: '800', color: Colors.dark.text },
  clearBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.dark.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.dark.border },

  list: { paddingHorizontal: 16, paddingBottom: 100 },

  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.dark.textMuted, paddingTop: 16, paddingBottom: 8 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  coverWrap: { borderRadius: 8, overflow: 'hidden' },
  cover: { width: 44, height: 62, borderRadius: 8 },
  coverPlaceholder: { backgroundColor: Colors.dark.surfaceLight, justifyContent: 'center', alignItems: 'center' },

  info: { flex: 1 },
  mangaName: { fontSize: 15, fontWeight: '700', color: Colors.dark.text },
  chapterInfo: { fontSize: 13, color: Colors.dark.textSecondary, marginTop: 2 },

  removeBtn: { padding: 8 },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingBottom: 100 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.dark.text },
  emptyText: { fontSize: 14, color: Colors.dark.textMuted },
});
