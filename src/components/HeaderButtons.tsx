import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { CastButton } from '../cast/cast';
import { colors } from '../theme';

export function HeaderCastButton() {
  return <CastButton style={{ width: 26, height: 26, tintColor: colors.text }} tintColor={colors.text} />;
}

export function HomeHeaderButtons() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <HeaderCastButton />
      <Pressable onPress={() => router.push('/addons')} hitSlop={10} accessibilityLabel="Addons">
        <MaterialCommunityIcons name="puzzle-outline" size={24} color={colors.text} />
      </Pressable>
    </View>
  );
}
