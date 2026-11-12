import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SendMeta } from '../../../cast/SendContext';
import { Poster } from '../../../components/Poster';
import { SourcesList } from '../../../components/SourcesList';
import { getMeta, groupEpisodes, hasAired, yearLabel, type Episode, type MetaDetail } from '../../../lib/cinemeta';
import { isAbortError } from '../../../lib/http';
import type { ContentType } from '../../../lib/stremio';
import { colors, radius, space, type } from '../../../theme';

export default function TitleScreen() {
  const params = useLocalSearchParams<{ type: string; id: string; name?: string }>();
  const contentType: ContentType = params.type === 'series' ? 'series' : 'movie';
  const key = `${contentType}/${params.id}`;
  // Tagged with the title it belongs to, so a stale result is never shown.
  const [loadedMeta, setLoadedMeta] = useState<{ key: string; meta?: MetaDetail; error?: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getMeta(contentType, params.id, controller.signal)
      .then((meta) => setLoadedMeta({ key, meta }))
      .catch(
        (err) => !isAbortError(err) && setLoadedMeta({ key, error: err instanceof Error ? err.message : String(err) }),
      );
    return () => controller.abort();
  }, [key, contentType, params.id]);

  const current = loadedMeta?.key === key ? loadedMeta : null;
  const meta = current?.meta ?? null;
  const title = meta?.name ?? params.name ?? '';

  if (current?.error) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        <Text style={type.small}>Couldn’t load details: {current.error}</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      {contentType === 'movie' ? (
        <MovieBody id={params.id} meta={meta} fallbackName={title} />
      ) : meta ? (
        <SeriesBody meta={meta} />
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      )}
    </>
  );
}

function Hero({ meta }: { meta: MetaDetail }) {
  const [expanded, setExpanded] = useState(false);
  const facts = [yearLabel(meta), meta.runtime, meta.imdbRating && `★ ${meta.imdbRating}`].filter(Boolean);
  return (
    <View>
      {meta.background ? (
        <View style={styles.backdrop}>
          <Image source={{ uri: meta.background }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.backdropShade} />
        </View>
      ) : null}
      <View style={[styles.hero, meta.background ? { marginTop: -70 } : null]}>
        <Poster uri={meta.poster} width={100} />
        <View style={{ flex: 1, marginLeft: space.lg, justifyContent: 'flex-end' }}>
          <Text style={type.title} numberOfLines={3}>
            {meta.name}
          </Text>
          <Text style={[type.small, { marginTop: space.xs }]}>{facts.join('  ·  ')}</Text>
          {!!meta.genres?.length && (
            <Text style={[type.tiny, { marginTop: 2 }]} numberOfLines={1}>
              {meta.genres.slice(0, 4).join(', ')}
            </Text>
          )}
        </View>
      </View>
      {!!meta.description && (
        <Pressable onPress={() => setExpanded((e) => !e)} style={{ paddingHorizontal: space.lg }}>
          <Text style={[type.small, { lineHeight: 19, color: colors.text }]} numberOfLines={expanded ? undefined : 3}>
            {meta.description}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function MovieBody({ id, meta, fallbackName }: { id: string; meta: MetaDetail | null; fallbackName: string }) {
  const sendMeta = useMemo<SendMeta>(
    () => ({
      type: 'movie',
      metaId: id,
      name: meta?.name ?? fallbackName,
      poster: meta?.poster,
      year: meta ? yearLabel(meta) : undefined,
    }),
    [id, meta, fallbackName],
  );
  // Sources start loading right away; details fill in when they arrive.
  return (
    <SourcesList
      meta={sendMeta}
      videoId={id}
      header={meta ? <Hero meta={meta} /> : <ActivityIndicator style={{ margin: space.xl }} color={colors.textMuted} />}
    />
  );
}

function SeriesBody({ meta }: { meta: MetaDetail }) {
  const seasons = useMemo(() => groupEpisodes(meta.id, meta.videos), [meta]);
  // Default to the latest season that has aired episodes (specials excluded).
  const defaultSeason = useMemo(() => {
    const regular = seasons.filter((s) => s.season !== 0 && s.episodes.some((e) => hasAired(e)));
    return (regular[regular.length - 1] ?? seasons[0])?.season ?? null;
  }, [seasons]);
  const [picked, setSeason] = useState<number | null>(null);
  const season = picked ?? defaultSeason;

  const episodes = seasons.find((s) => s.season === season)?.episodes ?? [];

  return (
    <FlatList
      data={episodes}
      keyExtractor={(e) => e.id}
      ListHeaderComponent={
        <>
          <Hero meta={meta} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasons}>
            {seasons.map((s) => {
              const active = s.season === season;
              return (
                <Pressable
                  key={s.season}
                  onPress={() => setSeason(s.season)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {s.season === 0 ? 'Specials' : `Season ${s.season}`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      }
      renderItem={({ item }) => <EpisodeRow meta={meta} ep={item} />}
      ListEmptyComponent={<Text style={[type.small, { padding: space.lg }]}>No episodes listed.</Text>}
      contentContainerStyle={{ paddingBottom: space.xl }}
    />
  );
}

function EpisodeRow({ meta, ep }: { meta: MetaDetail; ep: Episode }) {
  const aired = hasAired(ep);
  const date = ep.released ? new Date(ep.released).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
  return (
    <Pressable
      style={({ pressed }) => [styles.episode, pressed && { backgroundColor: colors.surface }]}
      onPress={() =>
        router.push({
          pathname: '/sources/[type]/[id]',
          params: {
            type: 'series',
            id: ep.id,
            metaId: meta.id,
            name: meta.name,
            poster: meta.poster ?? '',
            season: String(ep.season),
            episode: String(ep.episode),
            epTitle: ep.title,
          },
        })
      }
    >
      <Text style={styles.epNumber}>{ep.episode}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, !aired && { color: colors.textMuted }]} numberOfLines={1}>
          {ep.title}
        </Text>
        <Text style={type.tiny}>{aired ? date : `Airs ${date}`}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  backdrop: { height: 190, backgroundColor: colors.surface },
  backdropShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(14,15,19,0.55)' },
  hero: { flexDirection: 'row', padding: space.lg },
  seasons: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm, gap: space.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: 13 },
  chipTextActive: { color: colors.accentText, fontWeight: '600' },
  episode: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.md,
  },
  epNumber: { width: 28, color: colors.textMuted, fontSize: 15, fontVariant: ['tabular-nums'], textAlign: 'right' },
});
