import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface SettingsViewProps {
  topInset?: number;
}

const MENU_ITEMS = [
  { icon: 'arrow.down.circle' as const, label: 'Fila de downloads', route: null },
  { icon: 'folder.fill' as const, label: 'Categorias', route: '/categories' },
  { icon: 'globe' as const, label: 'Atualizações automáticas', route: '/update-settings' },
  { icon: 'square.and.arrow.down' as const, label: 'Dados e armazenamento', route: null },
];

export function SettingsView({ topInset = 0 }: SettingsViewProps) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <ThemedText style={styles.title}>Mais</ThemedText>
      </View>

      <View style={styles.list}>
        {MENU_ITEMS.map((item) => (
          <Pressable
            key={item.label}
            style={styles.menuItem}
            onPress={() => {
              if (item.route) router.push(item.route as any);
            }}
            disabled={!item.route}
          >
            <IconSymbol
              name={item.icon}
              size={22}
              color={!item.route ? Colors.dark.textMuted : Colors.dark.primaryLight}
            />
            <ThemedText style={[styles.menuLabel, !item.route && styles.menuLabelDisabled]}>
              {item.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <View style={styles.footer}>
        <ThemedText style={styles.appName}>MangaVerse</ThemedText>
        <ThemedText style={styles.version}>v1.0.0</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', color: Colors.dark.text },

  list: { paddingHorizontal: 16 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  menuLabel: { fontSize: 15, fontWeight: '500', color: Colors.dark.text },
  menuLabelDisabled: { color: Colors.dark.textMuted },

  footer: { position: 'absolute', bottom: 100, left: 0, right: 0, alignItems: 'center', gap: 2 },
  appName: { fontSize: 13, fontWeight: '700', color: Colors.dark.textMuted },
  version: { fontSize: 11, color: Colors.dark.textMuted },
});
