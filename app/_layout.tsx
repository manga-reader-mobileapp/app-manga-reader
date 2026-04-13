import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { Colors } from '@/constants/theme';

const YomuDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.dark.background,
    card: Colors.dark.surface,
    text: Colors.dark.text,
    border: Colors.dark.border,
    primary: Colors.dark.primary,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={YomuDarkTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="manga/[slug]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="categories"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="update-settings"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="downloads/[mangaId]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="reader/[chapterId]"
          options={{ animation: 'slide_from_bottom' }}
        />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
