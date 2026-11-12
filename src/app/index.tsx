import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

import { HomeHeaderButtons } from '../components/HeaderButtons';
import { Poster } from '../components/Poster';
import { searchCatalog, yearLabel, type MetaPreview } from '../lib/cinemeta';
import { isAbortError } from '../lib/http';
import { providesStreams } from '../lib/stremio';
import { useAddons } from '../state/AddonsContext';
import { useRecents, type RecentItem } from '../state/RecentsContext';
import { colors, radius, space, type } from '../theme';

const DEBOUNCE_MS = 350;

interface SearchOutcome {
  q: string;
  results?: { movies: MetaPreview[]; series: MetaPreview[] };
  error?: string;
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  // Last finished search. While a new one runs, the previous results stay up.
  const [search, setSearch] = useState<SearchOutcome | null>(null);
  const { addons, loaded } = useAddons();
  const { recents, clear } = useRecents();
  const needsAddon = loaded && !addons.some((a) => a.enabled && providesStreams(a.manifest));

  const q = query.trim();
  const active = q.length >= 2;
  const loading = active && search?.q !== q;
  const results = active ? (search?.results ?? null) : null;
  const error = active ? (search?.error ?? null) : null;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const [movies, series] = await Promise.all([
          searchCatalog('movie', q, controller.signal),
          searchCatalog('series', q, controller.signal),
        ]);
        setSearch({ q, results: { movies, series } });
      } catch (err) {
        if (!isAbortError(err)) setSearch({ q, error: err instanceof Error ? err.message : String(err) });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, active]);

  const sections = useMemo(() => {
    if (!results) return [];
    return [
      { title: 'Movies', data: results.movies.slice(0, 20) },
      { title: 'Shows', data: results.series.slice(0, 20) },
    ].filter((s) => s.data.length > 0);
  }, [results]);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerRight: () => <HomeHeaderButtons /> }} />

      <View style={styles.searchBox}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search movies and shows"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {loading && <ActivityIndicator size="small" color={colors.textMuted} />}
        {!!query && !loading && (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.textFaint} />
          </Pressable>
        )}
      </View>

      {results || error ? (
        <SectionList
          sections={sections}
          keyExtractor={(m) => `${m.type}:${m.id}`}
          keyboardShouldPersistTaps="handled"
          renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
          renderItem={({ item }) => <ResultRow meta={item} />}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <Text style={[type.small, styles.empty]}>{error ? `Search failed: ${error}` : 'Nothing found.'}</Text>
          }
          contentContainerStyle={{ paddingBottom: space.xl }}
        />
      ) : (
        <Home needsAddon={needsAddon} recents={recents} onClear={clear} />
      )}
    </View>
  );
}

function ResultRow({ meta }: { meta: MetaPreview }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
      onPress={() =>
        router.push({ pathname: '/title/[type]/[id]', params: { type: meta.type, id: meta.id, name: meta.name } })
      }
    >
      <Poster uri={meta.poster} width={52} />
      <View style={styles.rowText}>
        <Text style={type.body} numberOfLines={2}>
          {meta.name}
        </Text>
        <Text style={type.small}>
          {[yearLabel(meta), meta.type === 'series' ? 'Show' : 'Movie', meta.imdbRating && `★ ${meta.imdbRating}`]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textFaint} />
    </Pressable>
  );
}

function Home({ needsAddon, recents, onClear }: { needsAddon: boolean; recents: RecentItem[]; onClear: () => void }) {
  return (
    <SectionList
      sections={recents.length ? [{ title: 'Recently sent', data: recents }] : []}
      keyExtractor={(r) => `${r.metaId}:${r.videoId ?? ''}`}
      ListHeaderComponent={
        needsAddon ? (
          <Pressable style={styles.onboard} onPress={() => router.push('/addons')}>
            <MaterialCommunityIcons name="puzzle-outline" size={26} color={colors.accent} />
            <View style={{ flex: 1, marginLeft: space.md }}>
              <Text style={type.heading}>Add a source addon</Text>
              <Text style={[type.small, { marginTop: 2 }]}>
                Search works now, but finding streams needs a Stremio addon, such as TorBox’s or Torrentio with your
                debrid service. Tap to add one.
              </Text>
            </View>
          </Pressable>
        ) : undefined
      }
      renderSectionHeader={({ section }) => (
        <View style={styles.recentHeader}>
          <Text style={[styles.sectionTitle, { flex: 1 }]}>{section.title}</Text>
          <Pressable onPress={onClear} hitSlop={8}>
            <Text style={[type.small, { paddingHorizontal: space.lg }]}>Clear</Text>
          </Pressable>
        </View>
      )}
      renderItem={({ item }) => <RecentRow item={item} />}
      ListEmptyComponent={
        !needsAddon ? (
          <View style={styles.hint}>
            <MaterialCommunityIcons name="cast" size={40} color={colors.textFaint} />
            <Text style={[type.small, { textAlign: 'center', marginTop: space.md }]}>
              Search for something, pick a source, and it plays on your TV.
            </Text>
          </View>
        ) : undefined
      }
      stickySectionHeadersEnabled={false}
    />
  );
}

function RecentRow({ item }: { item: RecentItem }) {
  const open = () => {
    if (item.type === 'series' && item.videoId) {
      router.push({
        pathname: '/sources/[type]/[id]',
        params: { type: 'series', id: item.videoId, metaId: item.metaId, name: item.name, poster: item.poster ?? '' },
      });
    } else {
      router.push({ pathname: '/title/[type]/[id]', params: { type: item.type, id: item.metaId, name: item.name } });
    }
  };
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]} onPress={open}>
      <Poster uri={item.poster} width={40} />
      <View style={styles.rowText}>
        <Text style={type.body} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={type.small} numberOfLines={1}>
          {[item.episodeLabel, item.deviceName && `on ${item.deviceName}`, timeAgo(item.sentAt)].filter(Boolean).join('  ·  ')}
        </Text>
      </View>
    </Pressable>
  );
}

function timeAgo(t: number): string {
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 12 },
  sectionTitle: {
    ...type.small,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  recentHeader: { flexDirection: 'row', alignItems: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm },
  rowText: { flex: 1, marginHorizontal: space.md, gap: 2 },
  empty: { textAlign: 'center', padding: space.xl },
  onboard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    margin: space.lg,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  hint: { alignItems: 'center', paddingHorizontal: space.xl * 2, paddingTop: space.xl * 3 },
});
