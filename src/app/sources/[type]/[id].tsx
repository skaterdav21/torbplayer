import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SendMeta } from '../../../cast/SendContext';
import { Poster } from '../../../components/Poster';
import { SourcesList } from '../../../components/SourcesList';
import type { ContentType } from '../../../lib/stremio';
import { space, type } from '../../../theme';

/** Sources for one episode. Ids look like `tt0944947:3:9`. */
export default function EpisodeSourcesScreen() {
  const p = useLocalSearchParams<{
    type: string;
    id: string;
    metaId?: string;
    name?: string;
    poster?: string;
    season?: string;
    episode?: string;
    epTitle?: string;
  }>();

  const contentType: ContentType = p.type === 'movie' ? 'movie' : 'series';
  const [, idSeason, idEpisode] = p.id.split(':');
  const season = Number(p.season ?? idSeason);
  const episode = Number(p.episode ?? idEpisode);
  const epTitle = p.epTitle || `Episode ${episode}`;

  const meta = useMemo<SendMeta>(
    () => ({
      type: contentType,
      metaId: p.metaId ?? p.id.split(':')[0],
      name: p.name ?? '',
      poster: p.poster || undefined,
      episode: Number.isFinite(season) && Number.isFinite(episode) ? { id: p.id, season, episode, title: epTitle } : undefined,
    }),
    [contentType, p.metaId, p.id, p.name, p.poster, season, episode, epTitle],
  );

  return (
    <>
      <Stack.Screen options={{ title: Number.isFinite(season) ? `S${season} · E${episode}` : 'Sources' }} />
      <SourcesList
        meta={meta}
        videoId={p.id}
        header={
          <View style={styles.header}>
            <Poster uri={meta.poster} width={56} />
            <View style={{ flex: 1, marginLeft: space.md }}>
              <Text style={type.small} numberOfLines={1}>
                {meta.name}
              </Text>
              <Text style={type.heading} numberOfLines={2}>
                {epTitle}
              </Text>
              {Number.isFinite(season) && (
                <Text style={type.small}>
                  Season {season}, episode {episode}
                </Text>
              )}
            </View>
          </View>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.sm },
});
