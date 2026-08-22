import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "@/lib/navigator";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { EmptyState, palette, PrimaryButton, StatusPill } from "@/components/agent-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAgent } from "@/lib/agent/agent-provider";
import type { ModelRequirement, ProviderConnection } from "@/lib/agent/types";

const TIERS: { id: ModelRequirement; label: string }[] = [
  { id: "reasoning", label: "Akıl yürütme / planlama" },
  { id: "coding", label: "Kodlama" },
  { id: "vision", label: "Görsel" },
  { id: "fast", label: "Hızlı / basit" },
];

function ConnectionCard({ connection }: { connection: ProviderConnection }) {
  const { disconnect, setDefaultModel, setModelOverride } = useAgent();
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}><View style={styles.providerIcon}><MaterialIcons name="smart-toy" size={22} color={palette.blue} /></View><View style={styles.cardText}><Text style={styles.name}>{connection.label}</Text><Text style={styles.provider}>{connection.provider}</Text></View><StatusPill label="BAĞLI" tone="success" /></View>
      <Text style={styles.modelTitle}>Varsayılan model</Text>
      <View style={styles.models}>{connection.models.slice(0, 10).map((model) => <Pressable key={model.id} onPress={() => setDefaultModel(connection.id, model.id)} style={({ pressed }) => [styles.model, connection.defaultModel === model.id && styles.modelActive, pressed && styles.pressed]}><Text style={[styles.modelText, connection.defaultModel === model.id && styles.modelTextActive]} numberOfLines={1}>{model.label}</Text>{connection.defaultModel === model.id ? <MaterialIcons name="check" size={15} color={palette.blue} /> : null}</Pressable>)}</View>
      <Text style={styles.modelTitle}>Uzman model yönlendirme</Text>
      <Text style={styles.tierHint}>Her görev türü için model sabitleyin. Sabitlenmezse en uygun model otomatik seçilir.</Text>
      {TIERS.map((tier) => {
        const pinned = connection.modelOverrides?.[tier.id];
        return (
          <View key={tier.id} style={styles.tierRow}>
            <Text style={styles.tierLabel}>{tier.label}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tierChips}>
              <Pressable onPress={() => setModelOverride(connection.id, tier.id, undefined)} style={({ pressed }) => [styles.chip, !pinned && styles.chipActive, pressed && styles.pressed]}><Text style={[styles.chipText, !pinned && styles.chipTextActive]}>Otomatik</Text></Pressable>
              {connection.models.slice(0, 12).map((model) => <Pressable key={model.id} onPress={() => setModelOverride(connection.id, tier.id, model.id)} style={({ pressed }) => [styles.chip, pinned === model.id && styles.chipActive, pressed && styles.pressed]}><Text style={[styles.chipText, pinned === model.id && styles.chipTextActive]} numberOfLines={1}>{model.label}</Text></Pressable>)}
            </ScrollView>
          </View>
        );
      })}
      <Pressable onPress={() => Alert.alert("Bağlantıyı kaldır", `${connection.label} için cihazdaki API anahtarı silinecek.`, [{ text: "Vazgeç", style: "cancel" }, { text: "Kaldır", style: "destructive", onPress: () => void disconnect(connection.id) }])} style={({ pressed }) => [styles.disconnect, pressed && styles.pressed]}><MaterialIcons name="link-off" color={palette.error} size={17} /><Text style={styles.disconnectText}>Bağlantıyı kaldır</Text></Pressable>
    </View>
  );
}
export default function ProvidersScreen() { const { state } = useAgent(); return <ScreenContainer className="flex-1"><FlatList data={state.connections} keyExtractor={(item) => item.id} contentContainerStyle={styles.content} ListHeaderComponent={<View style={styles.header}><Text style={styles.title}>AI Sağlayıcıları</Text><Text style={styles.subtitle}>Anahtarlar mobilde güvenli depolamaya alınır; hiçbir zaman olay kayıtlarına yazılmaz.</Text><PrimaryButton label="Yeni sağlayıcı bağla" icon="add" onPress={() => router.push("/connect")} /></View>} ListEmptyComponent={<EmptyState icon="key-off" title="Bağlantı yok" description="OpenAI, Anthropic veya OpenRouter anahtarınızı yapıştırarak başlayın." action={<PrimaryButton label="Sağlayıcı bağla" icon="key" onPress={() => router.push("/connect")} />} />} renderItem={({ item }) => <ConnectionCard connection={item} />} /></ScreenContainer>; }
const styles = StyleSheet.create({ content: { padding: 18, paddingBottom: 30, gap: 12 }, header: { gap: 8, marginBottom: 5 }, title: { color: palette.navy, fontWeight: "900", fontSize: 24 }, subtitle: { color: palette.muted, lineHeight: 19, fontSize: 13, marginBottom: 5 }, card: { padding: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, borderRadius: 17, gap: 12 }, cardHead: { flexDirection: "row", alignItems: "center", gap: 10 }, providerIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: palette.blueSoft, borderRadius: 13 }, cardText: { flex: 1 }, name: { color: palette.navy, fontWeight: "900", fontSize: 15 }, provider: { color: palette.muted, fontSize: 11, marginTop: 3, textTransform: "capitalize" }, modelTitle: { color: palette.navy, fontSize: 12, fontWeight: "800" }, models: { gap: 6 }, model: { height: 38, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 10, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, modelActive: { borderColor: palette.blue, backgroundColor: palette.blueSoft }, modelText: { color: palette.muted, fontSize: 12, flex: 1 }, modelTextActive: { color: palette.blue, fontWeight: "800" }, tierHint: { color: palette.muted, fontSize: 11, lineHeight: 15, marginTop: -2 }, tierRow: { gap: 5 }, tierLabel: { color: palette.navy, fontSize: 12, fontWeight: "700" }, tierChips: { gap: 6, paddingVertical: 1 }, chip: { borderWidth: 1, borderColor: palette.border, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, maxWidth: 160 }, chipActive: { borderColor: palette.blue, backgroundColor: palette.blueSoft }, chipText: { color: palette.muted, fontSize: 11, fontWeight: "700" }, chipTextActive: { color: palette.blue }, disconnect: { flexDirection: "row", gap: 7, alignItems: "center", alignSelf: "flex-start", paddingTop: 2 }, disconnectText: { color: palette.error, fontSize: 12, fontWeight: "800" }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] } });
