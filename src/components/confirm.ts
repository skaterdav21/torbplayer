import { Alert, Platform } from 'react-native';

/** Yes/no prompt. React Native's Alert is a no-op on web, so the browser preview uses window.confirm. */
export function confirm(title: string, message: string | undefined, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.([title, message].filter(Boolean).join('\n\n'))) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
