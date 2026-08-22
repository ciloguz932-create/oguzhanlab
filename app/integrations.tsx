import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { EmptyState, palette, PrimaryButton, StatusPill } from "@/components/agent-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAgent } from "@/lib/agent/agent-provider";
import { INTEGRATION_DEFS, type IntegrationDef } from "@/lib/agent/integrations";
import type { IntegrationConfig } from "@/lib/agent/types";

function IntegrationCard({ def, config }: { def: IntegrationDef; config: IntegrationConfig }) {
  const { connectIntegration, disconnectIntegration, setIntegrationEnabled } = useAgent();
  const [visible, setVisible] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const connect = async () => {
    setBusy(true); setError(undefined);
    try { await connectIntegration(def.id, token); setToken(""); setVisible(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Bağlanılamadı."); }
    finally { setBusy(false); }
  };
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.icon}><MaterialIcons name={def.id === "github" ? "code" : "mail-outline"} size={21} color={palette.blue} /></View>
        <View style={styles.copy}>
          <View style={styles.nameRow}><Text style={styles.name}>{def.name}</Text><StatusPill label={config.connected ? "BAĞLI" : "BAĞLI DEĞİL"} tone={config.connected ? "success" : "neutral"} /></View>
          <Text style={styles.desc}>{def.description}</Text>
        </View>
        {config.connected ? <Switch value={config.enabled} onValueChange={(value) => setIntegrationEnabled(def.id, value)} trackColor={{ false: "#CFD8E3", true: "#8FCDF0" }} thumbColor={config.enabled ? palette.blue : "#FFFFFF"} /> : null}
      </View>
      <Text style={styles.tools}>{def.tools.length} araç: {def.tools.map((tool) => tool.id).join(", ")}</Text>
      {config.connected
        ? <Pressable onPress={() => void disconnectIntegration(def.id)} style={({ pressed }) => [styles.disconnect, pressed && styles.pressed]}><MaterialIcons name="link-off" size={16} color={palette.error} /><Text style={styles.disconnectText}>Bağlantıyı kaldır</Text></Pressable>
        : <PrimaryButton label="Bağlan" tone="secondary" icon="link" onPress={() => setVisible(true)} />}
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={styles.modalWrap}><View style={styles.modal}>
          <Text style={styles.modalTitle}>{def.name} bağla</Text>
          <Text style={styles.modalText}>{def.credentialHint}</Text>
          <TextInput value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder={def.credentialLabel} placeholderTextColor="#91A0B4" style={styles.input} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.modalActions}><PrimaryButton label="Vazgeç" tone="secondary" onPress={() => setVisible(false)} /><PrimaryButton label={busy ? "Doğrulanıyor…" : "Bağlan"} icon="link" disabled={busy || !token.trim()} onPress={() => void connect()} /></View>
        </View></View>
      </Modal>
    </View>
  );
}

export default function IntegrationsScreen() {
  const { state } = useAgent();
  return (
    <ScreenContainer className="flex-1">
      <FlatList
        data={INTEGRATION_DEFS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<View style={styles.header}><Text style={styles.title}>Entegrasyonlar</Text><Text style={styles.subtitle}>Token tabanlı harici servisler araçlarını agent’a ekler. Tokenlar cihazın güvenli alanında saklanır. Gmail/Drive gibi OAuth gerektiren servisler için bir MCP sunucusu bağlayın.</Text></View>}
        ListEmptyComponent={<EmptyState icon="extension-off" title="Entegrasyon yok" description="Yerleşik entegrasyonlar yüklenemedi." />}
        renderItem={({ item }) => <IntegrationCard def={item} config={state.integrations.find((config) => config.id === item.id) ?? { id: item.id, enabled: false, connected: false, createdAt: "" }} />}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 30, gap: 12 },
  header: { gap: 8, marginBottom: 5 },
  title: { color: palette.navy, fontWeight: "900", fontSize: 24 },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 19, marginBottom: 5 },
  card: { borderWidth: 1, borderColor: palette.border, borderRadius: 16, padding: 14, backgroundColor: palette.surface, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  icon: { width: 42, height: 42, backgroundColor: palette.blueSoft, borderRadius: 13, justifyContent: "center", alignItems: "center" },
  copy: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: { color: palette.navy, fontWeight: "900", fontSize: 15 },
  desc: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  tools: { color: "#8997A9", fontSize: 11, lineHeight: 16 },
  disconnect: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  disconnectText: { color: palette.error, fontSize: 12, fontWeight: "800" },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(16,36,62,0.24)" },
  modal: { backgroundColor: palette.surface, padding: 22, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 11 },
  modalTitle: { color: palette.navy, fontSize: 20, fontWeight: "900" },
  modalText: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  input: { height: 47, borderWidth: 1, borderColor: palette.border, borderRadius: 11, paddingHorizontal: 13, color: palette.navy, fontSize: 13 },
  error: { color: palette.error, fontSize: 12 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 9, marginTop: 4 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
