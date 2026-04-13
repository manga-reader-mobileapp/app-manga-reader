import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  getCategories,
  addCategory,
  removeCategory,
  renameCategory,
  saveCategories,
} from '@/services/categories';
import { clearMangaCategory, renameMangaCategory } from '@/services/library';

export default function CategoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [categories, setCategories_] = useState<string[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  useFocusEffect(
    useCallback(() => {
      getCategories().then(setCategories_);
    }, []),
  );

  async function handleAdd() {
    Alert.prompt
    // Use a simple approach: prompt via Alert on Android isn't great, use inline
    const name = `Categoria ${categories.length + 1}`;
    const updated = await addCategory(name);
    setCategories_(updated);
    // Auto-start editing the new one
    setEditingIdx(updated.length - 1);
    setEditName(name);
  }

  async function handleDelete(name: string) {
    Alert.alert(
      'Deletar',
      `Remover "${name}"? Mangás nela voltam para "Padrão".`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deletar',
          style: 'destructive',
          onPress: async () => {
            await clearMangaCategory(name);
            const updated = await removeCategory(name);
            setCategories_(updated);
          },
        },
      ],
    );
  }

  async function handleRename(oldName: string) {
    const trimmed = editName.trim();
    setEditingIdx(null);
    if (!trimmed || trimmed === oldName) return;
    if (categories.includes(trimmed)) {
      Alert.alert('Erro', 'Categoria já existe');
      return;
    }
    await renameMangaCategory(oldName, trimmed);
    const updated = await renameCategory(oldName, trimmed);
    setCategories_(updated);
  }

  async function moveUp(idx: number) {
    if (idx <= 0) return;
    const updated = [...categories];
    [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
    setCategories_(updated);
    await saveCategories(updated);
  }

  async function moveDown(idx: number) {
    if (idx >= categories.length - 1) return;
    const updated = [...categories];
    [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
    setCategories_(updated);
    await saveCategories(updated);
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <ThemedText style={styles.backBtnText}>{'‹'}</ThemedText>
        </Pressable>
        <ThemedText style={styles.headerTitle}>Editar categorias</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      {/* Category list */}
      <View style={styles.list}>
        {categories.map((cat, idx) => (
          <View key={cat} style={styles.catRow}>
            {/* Drag handle / reorder */}
            <View style={styles.reorderBtns}>
              <Pressable onPress={() => moveUp(idx)} disabled={idx === 0} hitSlop={6}>
                <ThemedText style={[styles.arrowText, idx === 0 && { opacity: 0.2 }]}>▲</ThemedText>
              </Pressable>
              <Pressable onPress={() => moveDown(idx)} disabled={idx === categories.length - 1} hitSlop={6}>
                <ThemedText style={[styles.arrowText, idx === categories.length - 1 && { opacity: 0.2 }]}>▼</ThemedText>
              </Pressable>
            </View>

            {/* Name */}
            {editingIdx === idx ? (
              <TextInput
                style={styles.editInput}
                value={editName}
                onChangeText={setEditName}
                autoFocus
                selectTextOnFocus
                onSubmitEditing={() => handleRename(cat)}
                onBlur={() => handleRename(cat)}
                returnKeyType="done"
              />
            ) : (
              <ThemedText style={styles.catName}>{cat}</ThemedText>
            )}

            {/* Actions */}
            <Pressable
              style={styles.iconBtn}
              onPress={() => {
                setEditingIdx(idx);
                setEditName(cat);
              }}
              hitSlop={8}
            >
              <IconSymbol name="square.and.arrow.down" size={18} color={Colors.dark.textSecondary} />
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={() => handleDelete(cat)} hitSlop={8}>
              <IconSymbol name="trash.fill" size={18} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>
        ))}

        {categories.length === 0 && (
          <View style={styles.emptyState}>
            <ThemedText style={styles.emptyText}>Nenhuma categoria criada</ThemedText>
          </View>
        )}
      </View>

      {/* FAB - Add */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={handleAdd}
      >
        <ThemedText style={styles.fabPlus}>+</ThemedText>
        <ThemedText style={styles.fabText}>Adicionar</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },

  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, gap: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.dark.surface + 'CC',
    justifyContent: 'center', alignItems: 'center',
  },
  backBtnText: { fontSize: 24, color: Colors.dark.text, fontWeight: '300', lineHeight: 28 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: Colors.dark.text },

  list: { paddingHorizontal: 16, gap: 8 },
  catRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.dark.surface, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  reorderBtns: { gap: 2, alignItems: 'center' },
  arrowText: { fontSize: 10, color: Colors.dark.textMuted },
  catName: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.dark.text },
  editInput: {
    flex: 1, fontSize: 15, fontWeight: '600', color: Colors.dark.text,
    backgroundColor: Colors.dark.surfaceLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.dark.primary,
  },
  iconBtn: { padding: 6 },

  emptyState: { paddingVertical: 60, alignItems: 'center' },
  emptyText: { fontSize: 14, color: Colors.dark.textMuted },

  fab: {
    position: 'absolute', right: 24, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.dark.primary, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16,
    shadowColor: Colors.dark.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  fabPlus: { fontSize: 20, fontWeight: '300', color: '#fff', lineHeight: 22 },
  fabText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
