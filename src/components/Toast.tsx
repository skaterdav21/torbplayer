import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space } from '../theme';

type ToastKind = 'info' | 'error';
const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; kind: ToastKind; id: number } | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const insets = useSafeAreaInsets();

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    setToast({ message, kind, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setToast(null));
    }, 3200);
    return () => clearTimeout(t);
  }, [toast, opacity]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={[styles.toast, { bottom: insets.bottom + 88, opacity }, toast.kind === 'error' && styles.error]}
        >
          <Text style={styles.text}>{toast.message}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  error: { borderColor: colors.bad },
  text: { color: colors.text, fontSize: 14 },
});
