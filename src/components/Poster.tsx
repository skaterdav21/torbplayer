import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '../theme';

export function Poster({ uri, width, style }: { uri?: string; width: number; style?: StyleProp<ViewStyle> }) {
  const size = { width, height: Math.round(width * 1.5) };
  return (
    <View style={[styles.frame, size, style]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <MaterialCommunityIcons name="movie-open-outline" size={width / 2.5} color={colors.textFaint} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
