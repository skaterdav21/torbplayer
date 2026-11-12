import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CastContext, isSimulatedCast, useCastDevice, useDevices, type Device } from '../cast/cast';
import { useSend } from '../cast/SendContext';
import { colors, radius, space, type } from '../theme';

/** Bottom sheet listing Chromecasts on the network. Opens when a source is tapped and nothing is connected. */
export function DevicePicker() {
  const { phase, connectingTo, lastDeviceId, pickDevice, openSystemDialog, cancel } = useSend();
  const visible = phase === 'picking' || phase === 'connecting';
  const devices = useDevices();
  const current = useCastDevice();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return;
    const discovery = CastContext.getDiscoveryManager();
    discovery.startDiscovery().catch(() => {});
    return () => {
      discovery.stopDiscovery().catch(() => {});
    };
  }, [visible]);

  const sorted = useMemo(() => {
    const videoCapable = devices.filter((d) => !d.capabilities?.length || d.capabilities.includes('VideoOut'));
    return [...videoCapable].sort(
      (a, b) =>
        Number(b.deviceId === current?.deviceId) - Number(a.deviceId === current?.deviceId) ||
        Number(b.deviceId === lastDeviceId) - Number(a.deviceId === lastDeviceId) ||
        a.friendlyName.localeCompare(b.friendlyName),
    );
  }, [devices, current, lastDeviceId]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={cancel} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={phase === 'connecting' ? undefined : cancel} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.handle} />
        <Text style={type.heading}>Send to…</Text>
        {isSimulatedCast && <Text style={[type.tiny, { marginTop: 2 }]}>Browser preview: these devices are simulated.</Text>}

        <View style={{ marginTop: space.md }}>
          {sorted.map((d) => (
            <DeviceRow
              key={d.deviceId}
              device={d}
              connected={d.deviceId === current?.deviceId}
              lastUsed={d.deviceId === lastDeviceId}
              busy={phase === 'connecting' && connectingTo === d.friendlyName}
              disabled={phase === 'connecting'}
              onPress={() => pickDevice(d)}
            />
          ))}
          {sorted.length === 0 && (
            <View style={styles.searching}>
              <ActivityIndicator color={colors.textMuted} />
              <Text style={[type.small, { marginLeft: space.md, flex: 1 }]}>
                Looking for Chromecasts… Make sure your phone and TV are on the same Wi-Fi.
              </Text>
            </View>
          )}
        </View>

        <Pressable onPress={openSystemDialog} style={styles.systemDialog} disabled={phase === 'connecting'}>
          <MaterialCommunityIcons name="cast" size={18} color={colors.textMuted} />
          <Text style={[type.small, { marginLeft: space.sm }]}>Use the Android cast menu instead</Text>
        </Pressable>
      </View>
    </Modal>
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
});
