import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";

import { AgentProvider, useAgent } from "@/lib/agent/agent-provider";
import { palette } from "@/components/agent-ui";
import { ThemeProvider } from "@/lib/theme-provider";

function RootNavigator() {
  const { hydrated, state } = useAgent();
  if (!hydrated) return <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: palette.background }}><ActivityIndicator color={palette.blue} /></View>;
  return <Stack initialRouteName={state.connections.length ? "(tabs)" : "connect"} screenOptions={{ headerBackTitle: "Geri", headerTintColor: palette.blue, headerStyle: { backgroundColor: palette.surface }, headerTitleStyle: { color: palette.navy, fontWeight: "800" }, contentStyle: { backgroundColor: palette.background } }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="connect" options={{ headerShown: false, gestureEnabled: false }} />
    <Stack.Screen name="artifact" options={{ title: "Artifact" }} />
    <Stack.Screen name="providers" options={{ title: "AI Sağlayıcıları" }} />
    <Stack.Screen name="mcp" options={{ title: "MCP Sunucuları" }} />
    <Stack.Screen name="skills" options={{ title: "Yetenekler" }} />
    <Stack.Screen name="integrations" options={{ title: "Entegrasyonlar" }} />
  </Stack>;
}

export default function RootLayout() {
  return <ThemeProvider><AgentProvider><StatusBar style="light" /><RootNavigator /></AgentProvider></ThemeProvider>;
}
