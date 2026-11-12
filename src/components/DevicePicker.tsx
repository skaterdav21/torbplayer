import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CastContext, isSimulatedCast, useCastDevice, useDevices, type Device } from '../cast/cast';
import { canJoinParty, useParty } from '../cast/PartyContext';
import { useSend } from '../cast/SendContext';
import { KEYS, loadJson, saveJson } from '../lib/storage';
import { colors, radius, space, type } from '../theme';

type Mode = 'one' | 'party';

/**
 * Bottom sheet listing Chromecasts on the network. Opens when a source is
 * tapped and nothing is connected, or on long-press. "Watch party" mode
 * picks several TVs to play the same thing in sync.
 */
export function DevicePicker() {
  const { phase, cancel } = useSend();
  const visible = phase === 'picking' || phase === 'connecting';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={cancel} statusBarTranslucent>
      {/* Mounted per opening, so each one starts from fresh state. */}
      {visible && <PickerSheet />}
    </Modal>
  );
}

function PickerSheet() {
  const { phase, connectingTo, lastDeviceId, pickDevice, startPartyWith, openSystemDialog, cancel } = useSend();
  const { party } = useParty();
  const devices = useDevices();
  const current = useCastDevice();
  const insets = useSafeAreaInsets();
  // Start from the running party, if there is one.
  const [mode, setMode] = useState<Mode>(party ? 'party' : 'one');
  const [selected, setSelected] = useState<string[]>(() => party?.members.map((m) => m.device.id) ?? []);

  useEffect(() => {
    const discovery = CastContext.getDiscoveryManager();
    discovery.startDiscovery().catch(() => {});
    return () => {
      discovery.stopDiscovery().catch(() => {});
    };
  }, []);

  // Otherwise preselect the TVs from the last party.
  useEffect(() => {
    if (party) return;
    let cancelled = false;
    loadJson<string[]>(KEYS.partyDevices, []).then((ids) => !cancelled && setSelected(Array.isArray(ids) ? ids : []));
    return () => {
      cancelled = true;
    };
  }, [party]);

  const sorted = useMemo(() => {
    const videoCapable = devices.filter((d) => !d.capabilities?.length || d.capabilities.includes('VideoOut'));
    return [...videoCapable].sort(
      (a, b) =>
        Number(b.deviceId === current?.deviceId) - Number(a.deviceId === current?.deviceId) ||
        Number(b.deviceId === lastDeviceId) - Number(a.deviceId === lastDeviceId) ||
        a.friendlyName.localeCompare(b.friendlyName),
    );
  }, [devices, current, lastDeviceId]);

  const chosen = sorted.filter((d) => selected.includes(d.deviceId) && canJoinParty(d));
  const toggle = (d: Device) =>
    setSelected((prev) => (prev.includes(d.deviceId) ? prev.filter((id) => id !== d.deviceId) : [...prev, d.deviceId]));
  const start = () => {
    saveJson(
      KEYS.partyDevices,
      chosen.map((d) => d.deviceId),
    );
    startPartyWith(chosen);
  };

  return (
    <>
      <Pressable style={styles.backdrop} onPress={phase === 'connecting' ? undefined : cancel} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.handle} />
        <Text style={type.heading}>Send to…</Text>
        {isSimulatedCast && <Text style={[type.tiny, { marginTop: 2 }]}>Browser preview: these devices are simulated.</Text>}

        <View style={styles.segment}>
          {(['one', 'party'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              disabled={phase === 'connecting'}
              style={[styles.segmentItem, mode === m && styles.segmentActive]}
            >
              <MaterialCommunityIcons
                name={m === 'one' ? 'television' : 'account-group-outline'}
                size={16}
                color={mode === m ? colors.accentText : colors.textMuted}
              />
              <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>
                {m === 'one' ? 'One TV' : 'Watch party'}
              </Text>
            </Pressable>
          ))}
        </View>
        {mode === 'party' && (
          <Text style={[type.tiny, { marginTop: space.sm }]}>
            Pick two or more TVs. They all start together, and play, pause and seek act on every TV.
          </Text>
        )}

        <View style={{ marginTop: space.sm }}>
          {sorted.map((d) =>
            mode === 'one' ? (
              <DeviceRow
                key={d.deviceId}
                device={d}
                connected={d.deviceId === current?.deviceId}
                lastUsed={d.deviceId === lastDeviceId}
                busy={phase === 'connecting' && connectingTo === d.friendlyName}
                disabled={phase === 'connecting'}
                onPress={() => pickDevice(d)}
              />
            ) : (
              <PartyRow
                key={d.deviceId}
                device={d}
                checked={selected.includes(d.deviceId)}
                joinable={canJoinParty(d)}
                onPress={() => toggle(d)}
              />
            ),
          )}
          {sorted.length === 0 && (
            <View style={styles.searching}>
              <ActivityIndicator color={colors.textMuted} />
              <Text style={[type.small, { marginLeft: space.md, flex: 1 }]}>
                Looking for Chromecasts… Make sure your phone and TV are on the same Wi-Fi.
              </Text>
            </View>
          )}
        </View>

        {mode === 'party' ? (
          <Pressable
            onPress={start}
            disabled={chosen.length < 2}
            style={[styles.primary, chosen.length < 2 && { opacity: 0.4 }]}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="account-group" size={18} color={colors.accentText} />
            <Text style={styles.primaryText}>
              {chosen.length < 2 ? 'Pick at least 2 TVs' : `${party ? 'Play' : 'Start watch party'} on ${chosen.length} TVs`}
            </Text>
          </Pressable>
        ) : (
          <Pressable onPress={openSystemDialog} style={styles.systemDialog} disabled={phase === 'connecting'}>
            <MaterialCommunityIcons name="cast" size={18} color={colors.textMuted} />
            <Text style={[type.small, { marginLeft: space.sm }]}>Use the Android cast menu instead</Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

function DeviceRow({
  device,
  connected,
  lastUsed,
  busy,
  disabled,
  onPress,
}: {
  device: Device;
  connected: boolean;
  lastUsed: boolean;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const subtitle = connected ? 'Connected' : lastUsed ? `Last used · ${device.modelName}` : device.modelName;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceRaised }, disabled && !busy && { opacity: 0.5 }]}
    >
      <MaterialCommunityIcons
        name={connected ? 'cast-connected' : 'television'}
        size={26}
        color={connected ? colors.accent : colors.text}
      />
      <View style={{ flex: 1, marginLeft: space.md }}>
        <Text style={type.body}>{device.friendlyName}</Text>
        {!!subtitle && <Text style={type.small}>{subtitle}</Text>}
      </View>
      {busy ? <ActivityIndicator color={colors.accent} /> : <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textFaint} />}
    </Pressable>
  );
}

function PartyRow({
  device,
  checked,
  joinable,
  onPress,
}: {
  device: Device;
  checked: boolean;
  joinable: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!joinable}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !joinable }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceRaised }, !joinable && { opacity: 0.5 }]}
    >
      <MaterialCommunityIcons
        name={checked && joinable ? 'checkbox-marked' : 'checkbox-blank-outline'}
        size={24}
        color={checked && joinable ? colors.accent : colors.textMuted}
      />
      <View style={{ flex: 1, marginLeft: space.md }}>
        <Text style={type.body}>{device.friendlyName}</Text>
        <Text style={type.small}>{joinable ? device.modelName : 'Can’t join a party (no network address)'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: space.md,
  },
  segment: {
    flexDirection: 'row',
    marginTop: space.md,
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { color: colors.textMuted, fontSize: 14 },
  segmentTextActive: { color: colors.accentText, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  searching: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.lg },
  systemDialog: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.md,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 13,
  },
  primaryText: { color: colors.accentText, fontWeight: '700', fontSize: 15 },
});
