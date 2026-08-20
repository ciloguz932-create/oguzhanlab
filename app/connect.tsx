import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import { router } from "@/lib/navigator";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";

import { palette, PrimaryButton, StatusPill } from "@/components/agent-ui";
import { useAgent } from "@/lib/agent/agent-provider";
import type { ProviderId } from "@/lib/agent/types";

function inferProvider(key: string): ProviderId | undefined {
  if (/^sk-ant-/.test(key)) return "anthropic";
  if (/^sk-or-v1-/.test(key)) return "openrouter";
  if (/^sk-/.test(key)) return "openai";
  return undefined;
}

export default function ConnectScreen() {
  const { connect, supportedProviders } = useAgent();
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState<ProviderId | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const detected = useMemo(() => inferProvider(key.trim()), [key]);
  const activeProvider = provider ?? detected;

  const paste = async () => {
    try {
      const pasted = await Clipboard.getStringAsync();
      if (!pasted.trim()) throw new Error("Panoda yapıştırılacak bir metin bulunamadı.");
      setKey(pasted.trim());
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Panoya erişilemedi.");
    }
  };
  const submit = async () => {
    setLoading(true);
    setError(undefined);
    try {
      await connect({ key, provider: activeProvider });
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bağlantı kurulamadı.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.grow} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.container}>
          <View style={styles.brand}><View style={styles.logo}><MaterialIcons name="hub" size={36} color="#FFFFFF" /></View><Text style={styles.brandName}>OguzhanLab Agent</Text><Text style={styles.tagline}>Kendi anahtarınla çalışan, işleri planlayan ve artifact üreten yerel öncelikli çalışma alanın.</Text></View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Connect AI</Text><Text style={styles.cardText}>API anahtarını yapıştırın. Sağlayıcı biçimi algılanır, bağlantı doğrulanır ve kullanılabilir modeller yüklenir.</Text>
            <Text style={styles.label}>API anahtarı</Text>
            <View style={styles.inputRow}><TextInput accessibilityLabel="API anahtarı" secureTextEntry autoCapitalize="none" autoCorrect={false} value={key} onChangeText={(value) => { setKey(value); setProvider(undefined); }} placeholder="sk-…" placeholderTextColor="#91A0B4" style={styles.input} /><Pressable accessibilityRole="button" accessibilityLabel="Panodan yapıştır" onPress={paste} style={({ pressed }) => [styles.paste, pressed && styles.pressed]}><MaterialIcons name="content-paste" size={19} color={palette.blue} /></Pressable></View>
            <View style={styles.detectRow}><Text style={styles.detectLabel}>Sağlayıcı</Text><StatusPill label={activeProvider ? supportedProviders.find((item) => item.id === activeProvider)?.label ?? activeProvider : "Otomatik algılanacak"} tone={activeProvider ? "success" : "neutral"} /></View>
            {!detected && key.length > 4 ? <View style={styles.choices}>{supportedProviders.map((item) => <Pressable key={item.id} onPress={() => setProvider(item.id)} style={({ pressed }) => [styles.choice, provider === item.id && styles.choiceActive, pressed && styles.pressed]}><Text style={[styles.choiceText, provider === item.id && styles.choiceTextActive]}>{item.label}</Text></Pressable>)}</View> : null}
            {error ? <View style={styles.error}><MaterialIcons name="error-outline" color={palette.error} size={18} /><Text style={styles.errorText}>{error}</Text></View> : null}
            <PrimaryButton label="Bağlan ve modelleri yükle" icon="bolt" onPress={submit} loading={loading} disabled={!key.trim() || !activeProvider} />
            <Text style={styles.note}>Anahtarın sohbet geçmişine veya olay günlüklerine yazılmaz. Mobil cihazlarda şifreli güvenli depolama kullanılır.</Text>
          </View>
          <Text style={styles.footer}>Çevrimdışı modda mevcut workspace, geçmiş görevler ve artifact’ler erişilebilir kalır.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: palette.background }, grow: { flex: 1 }, container: { flex: 1, justifyContent: "center", padding: 24, gap: 28 }, brand: { alignItems: "center", gap: 10 }, logo: { width: 72, height: 72, borderRadius: 24, backgroundColor: palette.blue, justifyContent: "center", alignItems: "center", shadowColor: palette.blue, shadowOpacity: 0.25, shadowRadius: 16, elevation: 5 }, brandName: { color: palette.navy, fontSize: 25, fontWeight: "900" }, tagline: { color: palette.muted, textAlign: "center", fontSize: 14, lineHeight: 20, maxWidth: 330 }, card: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, padding: 20, borderRadius: 20, gap: 12 }, cardTitle: { color: palette.navy, fontSize: 20, fontWeight: "900" }, cardText: { color: palette.muted, fontSize: 13, lineHeight: 19, marginBottom: 2 }, label: { color: palette.navy, fontWeight: "700", fontSize: 13 }, inputRow: { flexDirection: "row", borderWidth: 1, borderColor: palette.border, borderRadius: 12, overflow: "hidden", minHeight: 50 }, input: { flex: 1, paddingHorizontal: 14, color: palette.navy, fontSize: 14 }, paste: { width: 52, justifyContent: "center", alignItems: "center", backgroundColor: palette.blueSoft }, detectRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 1 }, detectLabel: { color: palette.muted, fontSize: 13 }, choices: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, choice: { borderColor: palette.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }, choiceActive: { borderColor: palette.blue, backgroundColor: palette.blueSoft }, choiceText: { fontSize: 12, color: palette.muted, fontWeight: "700" }, choiceTextActive: { color: palette.blue }, error: { flexDirection: "row", gap: 7, alignItems: "flex-start", backgroundColor: palette.errorSoft, borderRadius: 10, padding: 10 }, errorText: { color: palette.error, fontSize: 12, flex: 1, lineHeight: 17 }, note: { color: palette.muted, fontSize: 11, lineHeight: 16, textAlign: "center", paddingHorizontal: 6 }, footer: { color: palette.muted, fontSize: 12, textAlign: "center", lineHeight: 17 }, pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] } });
