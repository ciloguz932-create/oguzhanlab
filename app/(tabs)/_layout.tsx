import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { palette } from "@/components/agent-ui";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const paddingBottom = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 8);
  return <Tabs screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, tabBarActiveTintColor: palette.blue, tabBarInactiveTintColor: palette.muted, tabBarStyle: { backgroundColor: "#FFFFFF", borderTopColor: palette.border, paddingTop: 7, paddingBottom, height: 58 + paddingBottom }, tabBarItemStyle: { minHeight: 48 }, tabBarLabelStyle: { fontSize: 10, lineHeight: 13, fontWeight: "700" } }}>
    <Tabs.Screen name="index" options={{ title: "Ana Alan", tabBarAccessibilityLabel: "Ana alan", tabBarIcon: ({ color }) => <IconSymbol name="house.fill" size={23} color={color} /> }} />
    <Tabs.Screen name="projects" options={{ title: "Projeler", tabBarAccessibilityLabel: "Projeler", tabBarIcon: ({ color }) => <IconSymbol name="folder.fill" size={23} color={color} /> }} />
    <Tabs.Screen name="tasks" options={{ title: "Görevler", tabBarAccessibilityLabel: "Görevler", tabBarIcon: ({ color }) => <IconSymbol name="checklist" size={23} color={color} /> }} />
    <Tabs.Screen name="files" options={{ title: "Dosyalar", tabBarAccessibilityLabel: "Dosyalar", tabBarIcon: ({ color }) => <IconSymbol name="doc.fill" size={23} color={color} /> }} />
    <Tabs.Screen name="settings" options={{ title: "Ayarlar", tabBarAccessibilityLabel: "Ayarlar", tabBarIcon: ({ color }) => <IconSymbol name="gearshape.fill" size={23} color={color} /> }} />
  </Tabs>;
}
