import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { palette } from "@/components/agent-ui";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const paddingBottom = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 8);
  return <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.background }, tabBarActiveTintColor: palette.blue, tabBarInactiveTintColor: palette.muted, tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border, paddingTop: 7, paddingBottom, height: 56 + paddingBottom }, tabBarLabelStyle: { fontSize: 10, fontWeight: "700" } }}>
    <Tabs.Screen name="index" options={{ title: "Ana Alan", tabBarIcon: ({ color }) => <IconSymbol name="house.fill" size={23} color={color} /> }} />
    <Tabs.Screen name="agent" options={{ title: "Agent", tabBarIcon: ({ color }) => <IconSymbol name="sparkles" size={23} color={color} /> }} />
    <Tabs.Screen name="projects" options={{ title: "Projeler", tabBarIcon: ({ color }) => <IconSymbol name="folder.fill" size={23} color={color} /> }} />
    <Tabs.Screen name="tasks" options={{ title: "Görevler", tabBarIcon: ({ color }) => <IconSymbol name="checklist" size={23} color={color} /> }} />
    <Tabs.Screen name="files" options={{ title: "Dosyalar", tabBarIcon: ({ color }) => <IconSymbol name="doc.fill" size={23} color={color} /> }} />
    <Tabs.Screen name="settings" options={{ title: "Ayarlar", tabBarIcon: ({ color }) => <IconSymbol name="gearshape.fill" size={23} color={color} /> }} />
  </Tabs>;
}
