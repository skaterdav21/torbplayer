/**
 * Everything below the title on a "pick a source" screen: addon progress,
 * quality filter chips, and the empty/error states. The rows themselves are
 * rendered by the screen's FlatList so long lists stay virtualized.
 */
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AddonResult } from '../hooks/useSources';
import { QUALITY_ORDER, qualityBucket, type Quality, type StreamInfo } from '../lib/streamInfo';
import { colors, radius, space, type } from '../theme';

export type QualityFilter = Quality | 'all';

export function filterSources(items: StreamInfo[], quality: QualityFilter, showUnsendable: boolean): StreamInfo[] {
  return items.filter(
    (s) => (showUnsendable || s.send !== 'no') && (quality === 'all' || qualityBucket(s.quality) === quality),
  );
}

export function SourcesHeader({
  items,
  statuses,
  loading,
  hasAddons,
  addonsLoaded,
  quality,
  onQuality,
}: {
  items: StreamInfo[];
  statuses: AddonResult[];
  loading: boolean;
  hasAddons: boolean;
  addonsLoaded: boolean;
  quality: QualityFilter;
  onQuality: (q: QualityFilter) => void;
}) {
  if (addonsLoaded && !hasAddons) {
    return (
      <View style={styles.card}>
        <Text style={type.heading}>No source addons yet</Text>
        <Text style={[type.small, { marginTop: space.xs }]}>
          Beam finds streams through Stremio addons (like your TorBox addon). Add one and sources will show up here.
        </Text>
        <Pressable style={styles.button} onPress={() => router.push('/addons')}>
          <Text style={styles.buttonText}>Add an addon</Text>
        </Pressable>
      </View>
    );
  }

  const sendable = items.filter((s) => s.send !== 'no');
  const counts = new Map<Quality, number>();
  for (const s of sendable) counts.set(qualityBucket(s.quality), (counts.get(qualityBucket(s.quality)) ?? 0) + 1);
  const chips: QualityFilter[] = ['all', ...QUALITY_ORDER.filter((q) => counts.has(q))];

  return (
    <View>
      <View style={styles.titleRow}>
        <Text style={type.heading}>Sources</Text>
        {loading && <ActivityIndicator size="small" color={colors.textMuted} style={{ marginLeft: space.sm }} />}
        <View style={{ flex: 1 }} />
        <Text style={type.small}>{sendable.length} sendable</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {chips.map((q) => {
          const active = quality === q;
          return (
            <Pressable key={q} onPress={() => onQuality(q)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {q === 'all' ? `All ${sendable.length}` : `${q} ${counts.get(q)}`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.addonStatus}>
        {statuses.map((s) => (
          <Text key={s.baseUrl} style={[type.tiny, s.status === 'error' && { color: colors.bad }]} numberOfLines={1}>
            {s.name}:{' '}
            {s.status === 'loading' ? 'searching…' : s.status === 'error' ? `failed (${s.error})` : `${s.count} found`}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function SourcesFooter({
  items,
  visibleCount,
  loading,
  showUnsendable,
  onToggleUnsendable,
  onRetry,
}: {
  items: StreamInfo[];
  visibleCount: number;
  loading: boolean;
  showUnsendable: boolean;
  onToggleUnsendable: () => void;
  onRetry: () => void;
}) {
  const unsendable = items.filter((s) => s.send === 'no').length;
  return (
    <View style={styles.footer}>
      {!loading && visibleCount === 0 && (
        <Text style={[type.small, { textAlign: 'center' }]}>
          {items.length === 0 ? 'No sources found.' : 'Nothing matches this filter.'}
        </Text>
      )}
      {unsendable > 0 && (
        <Pressable onPress={onToggleUnsendable} style={styles.linkButton}>
          <Text style={styles.link}>
            {showUnsendable ? 'Hide' : 'Show'} {unsendable} torrent-only / unsendable result{unsendable === 1 ? '' : 's'}
          </Text>
        </Pressable>
      )}
      {!loading && (
        <Pressable onPress={onRetry} style={styles.linkButton}>
          <Text style={styles.link}>Search again</Text>
        </Pressable>
      )}
      <Text style={[type.tiny, { textAlign: 'center', marginTop: space.md }]}>
        Tap a source to send it. Long-press to choose a different device.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: space.lg,
    padding: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: space.md,
    backgroundColor: colors.accent,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
  },
  buttonText: { color: colors.accentText, fontWeight: '600' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    marginTop: space.lg,
  },
  chips: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
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
  addonStatus: { paddingHorizontal: space.lg, marginBottom: space.sm, gap: 2 },
  footer: { padding: space.lg, paddingBottom: space.xl * 2 },
  linkButton: { paddingVertical: space.sm, alignItems: 'center' },
  link: { color: colors.accent, fontSize: 14 },
});
