import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNow, useParty } from '../cast/PartyContext';
import { confirm } from './confirm';
import { DRIFT_WARNING_S, memberState, type MemberState, type PartyMember } from '../lib/castv2/party';
import { clock } from '../lib/time';
import { colors, radius, space, type } from '../theme';

const STATE_LABEL: Record<MemberState, string> = {
  connecting: 'Connecting…',
  loading: 'Loading…',
  ready: 'Ready, waiting for the others',
  playing: 'Playing',
  paused: 'Paused',
  buffering: 'Buffering…',
  finished: 'Finished',
  stopped: 'Stopped',
  error: 'Couldn’t play',
  disconnected: 'Disconnected',
};

/** Remote for a watch party: every control acts on all the TVs together. */
export function PartyRemote() {
  const { party, meta, starting, error, endParty } = useParty();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<string | null>(null);
  const [barWidth, setBarWidth] = useState(0);
  const now = useNow();

  if (!party) return null;

  const position = party.position(now);
  const duration = party.duration();
  const playing = party.isPlaying();
  const drift = party.drift(now);
  const outOfSync = party.live().length > 1 && party.maxDrift(now) > DRIFT_WARNING_S;
  const leader = party.leader();
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const liveCount = party.live().length;

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const subtitle = meta?.episode
    ? `S${meta.episode.season} · E${meta.episode.episode}  ·  ${meta.episode.title}`
    : meta?.year;

  const confirmEnd = () =>
    confirm('End the watch party?', 'Playback stops on every TV.', 'End party', async () => {
      await endParty();
      router.back();
    });

  return (
    <ScrollView contentContainerStyle={[styles.screen, { paddingBottom: insets.bottom + space.xl }]}>
      <Stack.Screen options={{ title: 'Watch party' }} />

      <View style={styles.top}>
        {meta?.poster ? (
          <Image source={{ uri: meta.poster }} style={styles.poster} contentFit="cover" />
        ) : (
          <View style={[styles.poster, { backgroundColor: colors.surface }]} />
        )}
        <View style={{ flex: 1, marginLeft: space.lg }}>
          <Text style={styles.badge}>
            <MaterialCommunityIcons name="account-group" size={13} color={colors.accent} /> {party.members.length} TVs
          </Text>
          <Text style={type.title} numberOfLines={3}>
            {meta?.name ?? 'Watch party'}
          </Text>
          {!!subtitle && <Text style={[type.small, { marginTop: space.xs }]}>{subtitle}</Text>}
        </View>
      </View>

      {starting && (
        <View style={styles.banner}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={[type.small, { marginLeft: space.sm, flex: 1 }]}>
            Getting every TV ready. They’ll all start together once each one has buffered.
          </Text>
        </View>
      )}
      {!!error && !starting && <Text style={[type.small, styles.error]}>{error}</Text>}

      <Pressable
        style={styles.barTouch}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        onPress={(e) => barWidth > 0 && duration > 0 && act('seek', () => party.seekAll((e.nativeEvent.locationX / barWidth) * duration))}
        disabled={liveCount === 0}
        accessibilityLabel="Seek all TVs"
      >
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
        </View>
      </Pressable>
      <View style={styles.times}>
        <Text style={type.tiny}>{liveCount ? clock(position) : '--:--'}</Text>
        <Text style={type.tiny}>{duration > 0 ? clock(duration) : ''}</Text>
      </View>

      <View style={styles.transport}>
        <Control icon="rewind-30" onPress={() => act('seek', () => party.seekBy(-30))} disabled={!liveCount} />
        <Control icon="rewind-10" onPress={() => act('seek', () => party.seekBy(-10))} disabled={!liveCount} />
        <Pressable
          onPress={() => act('play', () => (playing ? party.pauseAll() : party.playAll()))}
          disabled={!liveCount}
          style={[styles.playButton, !liveCount && { opacity: 0.4 }]}
          accessibilityLabel={playing ? 'Pause all' : 'Play all'}
        >
          {busy === 'seek' || starting ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <MaterialCommunityIcons name={playing ? 'pause' : 'play'} size={36} color={colors.accentText} />
          )}
        </Pressable>
        <Control icon="fast-forward-10" onPress={() => act('seek', () => party.seekBy(10))} disabled={!liveCount} />
        <Control icon="fast-forward-30" onPress={() => act('seek', () => party.seekBy(30))} disabled={!liveCount} />
      </View>

      <Pressable
        onPress={() => act('sync', () => party.resync())}
        disabled={liveCount < 2 || !!busy}
        style={[styles.sync, outOfSync && styles.syncWarn, (liveCount < 2 || !!busy) && { opacity: 0.5 }]}
      >
        {busy === 'sync' ? (
          <ActivityIndicator size="small" color={colors.text} />
        ) : (
          <MaterialCommunityIcons name="sync" size={18} color={outOfSync ? colors.warn : colors.text} />
        )}
        <Text style={[styles.syncText, outOfSync && { color: colors.warn }]}>
          {outOfSync ? 'TVs have drifted apart: re-sync' : 'Re-sync TVs'}
        </Text>
      </Pressable>

      <Text style={styles.sectionTitle}>TVs</Text>
      {party.members.map((m) => (
        <MemberRow
          key={m.device.id}
          member={m}
          isLeader={m === leader}
          drift={drift.get(m)}
          now={now}
          onVolume={(d) => act('volume', () => party.changeVolume(m, d))}
        />
      ))}

      <Pressable onPress={confirmEnd} style={styles.end}>
        <MaterialCommunityIcons name="stop-circle-outline" size={20} color={colors.bad} />
        <Text style={[styles.endText]}>End watch party</Text>
      </Pressable>
      <Text style={[type.tiny, { textAlign: 'center', marginTop: space.sm }]}>
        Tap a source anywhere in the app to play it on every TV in the party.
      </Text>
    </ScrollView>
  );
}

