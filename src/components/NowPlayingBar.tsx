import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MediaPlayerState, useCastDevice, useMediaStatus, useRemoteMediaClient, useStreamPosition } from '../cast/cast';
import { colors, space, type } from '../theme';

/** Slim "now casting" bar pinned to the bottom of every screen. Tap for the full remote. */
export function NowPlayingBar() {
  const status = useMediaStatus();
  const client = useRemoteMediaClient();
  const device = useCastDevice();
  const position = useStreamPosition();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const media = status?.mediaInfo;
  if (!client || !status || !media || status.playerState === MediaPlayerState.IDLE || pathname === '/remote') {
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
