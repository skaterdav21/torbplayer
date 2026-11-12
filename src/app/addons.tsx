import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useToast } from '../components/Toast';
import { hostOf } from '../lib/http';
import type { InstalledAddon } from '../lib/stremio';
import { useAddons } from '../state/AddonsContext';
import { colors, radius, space, type } from '../theme';

export default function AddonsScreen() {
  const { addons, install, remove, setEnabled, move, refresh } = useAddons();
  const { install: incoming } = useLocalSearchParams<{ install?: string }>();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const handledIncoming = useRef<string | null>(null);

  const doInstall = useCallback(
    async (input: string) => {
      setBusy(true);
      setError(null);
      try {
        const addon = await install(input);
        setUrl('');
        toast(`Added ${addon.manifest.name}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [install, toast],
  );

  // Opened from a stremio:// "Install" link (see +native-intent.tsx).
  useEffect(() => {
    if (!incoming || handledIncoming.current === incoming) return;
    handledIncoming.current = incoming;
    Alert.alert('Add this addon?', hostOf(incoming.replace(/^stremio:/i, 'https:')), [
      { text: 'Cancel', style: 'cancel', onPress: () => setUrl(incoming) },
      { text: 'Add', onPress: () => doInstall(incoming) },
    ]);
  }, [incoming, doInstall]);

  const paste = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (text) setUrl(text);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">
        <Text style={type.small}>
          Sources come from Stremio addons. Paste an addon’s manifest URL, or tap “Install” on an addon’s configure page
          and pick Beam.
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://…/manifest.json"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
            onSubmitEditing={() => url && doInstall(url)}
          />
          <Pressable onPress={paste} style={styles.iconButton} accessibilityLabel="Paste">
            <MaterialCommunityIcons name="content-paste" size={20} color={colors.text} />
          </Pressable>
        </View>
        <Pressable
          onPress={() => doInstall(url)}
          disabled={!url || busy}
          style={[styles.primary, (!url || busy) && { opacity: 0.5 }]}
        >
          {busy ? <ActivityIndicator color={colors.accentText} /> : <Text style={styles.primaryText}>Add addon</Text>}
        </Pressable>
        {!!error && <Text style={[type.small, { color: colors.bad, marginTop: space.sm }]}>{error}</Text>}

        <Text style={styles.sectionTitle}>Installed</Text>
        {addons.length === 0 && <Text style={type.small}>None yet.</Text>}
        {addons.map((a, i) => (
          <AddonCard
            key={a.baseUrl}
            addon={a}
            first={i === 0}
            last={i === addons.length - 1}
            onToggle={(v) => setEnabled(a.baseUrl, v)}
            onMove={(d) => move(a.baseUrl, d)}
            onRefresh={() =>
              refresh(a.baseUrl).then(
                () => toast(`Updated ${a.manifest.name}`),
                (e) => toast(`Couldn't refresh: ${e instanceof Error ? e.message : e}`, 'error'),
              )
            }
            onRemove={() =>
              Alert.alert(`Remove ${a.manifest.name}?`, undefined, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => remove(a.baseUrl) },
              ])
            }
          />
        ))}

        <Text style={styles.sectionTitle}>Where to get addons</Text>
        <View style={styles.help}>
          <Text style={type.small}>
            <Text style={styles.strong}>TorBox:</Text> TorBox has its own Stremio addon. Set it up from your TorBox
            account, then copy its manifest link here. Its links play straight from TorBox.
          </Text>
          <Text style={type.small}>
            <Text style={styles.strong}>Torrentio, Comet, MediaFusion and others:</Text> open the addon’s configure
            page, add your debrid service (TorBox, Real-Debrid, …), then copy the manifest link or tap Install.
          </Text>
          <Text style={type.small}>
            Without a debrid service, most torrent addons only return torrents, and a Chromecast can’t play those.
            Beam shows them but can’t send them.
          </Text>
        </View>
        <Text style={[type.tiny, { marginTop: space.md }]}>
          Addon URLs often contain your API key. They’re stored only on this phone, and Beam shows just the host name.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AddonCard({
  addon,
  first,
  last,
  onToggle,
  onMove,
  onRefresh,
  onRemove,
}: {
  addon: InstalledAddon;
  first: boolean;
  last: boolean;
  onToggle: (v: boolean) => void;
  onMove: (delta: -1 | 1) => void;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  const m = addon.manifest;
  return (
    <View style={[styles.card, !addon.enabled && { opacity: 0.6 }]}>
      <View style={styles.cardTop}>
        {m.logo ? (
          <Image source={{ uri: m.logo }} style={styles.logo} contentFit="contain" />
        ) : (
          <View style={[styles.logo, styles.logoFallback]}>
            <MaterialCommunityIcons name="puzzle" size={20} color={colors.textMuted} />
          </View>
        )}
        <View style={{ flex: 1, marginHorizontal: space.md }}>
          <Text style={type.body} numberOfLines={1}>
            {m.name} <Text style={type.tiny}>v{m.version}</Text>
          </Text>
          <Text style={type.tiny} numberOfLines={1}>
            {hostOf(addon.baseUrl)}
          </Text>
        </View>
        <Switch
          value={addon.enabled}
          onValueChange={onToggle}
          trackColor={{ true: colors.accent, false: colors.border }}
          thumbColor={colors.text}
        />
      </View>
      {!!m.description && (
        <Text style={[type.small, { marginTop: space.sm }]} numberOfLines={2}>
          {m.description}
        </Text>
      )}
      <View style={styles.actions}>
        <Action icon="arrow-up" label="Up" onPress={() => onMove(-1)} disabled={first} />
        <Action icon="arrow-down" label="Down" onPress={() => onMove(1)} disabled={last} />
        <Action icon="refresh" label="Refresh" onPress={onRefresh} />
        {m.behaviorHints?.configurable && (
          <Action
            icon="cog-outline"
            label="Configure"
            onPress={() => WebBrowser.openBrowserAsync(`${addon.baseUrl}/configure`)}
          />
        )}
        <View style={{ flex: 1 }} />
        <Action icon="delete-outline" label="Remove" onPress={onRemove} danger />
      </View>
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surfaceRaised }, disabled && { opacity: 0.3 }]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={danger ? colors.bad : colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.lg, gap: space.sm },
  input: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 15,
  },
  iconButton: {
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  primary: {
    marginTop: space.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: { color: colors.accentText, fontWeight: '700', fontSize: 15 },
  sectionTitle: {
    ...type.small,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md, marginBottom: space.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 36, height: 36, borderRadius: radius.sm },
  logoFallback: { backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm, gap: space.xs },
  action: { padding: 6, borderRadius: radius.sm },
  help: { gap: space.md },
  strong: { color: colors.text, fontWeight: '600' },
});
