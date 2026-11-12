import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatBytes, type StreamInfo } from '../lib/streamInfo';
import { colors, radius, space, type } from '../theme';

interface Props {
  info: StreamInfo;
  busy: boolean;
  onPress: (info: StreamInfo) => void;
  onLongPress: (info: StreamInfo) => void;
}

export const SourceRow = memo(function SourceRow({ info, busy, onPress, onLongPress }: Props) {
  const disabled = info.send === 'no';
  const facts = [
    formatBytes(info.sizeBytes),
    info.codec,
    info.audio.join(' '),
    info.container?.toUpperCase(),
    info.seeders != null ? `${info.seeders} seeds` : undefined,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={() => onPress(info)}
      onLongPress={() => onLongPress(info)}
      delayLongPress={350}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityHint="Sends this source to your TV. Long-press to pick a different device."
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <View style={styles.tags}>
        {info.quality && <Tag text={info.quality} color={colors.text} strong />}
        {info.hdr && <Tag text={info.hdr} color={colors.accent} />}
        {info.cached === true && <Tag text="⚡ Cached" color={colors.cached} />}
        {info.cached === false && <Tag text="Not cached" color={colors.textMuted} />}
        <View style={{ flex: 1 }} />
        <Text style={type.tiny} numberOfLines={1}>
          {info.addonName}
        </Text>
      </View>

      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={2}>
          {breakable(info.title)}
        </Text>
        {busy ? (
          <ActivityIndicator color={colors.accent} style={{ marginLeft: space.sm }} />
        ) : !disabled ? (
          <MaterialCommunityIcons name="cast" size={22} color={colors.accent} style={{ marginLeft: space.sm }} />
        ) : null}
      </View>

      {facts.length > 0 && (
        <Text style={type.small} numberOfLines={1}>
          {facts.join('  ·  ')}
        </Text>
      )}

      {info.notes.map((note) => (
        <View key={note} style={styles.note}>
          <MaterialCommunityIcons
            name={info.send === 'no' ? 'close-circle-outline' : 'alert-outline'}
            size={14}
            color={info.send === 'no' ? colors.bad : colors.warn}
          />
          <Text style={[type.tiny, { marginLeft: 4, flex: 1, color: info.send === 'no' ? colors.bad : colors.warn }]}>
            {note}
          </Text>
        </View>
      ))}
    </Pressable>
  );
});

/** Release names have no spaces; let them wrap after dots and underscores. */
function breakable(name: string): string {
  return name.replace(/([._])/g, '$1\u200B');
}

function Tag({ text, color, strong }: { text: string; color: string; strong?: boolean }) {
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <Text style={[styles.tagText, { color }, strong && { fontWeight: '700' }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    gap: 6,
  },
  pressed: { backgroundColor: colors.surfaceRaised },
  disabled: { opacity: 0.55 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1 },
  tagText: { fontSize: 11 },
  main: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, lineHeight: 19 },
  note: { flexDirection: 'row', alignItems: 'flex-start' },
});
