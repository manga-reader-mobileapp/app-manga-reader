import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DownloadsView } from '@/components/downloads-view';
import { HistoryView } from '@/components/history-view';
import { LibraryView } from '@/components/library-view';
import { SettingsView } from '@/components/settings-view';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { resumeQueue } from '@/services/downloads';
import { setupNotifications } from '@/services/updater';
import { checkAppUpdate, downloadUpdate, dismissUpdate, getCurrentVersion, type UpdateInfo } from '@/services/app-update';

type MainTab = 'library' | 'history' | 'downloads' | 'scans' | 'settings';

interface MangaSource {
  id: string;
  name: string;
  description: string;
  logo: any;
  available: boolean;
}

const SOURCES: MangaSource[] = [
  {
    id: 'nexus',
    name: 'NEXUS Mangás',
    description: 'Mangás traduzidos em PT-BR',
    logo: require('@/assets/logos/nexus.png'),
    available: true,
  },
  {
    id: 'mangadex',
    name: 'MangaDex',
    description: 'Em breve',
    logo: null,
    available: false,
  },
  {
    id: 'mangalivre',
    name: 'MangaLivre',
    description: 'Em breve',
    logo: null,
    available: false,
  },
];

export default function MainScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<MainTab>('library');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  useEffect(() => {
    resumeQueue();
    setupNotifications();
    // Check for app updates
    checkAppUpdate().then((info) => {
      if (info) {
        setUpdateInfo(info);
        setShowUpdateModal(true);
      }
    });
  }, []);

  function openScan(sourceId: string) {
    router.push('/(tabs)');
  }

  const tabs: { key: MainTab; icon: any; label: string }[] = [
    { key: 'library', icon: 'bookmark.fill', label: 'Biblioteca' },
    { key: 'history', icon: 'clock.fill', label: 'Histórico' },
    { key: 'downloads', icon: 'arrow.down.circle.fill', label: 'Downloads' },
    { key: 'scans', icon: 'globe', label: 'Navegar' },
    { key: 'settings', icon: 'gearshape.fill', label: 'Mais' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {activeTab === 'library' && <LibraryView topInset={0} showHeader={true} />}
      {activeTab === 'history' && <HistoryView topInset={0} />}
      {activeTab === 'downloads' && <DownloadsView topInset={0} showHeader={true} />}
      {activeTab === 'settings' && <SettingsView topInset={0} onUpdateFound={(info) => { setUpdateInfo(info); setShowUpdateModal(true); }} />}

      {activeTab === 'scans' && (
        <View style={styles.scansContent}>
          <View style={styles.scansHeader}>
            <ThemedText style={styles.scansTitle}>Navegar</ThemedText>
            <ThemedText style={styles.scansSubtitle}>Escolha uma fonte</ThemedText>
          </View>
          <View style={styles.sourceList}>
            {SOURCES.map((source) => (
              <Pressable
                key={source.id}
                style={[styles.sourceCard, !source.available && styles.sourceCardDisabled]}
                onPress={() => { if (source.available) openScan(source.id); }}
                disabled={!source.available}
              >
                <View style={styles.sourceLogoContainer}>
                  {source.logo ? (
                    <Image source={source.logo} style={styles.sourceLogo} contentFit="contain" />
                  ) : (
                    <IconSymbol name="globe" size={28} color={Colors.dark.textMuted} />
                  )}
                </View>
                <View style={styles.sourceInfo}>
                  <ThemedText style={[styles.sourceName, !source.available && styles.sourceNameDisabled]}>
                    {source.name}
                  </ThemedText>
                  <ThemedText style={styles.sourceDescription}>{source.description}</ThemedText>
                </View>
                {source.available ? (
                  <View style={styles.openBadge}>
                    <ThemedText style={styles.openBadgeText}>Abrir</ThemedText>
                    <IconSymbol name="chevron.right" size={12} color={Colors.dark.primary} />
                  </View>
                ) : (
                  <IconSymbol name="lock.fill" size={14} color={Colors.dark.textMuted} />
                )}
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* ========== BOTTOM TAB BAR ========== */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={styles.bottomTab}
            onPress={() => setActiveTab(tab.key)}
          >
            <IconSymbol
              name={tab.icon}
              size={22}
              color={activeTab === tab.key ? Colors.dark.primary : Colors.dark.textMuted}
            />
            <ThemedText style={[styles.bottomTabText, activeTab === tab.key && styles.bottomTabTextActive]}>
              {tab.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* ========== UPDATE MODAL ========== */}
      <Modal
        visible={showUpdateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUpdateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ThemedText style={styles.modalTitle}>Nova versão disponível</ThemedText>
            <ThemedText style={styles.modalVersion}>v{updateInfo?.version}</ThemedText>
            {updateInfo?.changelog ? (
              <ThemedText style={styles.modalChangelog}>{updateInfo.changelog}</ThemedText>
            ) : null}
            <ThemedText style={styles.modalCurrent}>Versão atual: v{getCurrentVersion()}</ThemedText>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtnSecondary} onPress={() => { if (updateInfo) dismissUpdate(updateInfo.version); setShowUpdateModal(false); }}>
                <ThemedText style={styles.modalBtnSecondaryText}>Depois</ThemedText>
              </Pressable>
              <Pressable
                style={styles.modalBtnPrimary}
                onPress={() => {
                  if (updateInfo?.url) downloadUpdate(updateInfo.url);
                  setShowUpdateModal(false);
                }}
              >
                <IconSymbol name="arrow.down.circle.fill" size={18} color="#fff" />
                <ThemedText style={styles.modalBtnPrimaryText}>Atualizar</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },

  scansContent: { flex: 1, paddingHorizontal: 20 },
  scansHeader: { paddingTop: 12, paddingBottom: 20 },
  scansTitle: { fontSize: 28, fontWeight: '800', color: Colors.dark.text },
  scansSubtitle: { fontSize: 14, color: Colors.dark.textMuted, marginTop: 2 },

  sourceList: { gap: 12 },
  sourceCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.dark.surface,
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.dark.border, gap: 14,
  },
  sourceCardDisabled: { opacity: 0.5 },
  sourceLogoContainer: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.dark.surfaceLight,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  sourceLogo: { width: 48, height: 48, borderRadius: 12 },
  sourceInfo: { flex: 1 },
  sourceName: { fontSize: 16, fontWeight: '700', color: Colors.dark.text },
  sourceNameDisabled: { color: Colors.dark.textSecondary },
  sourceDescription: { fontSize: 13, color: Colors.dark.textSecondary, marginTop: 2 },
  openBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.dark.primary + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  openBadgeText: { fontSize: 12, fontWeight: '600', color: Colors.dark.primary },

  bottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
  },
  bottomTab: { alignItems: 'center', gap: 3, paddingVertical: 4, flex: 1 },
  bottomTabText: { fontSize: 10, fontWeight: '600', color: Colors.dark.textMuted },
  bottomTabTextActive: { color: Colors.dark.primary },

  // Update modal
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 32 },
  modalBox: { backgroundColor: Colors.dark.surface, borderRadius: 20, padding: 28, width: '100%', borderWidth: 1, borderColor: Colors.dark.border },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.dark.text, textAlign: 'center' },
  modalVersion: { fontSize: 28, fontWeight: '800', color: Colors.dark.primary, textAlign: 'center', marginTop: 8 },
  modalChangelog: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: 'center', marginTop: 12, lineHeight: 20 },
  modalCurrent: { fontSize: 12, color: Colors.dark.textMuted, textAlign: 'center', marginTop: 8 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  modalBtnSecondary: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.dark.surfaceLight, alignItems: 'center', borderWidth: 1, borderColor: Colors.dark.border },
  modalBtnSecondaryText: { fontSize: 14, fontWeight: '600', color: Colors.dark.textSecondary },
  modalBtnPrimary: { flex: 1, flexDirection: 'row', paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.dark.primary, alignItems: 'center', justifyContent: 'center', gap: 8 },
  modalBtnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
