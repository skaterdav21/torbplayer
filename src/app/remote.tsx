import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CastButton,
  CastContext,
  MediaPlayerIdleReason,
  MediaPlayerState,
  useCastDevice,
  useCastSession,
  useMediaStatus,
  useRemoteMediaClient,
  useStreamPosition,
} from '../cast/cast';
import { colors, radius, space, type } from '../theme';

function clock(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '--:--';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export default function RemoteScreen() {
  const client = useRemoteMediaClient();
  const session = useCastSession();
  const status = useMediaStatus();
  const device = useCastDevice();
  const position = useStreamPosition(1);
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);

  if (!client) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons name="cast" size={48} color={colors.textFaint} />
        <Text style={[type.body, { marginTop: space.md }]}>Not connected to a TV</Text>
        <Text style={[type.small, { textAlign: 'center', marginTop: space.xs }]}>
          Pick a source and Beam will ask which device to send it to.
        </Text>
        <View style={{ marginTop: space.lg }}>
          <CastButton style={{ width: 32, height: 32, tintColor: colors.text }} tintColor={colors.text} />
        </View>
      </View>
    );
  }

  const media = status?.mediaInfo;
  const meta = media?.metadata as
    | { title?: string; seriesTitle?: string; subtitle?: string; seasonNumber?: number; episodeNumber?: number; images?: { url: string }[] }
    | undefined;
  const state = status?.playerState;
  const playing = state === MediaPlayerState.PLAYING;
  const buffering = state === MediaPlayerState.BUFFERING || state === MediaPlayerState.LOADING;
  const failed = state === MediaPlayerState.IDLE && status?.idleReason === MediaPlayerIdleReason.ERROR;
  const finished = state === MediaPlayerState.IDLE && status?.idleReason === MediaPlayerIdleReason.FINISHED;
  const duration = media?.streamDuration ?? 0;
  const progress = duration > 0 && position != null ? Math.min(1, position / duration) : 0;

  const run = (p?: Promise<unknown>) => p?.catch(() => {});
  const seekBy = (delta: number) => run(client.seek({ position: delta, relative: true }));
  const onBarPress = (x: number) => {
    if (barWidth > 0 && duration > 0) run(client.seek({ position: (x / barWidth) * duration }));
  };
  const changeVolume = async (delta: number) => {
    if (!session) return;
    const v = await session.getVolume();
    session.setVolume(Math.max(0, Math.min(1, Math.round((v + delta) * 20) / 20)));
  };

  const heading = meta?.seriesTitle ?? meta?.title ?? 'Nothing playing';
  const subheading = meta?.seriesTitle
    ? [meta.seasonNumber != null && `S${meta.seasonNumber} · E${meta.episodeNumber}`, meta.title].filter(Boolean).join('  ·  ')
    : meta?.subtitle;

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + space.lg }]}>
      <Text style={[type.small, { textAlign: 'center' }]}>
        <MaterialCommunityIcons name="cast-connected" size={14} color={colors.accent} /> {device?.friendlyName ?? 'TV'}
      </Text>

      <View style={styles.art}>
        {meta?.images?.[0]?.url ? (
          <Image source={{ uri: meta.images[0].url }} style={styles.poster} contentFit="cover" />
        ) : (
          <View style={[styles.poster, { backgroundColor: colors.surface }]} />
        )}
      </View>

      <Text style={[type.title, { textAlign: 'center' }]} numberOfLines={2}>
        {heading}
      </Text>
      {!!subheading && (
        <Text style={[type.small, { textAlign: 'center', marginTop: space.xs }]} numberOfLines={2}>
          {subheading}
        </Text>
      )}

      {failed && (
        <Text style={[type.small, styles.banner, { color: colors.bad }]}>
          The TV couldn’t play this source. Go back and try another one (MP4 / H.264 is the safest bet).
        </Text>
      )}
      {finished && <Text style={[type.small, styles.banner]}>Finished.</Text>}
      {!media && !failed && <Text style={[type.small, styles.banner]}>Connected. Pick something to play.</Text>}

      {media && (
        <>
          <Pressable
            style={styles.barTouch}
            onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
            onPress={(e) => onBarPress(e.nativeEvent.locationX)}
            accessibilityLabel="Seek"
          >
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
            </View>
          </Pressable>
          <View style={styles.times}>
            <Text style={type.tiny}>{clock(position)}</Text>
            <Text style={type.tiny}>{buffering ? 'Buffering…' : ''}</Text>
            <Text style={type.tiny}>{duration > 0 ? clock(duration) : ''}</Text>
          </View>

          <View style={styles.transport}>
            <Control icon="rewind-30" onPress={() => seekBy(-30)} />
            <Control icon="rewind-10" onPress={() => seekBy(-10)} />
            <Pressable
              onPress={() => run(playing ? client.pause() : client.play())}
              style={styles.playButton}
              accessibilityLabel={playing ? 'Pause' : 'Play'}
            >
              {buffering ? (
                <ActivityIndicator color={colors.accentText} />
              ) : (
                <MaterialCommunityIcons name={playing ? 'pause' : 'play'} size={36} color={colors.accentText} />
              )}
            </Pressable>
            <Control icon="fast-forward-10" onPress={() => seekBy(10)} />
            <Control icon="fast-forward-30" onPress={() => seekBy(30)} />
          </View>
        </>
      )}

      <View style={{ flex: 1 }} />

      <View style={styles.secondary}>
        <Control icon="volume-minus" onPress={() => changeVolume(-0.05)} small />
        <Control icon="volume-plus" onPress={() => changeVolume(0.05)} small />
        {Platform.OS !== 'web' && media && (
          <Control icon="subtitles-outline" onPress={() => CastContext.showExpandedControls()} small />
        )}
        {media && <Control icon="stop" onPress={() => run(client.stop())} small />}
        <Control
          icon="cast-off"
          onPress={() => {
            CastContext.getSessionManager().endCurrentSession(true).catch(() => {});
            router.back();
          }}
          small
        />
      </View>
    </View>
  );
}

function Control({
  icon,
  onPress,
  small,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={icon.replace(/-/g, ' ')}
      style={({ pressed }) => [small ? styles.smallControl : styles.control, pressed && { opacity: 0.6 }]}
    >
      <MaterialCommunityIcons name={icon} size={small ? 24 : 30} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space.xl, paddingTop: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  art: { alignItems: 'center', marginVertical: space.xl },
  poster: { width: 170, height: 255, borderRadius: radius.md },
  banner: { textAlign: 'center', marginTop: space.lg },
  barTouch: { marginTop: space.xl, paddingVertical: space.md },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: colors.accent },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg },
  control: { padding: space.sm },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: space.sm,
  },
  smallControl: { padding: space.md },
});
