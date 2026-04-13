import AsyncStorage from '@react-native-async-storage/async-storage';

const CATEGORIES_KEY = 'mangaVerse_categories';

/** Get all user categories (ordered). "Padrão" is implicit, not stored. */
export async function getCategories(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(CATEGORIES_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveCategories(categories: string[]): Promise<void> {
  await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

export async function addCategory(name: string): Promise<string[]> {
  const cats = await getCategories();
  const trimmed = name.trim();
  if (!trimmed || cats.includes(trimmed)) return cats;
  cats.push(trimmed);
  await saveCategories(cats);
  return cats;
}

export async function removeCategory(name: string): Promise<string[]> {
  let cats = await getCategories();
  cats = cats.filter((c) => c !== name);
  await saveCategories(cats);
  return cats;
}

export async function renameCategory(oldName: string, newName: string): Promise<string[]> {
  const cats = await getCategories();
  const trimmed = newName.trim();
  if (!trimmed) return cats;
  const idx = cats.indexOf(oldName);
  if (idx !== -1) cats[idx] = trimmed;
  await saveCategories(cats);
  return cats;
}

export async function reorderCategories(categories: string[]): Promise<void> {
  await saveCategories(categories);
}