function MemberRow({
  member,
  isLeader,
  drift,
  now,
  onVolume,
}: {
  member: PartyMember;
  isLeader: boolean;
  drift?: number;
  now: number;
  onVolume: (delta: number) => void;
}) {
  const state = memberState(member);
  const live = state === 'playing' || state === 'paused' || state === 'buffering';
  let detail = STATE_LABEL[state];
  if (state === 'error' && member.error) detail = member.error;
  if (live && member.client) {
    detail = `${detail} · ${clock(member.client.position(now))} · ${driftLabel(isLeader, drift)}`;
  }
  const bad = state === 'error' || state === 'disconnected';
  const volume = member.client?.volume;

  return (
    <View style={styles.member}>
      <MaterialCommunityIcons
        name={bad ? 'television-off' : 'television'}
        size={24}
        color={bad ? colors.bad : state === 'playing' ? colors.good : colors.text}
      />
      <View style={{ flex: 1, marginHorizontal: space.md }}>
        <Text style={type.body} numberOfLines={1}>
          {member.device.name}
        </Text>
        <Text style={[type.tiny, bad && { color: colors.bad }]} numberOfLines={2}>
          {detail}
        </Text>
      </View>
      {live && (
        <View style={styles.volume}>
          <Pressable onPress={() => onVolume(-0.05)} hitSlop={6} accessibilityLabel={`${member.device.name} volume down`}>
            <MaterialCommunityIcons name="volume-minus" size={20} color={colors.textMuted} />
          </Pressable>
          <Text style={[type.tiny, { width: 30, textAlign: 'center' }]}>
            {volume != null ? Math.round(volume * 100) : '–'}
          </Text>
          <Pressable onPress={() => onVolume(0.05)} hitSlop={6} accessibilityLabel={`${member.device.name} volume up`}>
            <MaterialCommunityIcons name="volume-plus" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function driftLabel(isLeader: boolean, drift?: number): string {
  if (isLeader || drift == null) return 'sync reference';
  const abs = Math.abs(drift);
  if (abs < 0.25) return 'in sync';
  return `${abs.toFixed(1)}s ${drift > 0 ? 'ahead' : 'behind'}`;
}

function Control({
  icon,
  onPress,
  disabled,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityLabel={icon.replace(/-/g, ' ')}
      style={({ pressed }) => [styles.control, (pressed || disabled) && { opacity: 0.4 }]}
    >
      <MaterialCommunityIcons name={icon} size={30} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: space.xl, paddingTop: space.lg },
  top: { flexDirection: 'row', alignItems: 'flex-end' },
  poster: { width: 96, height: 144, borderRadius: radius.md },
  badge: { color: colors.accent, fontSize: 13, fontWeight: '600', marginBottom: space.xs },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.lg,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  error: { color: colors.bad, marginTop: space.lg },
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
  sync: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  syncWarn: { borderColor: colors.warn },
  syncText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  sectionTitle: {
    ...type.small,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
  },
  volume: { flexDirection: 'row', alignItems: 'center' },
  end: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  endText: { color: colors.bad, fontWeight: '600', fontSize: 15 },
});
