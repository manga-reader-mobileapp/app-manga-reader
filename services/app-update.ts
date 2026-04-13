import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';

const UPDATE_URL = 'https://raw.githubusercontent.com/manga-reader-mobileapp/app-manga-reader/main/update.json';

export interface UpdateInfo {
  version: string;
  url: string;
  changelog: string;
}

/** Get current app version from app.json */
export function getCurrentVersion(): string {
  return Constants.expoConfig?.version || '1.0.0';
}

/** Check if a new version is available */
export async function checkAppUpdate(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(UPDATE_URL, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return null;

    const data: UpdateInfo = await res.json();
    const current = getCurrentVersion();

    if (isNewerVersion(data.version, current)) {
      return data;
    }
    return null;
  } catch (err) {
    console.warn('[APP_UPDATE] Check failed:', err);
    return null;
  }
}

/** Open the APK download URL in the browser */
export function downloadUpdate(url: string): void {
  Linking.openURL(url);
}

/** Compare semver: is `remote` newer than `local`? */
function isNewerVersion(remote: string, local: string): boolean {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}
