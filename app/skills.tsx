import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, palette, PrimaryButton, StatusPill, useContentWidthStyle } from "@/components/agent-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAgent } from "@/lib/agent/agent-provider";
import type { Skill } from "@/lib/agent/types";

function SkillCard({ skill }: { skill: Skill }) {
  const { setSkillEnabled, removeSkill } = useAgent();
  return (
    <View style={[styles.card, !skill.enabled && styles.cardOff]}>
      <View style={styles.cardTop}>
        <View style={styles.icon}><MaterialIcons name="auto-awesome" size={20} color={palette.blue} /></View>
        <View style={styles.cardCopy}>
          <View style={styles.nameRow}><Text style={styles.name}>{skill.name}</Text><StatusPill label={skill.builtin ? "YERLEŞİK" : "ÖZEL"} tone={skill.builtin ? "info" : "neutral"} /></View>
          <Text style={styles.desc}>{skill.description}</Text>
        </View>
        <Switch value={skill.enabled} onValueChange={(value) => setSkillEnabled(skill.id, value)} trackColor={{ false: "#CFD8E3", true: "#8FCDF0" }} thumbColor={skill.enabled ? palette.blue : "#FFFFFF"} />
      </View>
      {skill.keywords.length ? <Text style={styles.meta}>Tetikleyiciler: {skill.keywords.slice(0, 8).join(", ")}</Text> : null}
      {skill.toolRequirements.length ? <Text style={styles.meta}>Araçlar: {skill.toolRequirements.join(", ")}</Text> : null}
      {!skill.builtin ? <Pressable onPress={() => removeSkill(skill.id)} style={({ pressed }) => [styles.remove, pressed && styles.pressed]}><MaterialIcons name="delete-outline" size={16} color={palette.error} /><Text style={styles.removeText}>Sil</Text></Pressable> : null}
    </View>
  );
}

export default function SkillsScreen() {
  const { state, addSkill } = useAgent();
  const contentWidth = useContentWidthStyle();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [keywords, setKeywords] = useState("");
  const [error, setError] = useState<string>();
  const save = () => {
    try {
      addSkill({ name, description, instructions, keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean) });
      setName(""); setDescription(""); setInstructions(""); setKeywords(""); setError(undefined); setVisible(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Yetenek eklenemedi.");
    }
  };
  return (
    <ScreenContainer className="flex-1">
      <FlatList
        data={state.skills}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.content, contentWidth]}
        ListHeaderComponent={<View style={styles.header}><Text style={styles.title}>Yetenekler</Text><Text style={styles.subtitle}>Yetenekler, göreve uygun uzmanlık talimatlarını ve model tercihini agent’a otomatik ekler. İlgili olanlar hedefe göre kendiliğinden etkinleşir.</Text><PrimaryButton label="Özel yetenek ekle" icon="add" onPress={() => setVisible(true)} /></View>}
        ListEmptyComponent={<EmptyState icon="auto-awesome" title="Yetenek yok" description="Yerleşik yetenekler yüklenemedi." />}
        renderItem={({ item }) => <SkillCard skill={item} />}
      />
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={styles.modalWrap}><View style={[styles.modal, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
          <Text style={styles.modalTitle}>Özel yetenek</Text>
          <Text style={styles.modalText}>Talimatlar, uygun görevlerde agent’ın sistem istemine eklenir. Tetikleyici kelimeler hangi hedeflerde etkinleşeceğini belirler.</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Ad (örn. Sözleşme İnceleyici)" placeholderTextColor="#91A0B4" style={styles.input} />
          <TextInput value={description} onChangeText={setDescription} placeholder="Kısa açıklama" placeholderTextColor="#91A0B4" style={styles.input} />
          <TextInput value={instructions} onChangeText={setInstructions} placeholder="Talimatlar (agent'a nasıl davranacağı)" placeholderTextColor="#91A0B4" multiline style={styles.textarea} />
          <TextInput value={keywords} onChangeText={setKeywords} placeholder="Tetikleyici kelimeler (virgülle)" placeholderTextColor="#91A0B4" style={styles.input} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.modalActions}><PrimaryButton label="Vazgeç" tone="secondary" onPress={() => setVisible(false)} /><PrimaryButton label="Kaydet" icon="add" onPress={save} /></View>
        </View></View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 30, gap: 12 },
  header: { gap: 8, marginBottom: 5 },
  title: { color: palette.navy, fontWeight: "900", fontSize: 24 },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 19, marginBottom: 5 },
  card: { borderWidth: 1, borderColor: palette.border, borderRadius: 16, padding: 14, backgroundColor: palette.surface, gap: 8 },
  cardOff: { opacity: 0.6 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  icon: { width: 40, height: 40, backgroundColor: palette.blueSoft, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  cardCopy: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: { color: palette.navy, fontWeight: "900", fontSize: 15 },
  desc: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  meta: { color: "#8997A9", fontSize: 11, lineHeight: 16 },
  remove: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingTop: 2 },
  removeText: { color: palette.error, fontSize: 12, fontWeight: "800" },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(16,36,62,0.24)" },
  modal: { backgroundColor: palette.surface, padding: 22, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 11 },
  modalTitle: { color: palette.navy, fontSize: 20, fontWeight: "900" },
  modalText: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  input: { height: 47, borderWidth: 1, borderColor: palette.border, borderRadius: 11, paddingHorizontal: 13, color: palette.navy, fontSize: 13 },
  textarea: { minHeight: 84, borderWidth: 1, borderColor: palette.border, borderRadius: 11, padding: 13, color: palette.navy, fontSize: 13, textAlignVertical: "top" },
  error: { color: palette.error, fontSize: 12 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 9, marginTop: 4 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
