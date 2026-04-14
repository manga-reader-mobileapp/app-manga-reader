import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { getMangaBySlug } from './nexus/api';
import * as MangaLivreApi from './mangalivre/api';
import { getLibrary, syncLibraryCache, type LibraryManga } from './library';
import { getCategories } from './categories';

// ─── Constants ───────────────────────────────────────────────────────────────

const TASK_NAME = 'MANGAVERSE_UPDATE_CHECK';
const CONFIG_KEY = 'mangaVerse_updater_config';

export interface UpdaterConfig {
  enabled: boolean;
  intervalHours: 6 | 12 | 24 | 168; // 6h, 12h, daily, weekly
  categories: string[]; // category names to check (empty = all)
}

const DEFAULT_CONFIG: UpdaterConfig = {
  enabled: false,
  intervalHours: 12,
  categories: [],
};

// ─── Config ──────────────────────────────────────────────────────────────────

export async function getUpdaterConfig(): Promise<UpdaterConfig> {
  const raw = await AsyncStorage.getItem(CONFIG_KEY);
  if (!raw) return DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
}

export async function saveUpdaterConfig(config: UpdaterConfig): Promise<void> {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));

  if (config.enabled) {
    await registerBackgroundTask(config.intervalHours);
  } else {
    await unregisterBackgroundTask();
  }
}

// ─── Notifications setup ─────────────────────────────────────────────────────

export async function setupNotifications(): Promise<void> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    console.warn('[UPDATER] Notification permission not granted');
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// ─── Background task registration ────────────────────────────────────────────

async function registerBackgroundTask(intervalHours: number): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(TASK_NAME);
    }

    await BackgroundFetch.registerTaskAsync(TASK_NAME, {
      minimumInterval: intervalHours * 60 * 60, // seconds
      stopOnTerminate: false,
      startOnBoot: true,
    });

    console.log('[UPDATER] Background task registered, interval:', intervalHours, 'hours');
  } catch (err) {
    console.error('[UPDATER] Failed to register background task:', err);
  }
}

async function unregisterBackgroundTask(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(TASK_NAME);
      console.log('[UPDATER] Background task unregistered');
    }
  } catch (err) {
    console.error('[UPDATER] Failed to unregister:', err);
  }
}

// ─── Core update check ──────────────────────────────────────────────────────

/** Run update check manually or from background task */
export async function checkForUpdates(overrideCategories?: string[]): Promise<{ updated: number; errors: number }> {
  console.log('[UPDATER] Starting update check...');
  const config = await getUpdaterConfig();
  const library = await getLibrary();
  const categoriesToCheck = overrideCategories || config.categories;

  // Filter by selected categories
  let mangasToCheck: LibraryManga[];
  if (categoriesToCheck.length > 0) {
    mangasToCheck = library.filter((m) => {
      const cat = m.userCategory || null;
      if (cat === null) return categoriesToCheck.includes('Padrão');
      return categoriesToCheck.includes(cat);
    });
  } else {
    mangasToCheck = library;
  }

  console.log('[UPDATER] Checking', mangasToCheck.length, 'mangas');

  let updated = 0;
  let errors = 0;

  for (const manga of mangasToCheck) {
    try {
      // Fetch chapters based on source
      let apiChapters: Array<{ id: number; number: string; title: string | null; views: number; createdAt: string }>;
      if (manga.source === 'mangalivre') {
        const mlData = await MangaLivreApi.getMangaDetail(manga.slug);
        apiChapters = mlData.chapters.map((c, i) => ({
          id: c.id || i + 1,
          number: c.number,
          title: c.title,
          views: 0,
          createdAt: c.date || '',
        }));
      } else {
        const data = await getMangaBySlug(manga.slug);
        apiChapters = (data.chapters || []).map((c) => ({
          id: c.id,
          number: c.number,
          title: c.title,
          views: c.views,
          createdAt: c.createdAt,
        }));
      }

      const apiChapterIds = new Set(apiChapters.map((c) => c.id));
      const cachedChapterIds = new Set((manga.cachedChapters || []).map((c) => c.id));
      const newChapters = apiChapters.filter((c) => !cachedChapterIds.has(c.id));

      if (newChapters.length > 0) {
        // Sort to find the latest chapter
        const sorted = [...newChapters].sort(
          (a, b) => parseFloat(b.number) - parseFloat(a.number),
        );
        const latestNew = sorted[0];

        // Update cache
        await syncLibraryCache(manga.source, manga.sourceId, {
          totalChapters: apiChapters.length,
          cachedChapters: apiChapters,
        });

        // Send notification — only mention the latest chapter
        await Notifications.scheduleNotificationAsync({
          content: {
            title: manga.title,
            body: newChapters.length === 1
              ? `Capítulo ${latestNew.number} disponível`
              : `${newChapters.length} novos capítulos — último: Cap. ${latestNew.number}`,
            data: { slug: manga.slug },
          },
          trigger: null, // immediate
        });

        updated++;
        console.log('[UPDATER]', manga.title, ':', newChapters.length, 'new chapters');
      }

      // Small delay between requests to not overload the API
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.warn('[UPDATER] Error checking', manga.title, ':', err);
      errors++;
    }
  }

  console.log('[UPDATER] Done. Updated:', updated, 'Errors:', errors);
  return { updated, errors };
}

// ─── Register the background task handler ────────────────────────────────────

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const config = await getUpdaterConfig();
    if (!config.enabled) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const { updated } = await checkForUpdates();
    return updated > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (err) {
    console.error('[UPDATER] Background task error:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});
