# MangaVerse

Leitor de mangás agregador para Android. Reúne múltiplas fontes de mangás/manhwas em um único app com leitura offline, biblioteca organizada e notificações de novos capítulos.

Inspirado no Tachiyomi, construído do zero com React Native + Expo.

---

## Funcionalidades

### Leitura
- Leitor com modo **scroll** (webtoon) e modo **página**
- Leitura infinita entre capítulos (configurável)
- Slider de progresso com navegação entre capítulos
- Cache de dimensões de imagem pra evitar saltos no scroll
- Placeholder com retry/re-download pra páginas que falharam

### Biblioteca
- Favoritar mangás com capa salva localmente
- Categorias personalizáveis (criar, renomear, reordenar, deletar)
- Swipe entre categorias
- Grid configurável (2x, 4x, 6x colunas)
- Seleção em massa com ações: mover categoria, desfavoritar
- Badge de capítulos não lidos

### Downloads
- Fila de download persistente (sobrevive ao fechar o app)
- Resume automático de downloads interrompidos
- 3 tentativas por página com timeout de 15s
- Leitor offline pra capítulos baixados
- Re-download de página individual direto no leitor

### Progresso
- Leitura individual por capítulo (cada cap tem seu próprio estado)
- Marcar como lido / não lido em massa
- "Marcar todos abaixo como lido"
- Capítulos lidos ficam esmaecidos na listagem
- Histórico de leitura agrupado por dia

### Página do mangá
- Funciona offline com dados em cache
- Menu com "Baixar tudo" e "Marcar tudo como lido"
- Seleção em massa de capítulos
- Indicador de download/fila por capítulo

### Atualizações
- Verificação automática de novos capítulos em background
- Notificação push quando tem capítulo novo
- Configurável por categoria e intervalo (6h, 12h, diário, semanal)
- Auto-update do app via GitHub Releases

### Fontes
| Fonte | Idioma | Status |
|-------|--------|--------|
| NEXUS Mangás | PT-BR | Ativo |
| MangaDex | Multi | Planejado |
| MangaLivre | PT-BR | Planejado |

---

## Stack

- **React Native** + **Expo** (SDK 53)
- **Expo Router** (file-based routing)
- **expo-image** / **expo-file-system** / **expo-notifications**
- **expo-background-fetch** + **expo-task-manager**
- **react-native-pager-view**
- **react-native-reanimated**
- **AsyncStorage**

---

## Rodando

### Dev (Expo Go)
```bash
npm install
npx expo start
```

### Build APK
```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

APK em `android/app/build/outputs/apk/release/app-release.apk`

**Requisitos:** Node 18+, Android SDK (API 34+), JDK 17

---

## Estrutura

```
app/
  index.tsx                # Home (biblioteca, histórico, downloads, navegar, config)
  manga/[slug].tsx         # Detalhes do mangá
  reader/[chapterId].tsx   # Leitor
  categories.tsx           # Gerenciamento de categorias
  update-settings.tsx      # Config de atualizações automáticas
  downloads/[mangaId].tsx  # Capítulos baixados
  (tabs)/                  # Navegação dentro de uma scan

services/
  nexus/                   # Fonte NEXUS (API + crypto)
  library.ts               # Biblioteca local
  downloads.ts             # Fila de downloads
  categories.ts            # Categorias
  history.ts               # Histórico de leitura
  updater.ts               # Background fetch + notificações
  app-update.ts            # Auto-update via GitHub
```

---

## Auto-update

O app checa por versões novas ao abrir. O controle é pelo `update.json` na raiz:

```json
{
  "version": "1.0.1",
  "url": "https://github.com/.../releases/download/v1.0.1/app-release.apk",
  "changelog": "Descrição"
}
```

Pra lançar versão nova: atualizar `app.json` + buildar + criar Release no GitHub + atualizar `update.json`.

---

## Adicionando fontes

Cada fonte implementa:
- `getPopularMangas()` / `getRecentMangas()` / `searchMangas()`
- `getMangaBySlug(slug)`
- `getChapterPages(chapterId)`

---

## Roadmap

- [ ] MangaDex
- [ ] MangaLivre
- [ ] Restaurar posição de scroll ao retomar leitura
- [ ] Estatísticas de leitura
- [ ] Backup/restore de dados
- [ ] Tema claro
- [ ] Busca global entre fontes

---

## Licença

MIT
