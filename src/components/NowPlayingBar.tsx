import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MediaPlayerState, useCastDevice, useMediaStatus, useRemoteMediaClient, useStreamPosition } from '../cast/cast';
import { useNow, useParty } from '../cast/PartyContext';
import { colors, space, type } from '../theme';

/** Slim "now casting" bar pinned to the bottom of every screen. Tap for the full remote. */
export function NowPlayingBar() {
  const { party } = useParty();
  const pathname = usePathname();
  if (pathname === '/remote') return null;
  return party ? <PartyBar /> : <SingleBar />;
}

function PartyBar() {
  const { party, meta, starting } = useParty();
  const insets = useSafeAreaInsets();
  const now = useNow();
  if (!party) return null;

  const playing = party.isPlaying();
  const duration = party.duration();
  const progress = duration > 0 ? Math.min(1, party.position(now) / duration) : 0;
  const live = party.live().length;
  const title = meta?.episode ? `${meta.name} · ${meta.episode.title}` : (meta?.name ?? 'Watch party');
  const detail = starting
    ? `Getting ${party.members.length} TVs ready…`
    : `Watch party · ${live} of ${party.members.length} TVs ${playing ? 'playing' : 'paused'}`;

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom }]}>
      <View style={[styles.progress, { width: `${progress * 100}%` }]} />
      <Pressable style={styles.bar} onPress={() => router.push('/remote')} accessibilityLabel="Open watch party remote">
        {meta?.poster ? (
          <Image source={{ uri: meta.poster }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, { backgroundColor: colors.surfaceRaised }]} />
        )}
        <View style={{ flex: 1, marginHorizontal: space.md }}>
          <Text style={type.body} numberOfLines={1}>
            {title}
          </Text>
          <Text style={type.small} numberOfLines={1}>
            <MaterialCommunityIcons name="account-group" size={13} color={colors.accent} /> {detail}
          </Text>
        </View>
        {live > 0 && (
          <Pressable
            hitSlop={12}
            onPress={() => (playing ? party.pauseAll() : party.playAll())}
            accessibilityLabel={playing ? 'Pause all' : 'Play all'}
          >
            <MaterialCommunityIcons name={playing ? 'pause' : 'play'} size={30} color={colors.text} />
          </Pressable>
        )}
      </Pressable>
    </View>
  );
}

function SingleBar() {
  const status = useMediaStatus();
  const client = useRemoteMediaClient();
  const device = useCastDevice();
  const position = useStreamPosition();
  const insets = useSafeAreaInsets();

  const media = status?.mediaInfo;
  if (!client || !status || !media || status.playerState === MediaPlayerState.IDLE) {
    return null;
  }

  const meta = media.metadata as { title?: string; seriesTitle?: string; images?: { url: string }[] } | undefined;
  const title = meta?.seriesTitle ? `${meta.seriesTitle} · ${meta.title ?? ''}` : (meta?.title ?? 'Casting');
  const playing = status.playerState === MediaPlayerState.PLAYING;
  const buffering = status.playerState === MediaPlayerState.BUFFERING || status.playerState === MediaPlayerState.LOADING;
  const duration = media.streamDuration ?? 0;
  const progress = duration > 0 && position != null ? Math.min(1, position / duration) : 0;

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom }]}>
      <View style={[styles.progress, { width: `${progress * 100}%` }]} />
      <Pressable style={styles.bar} onPress={() => router.push('/remote')} accessibilityLabel="Open remote">
        {meta?.images?.[0]?.url ? (
          <Image source={{ uri: meta.images[0].url }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, { backgroundColor: colors.surfaceRaised }]} />
        )}
        <View style={{ flex: 1, marginHorizontal: space.md }}>
          <Text style={type.body} numberOfLines={1}>
            {title}
          </Text>
          <Text style={type.small} numberOfLines={1}>
            {buffering ? 'Buffering on ' : playing ? 'Playing on ' : 'Paused on '}
            {device?.friendlyName ?? 'TV'}
          </Text>
        </View>
        <Pressable
          hitSlop={12}
          onPress={() => (playing ? client.pause() : client.play()).catch(() => {})}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
        >
          <MaterialCommunityIcons name={playing ? 'pause' : 'play'} size={30} color={colors.text} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  progress: { height: 2, backgroundColor: colors.accent },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm },
  thumb: { width: 34, height: 50, borderRadius: 4 },
});
