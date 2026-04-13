import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getCategories } from '@/services/categories';
import {
  getUpdaterConfig,
  saveUpdaterConfig,
  checkForUpdates,
  type UpdaterConfig,
} from '@/services/updater';

const INTERVALS: { value: UpdaterConfig['intervalHours']; label: string }[] = [
  { value: 6, label: 'A cada 6 horas' },
  { value: 12, label: 'A cada 12 horas' },
  { value: 24, label: 'Diariamente' },
  { value: 168, label: 'Semanalmente' },
];

export default function UpdateSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [config, setConfig] = useState<UpdaterConfig>({
    enabled: false,
    intervalHours: 12,
    categories: [],
  });
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, []),
  );

  async function loadData() {
    const [cfg, cats] = await Promise.all([
      getUpdaterConfig(),
      getCategories(),
    ]);
    setConfig(cfg);
    setAllCategories(cats);
  }

  async function updateConfig(partial: Partial<UpdaterConfig>) {
    const newConfig = { ...config, ...partial };
    setConfig(newConfig);
    await saveUpdaterConfig(newConfig);
  }

  function toggleCategory(cat: string) {
    const current = config.categories;
    const updated = current.includes(cat)
      ? current.filter((c) => c !== cat)
      : [...current, cat];
    updateConfig({ categories: updated });
  }

  async function handleManualCheck() {
    setChecking(true);
    setLastResult(null);
    try {
      const { updated, errors } = await checkForUpdates();
      setLastResult(
        updated > 0
          ? `${updated} mangá(s) com novos capítulos`
          : 'Nenhum capítulo novo encontrado',
      );
    } catch (err) {
      setLastResult('Erro ao verificar atualizações');
    } finally {
      setChecking(false);
    }
  }

  const allCatsWithDefault = ['Padrão', ...allCategories];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <ThemedText style={styles.backBtnText}>{'‹'}</ThemedText>
        </Pressable>
        <ThemedText style={styles.headerTitle}>Atualizações automáticas</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Enable toggle */}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Ativado</ThemedText>
            <ThemedText style={styles.sub}>Verificar novos capítulos automaticamente</ThemedText>
          </View>
          <Switch
            value={config.enabled}
            onValueChange={(v) => updateConfig({ enabled: v })}
            trackColor={{ false: Colors.dark.surfaceLight, true: Colors.dark.primary + '60' }}
            thumbColor={config.enabled ? Colors.dark.primary : Colors.dark.textMuted}
          />
        </View>

        {/* Interval */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Intervalo</ThemedText>
          {INTERVALS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.optionRow, config.intervalHours === opt.value && styles.optionRowActive]}
              onPress={() => updateConfig({ intervalHours: opt.value })}
            >
              <ThemedText style={[styles.optionText, config.intervalHours === opt.value && styles.optionTextActive]}>
                {opt.label}
              </ThemedText>
              {config.intervalHours === opt.value && (
                <IconSymbol name="checkmark" size={16} color={Colors.dark.primary} />
              )}
            </Pressable>
          ))}
        </View>

        {/* Categories */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Categorias para verificar</ThemedText>
          <ThemedText style={styles.sub}>
            {config.categories.length === 0
              ? 'Todas as categorias (padrão)'
              : `${config.categories.length} selecionada(s)`}
          </ThemedText>

          {allCatsWithDefault.map((cat) => {
            const isSelected = config.categories.includes(cat);
            return (
              <Pressable
                key={cat}
                style={styles.catRow}
                onPress={() => toggleCategory(cat)}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                  {isSelected && <IconSymbol name="checkmark" size={14} color="#fff" />}
                </View>
                <ThemedText style={styles.catName}>{cat}</ThemedText>
              </Pressable>
            );
          })}
        </View>

        {/* Manual check */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Verificação manual</ThemedText>
          <Pressable
            style={[styles.checkBtn, checking && { opacity: 0.6 }]}
            onPress={handleManualCheck}
            disabled={checking}
          >
            {checking ? (
              <ActivityIndicator size={18} color="#fff" />
            ) : (
              <IconSymbol name="globe" size={18} color="#fff" />
            )}
            <ThemedText style={styles.checkBtnText}>
              {checking ? 'Verificando...' : 'Verificar agora'}
            </ThemedText>
          </Pressable>
          {lastResult && (
            <ThemedText style={styles.resultText}>{lastResult}</ThemedText>
          )}
        </View>

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.dark.surface + 'CC', justifyContent: 'center', alignItems: 'center' },
  backBtnText: { fontSize: 24, color: Colors.dark.text, fontWeight: '300', lineHeight: 28 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: Colors.dark.text },

  content: { paddingHorizontal: 16 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.dark.border },

  section: { marginTop: 28 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.dark.text, marginBottom: 4 },
  label: { fontSize: 15, fontWeight: '600', color: Colors.dark.text },
  sub: { fontSize: 12, color: Colors.dark.textMuted, marginTop: 2, marginBottom: 8 },

  optionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, borderRadius: 10, marginTop: 4, backgroundColor: Colors.dark.surface, borderWidth: 1, borderColor: Colors.dark.border },
  optionRowActive: { backgroundColor: Colors.dark.primary + '15', borderColor: Colors.dark.primary },
  optionText: { fontSize: 14, fontWeight: '500', color: Colors.dark.textSecondary },
  optionTextActive: { color: Colors.dark.text, fontWeight: '600' },

  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: Colors.dark.textMuted, justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary },
  catName: { fontSize: 14, color: Colors.dark.text },

  checkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.dark.primary, paddingVertical: 14, borderRadius: 12, marginTop: 12 },
  checkBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  resultText: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: 'center', marginTop: 12 },
});
