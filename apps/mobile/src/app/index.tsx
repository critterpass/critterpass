import Constants from 'expo-constants';
import { StyleSheet, Text, View } from 'react-native';

function readAppVariant(): string {
  const raw: unknown = Constants.expoConfig?.extra?.appVariant;
  return typeof raw === 'string' ? raw : 'development';
}

export default function HomeScreen() {
  const appName = Constants.expoConfig?.name ?? 'Critterpass';
  const appVariant = readAppVariant();

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        {appName}
      </Text>
      <Text accessibilityLabel={`Build variant: ${appVariant}`} style={styles.variant}>
        {appVariant}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  variant: {
    fontSize: 16,
  },
});
