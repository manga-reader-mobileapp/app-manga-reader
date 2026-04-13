import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/themed-text';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChangeText, placeholder = 'Buscar mangá...' }: SearchBarProps) {
  const active = value.length > 0;

  return (
    <View style={[styles.container, active && styles.active]}>
      <IconSymbol
        name="magnifyingglass"
        size={18}
        color={active ? Colors.dark.primary : Colors.dark.textMuted}
      />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={Colors.dark.textMuted}
        value={value}
        onChangeText={onChangeText}
        autoCorrect={false}
      />
      {active && (
        <Pressable onPress={() => onChangeText('')} hitSlop={8}>
          <ThemedText style={styles.clear}>✕</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    marginHorizontal: 20,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  active: {
    borderColor: Colors.dark.primary,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.dark.text,
  },
  clear: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
});
