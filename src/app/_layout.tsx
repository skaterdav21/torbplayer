import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PartyProvider } from '../cast/PartyContext';
import { SendProvider } from '../cast/SendContext';
import { DevicePicker } from '../components/DevicePicker';
import { HeaderCastButton } from '../components/HeaderButtons';
import { NowPlayingBar } from '../components/NowPlayingBar';
import { ToastProvider } from '../components/Toast';
import { AddonsProvider } from '../state/AddonsContext';
import { RecentsProvider } from '../state/RecentsContext';
import { colors } from '../theme';

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    border: colors.border,
    primary: colors.accent,
    text: colors.text,
  },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <ToastProvider>
          <AddonsProvider>
            <RecentsProvider>
              <PartyProvider>
                <SendProvider>
                  <View style={{ flex: 1, backgroundColor: colors.bg }}>
                    <Stack
                      screenOptions={{
                        headerStyle: { backgroundColor: colors.bg },
                        headerTintColor: colors.text,
                        headerShadowVisible: false,
                        contentStyle: { backgroundColor: colors.bg },
                        headerRight: () => <HeaderCastButton />,
                      }}
                    >
                      <Stack.Screen name="index" options={{ title: 'Beam' }} />
                      <Stack.Screen name="title/[type]/[id]" options={{ title: '' }} />
                      <Stack.Screen name="sources/[type]/[id]" options={{ title: 'Sources' }} />
                      <Stack.Screen name="addons" options={{ title: 'Addons' }} />
                      <Stack.Screen
                        name="remote"
                        options={{ title: 'Remote', presentation: 'modal', headerRight: () => null }}
                      />
                    </Stack>
                    <NowPlayingBar />
                  </View>
                  <DevicePicker />
                </SendProvider>
              </PartyProvider>
            </RecentsProvider>
          </AddonsProvider>
        </ToastProvider>
        <StatusBar style="light" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
