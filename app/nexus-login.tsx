import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { nexusLogin, nexusLogout, nexusIsLoggedIn, nexusGetEmail } from '@/services/nexus/api';

export default function NexusLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loggedEmail, setLoggedEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (await nexusIsLoggedIn()) {
        setLoggedEmail(await nexusGetEmail());
      }
    })();
  }, []);

  const [relogging, setRelogging] = useState(false);
  async function handleRelogin() {
    setRelogging(true);
    try {
      // Re-login uses saved credentials (stored on first login)
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const credsRaw = await AsyncStorage.getItem('nexus_credentials');
      if (!credsRaw) {
        Alert.alert('Erro', 'Nenhuma credencial salva. Faça login novamente.');
        await nexusLogout();
        setLoggedEmail(null);
        return;
      }
      const { username, password } = JSON.parse(credsRaw);
      const success = await nexusLogin(username, password);
      if (success) {
        Alert.alert('Sucesso', 'Token revalidado com sucesso');
      } else {
        Alert.alert('Erro', 'Não foi possível revalidar. Faça login novamente.');
      }
    } finally {
      setRelogging(false);
    }
  }

  async function handleLogout() {
    Alert.alert('Sair', 'Deseja sair da conta NEXUS?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await nexusLogout();
          setLoggedEmail(null);
        },
      },
    ]);
  }

  async function handleLogin() {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Erro', 'Preencha email e senha');
      return;
    }
    setLoading(true);
    try {
      const success = await nexusLogin(username.trim(), password);
      if (success) {
        Alert.alert('Sucesso', 'Login realizado com sucesso', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Erro', 'Email ou senha incorretos');
      }
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível fazer login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <ThemedText style={styles.backBtnText}>{'‹'}</ThemedText>
        </Pressable>
        <ThemedText style={styles.headerTitle}>Login NEXUS</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <IconSymbol name={loggedEmail ? 'checkmark.circle.fill' : 'lock.fill'} size={36} color={loggedEmail ? '#10B981' : Colors.dark.primaryLight} />
        </View>

        {loggedEmail ? (
          <>
            <ThemedText style={styles.title}>Conta conectada</ThemedText>
            <ThemedText style={styles.subtitle}>{loggedEmail}</ThemedText>
            <View style={styles.form}>
              <Pressable
                style={[styles.loginBtn, relogging && { opacity: 0.5 }]}
                onPress={handleRelogin}
                disabled={relogging}
              >
                {relogging ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={styles.loginBtnText}>Revalidar token</ThemedText>
                )}
              </Pressable>
              <Pressable style={[styles.loginBtn, { backgroundColor: '#EF4444' }]} onPress={handleLogout}>
                <ThemedText style={styles.loginBtnText}>Sair</ThemedText>
              </Pressable>
              <ThemedText style={styles.hint}>
                O app revalida o token automaticamente em caso de erro 401
              </ThemedText>
            </View>
          </>
        ) : (
          <>
        <ThemedText style={styles.title}>Entre na sua conta NEXUS</ThemedText>
        <ThemedText style={styles.subtitle}>
          A NEXUS agora requer login para acessar os mangás
        </ThemedText>

        <View style={styles.form}>
          <View style={styles.inputWrap}>
            <ThemedText style={styles.label}>Email</ThemedText>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="seu@email.com"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputWrap}>
            <ThemedText style={styles.label}>Senha</ThemedText>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={Colors.dark.textMuted}
              secureTextEntry
            />
          </View>

          <Pressable
            style={[styles.loginBtn, loading && { opacity: 0.5 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <ThemedText style={styles.loginBtnText}>Entrar</ThemedText>
            )}
          </Pressable>

          <ThemedText style={styles.hint}>
            Não tem conta? Crie em nexustoons.com
          </ThemedText>
        </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.dark.surface + 'CC', justifyContent: 'center', alignItems: 'center' },
  backBtnText: { fontSize: 24, color: Colors.dark.text, fontWeight: '300', lineHeight: 28 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: Colors.dark.text },

  content: { flex: 1, paddingHorizontal: 24, paddingTop: 40, alignItems: 'center' },
  iconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.dark.primary + '20', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.dark.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: Colors.dark.textMuted, textAlign: 'center', marginTop: 8, paddingHorizontal: 20 },

  form: { width: '100%', marginTop: 32, gap: 16 },
  inputWrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.dark.textSecondary },
  input: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  loginBtn: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  loginBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  hint: { fontSize: 12, color: Colors.dark.textMuted, textAlign: 'center', marginTop: 12 },
});
