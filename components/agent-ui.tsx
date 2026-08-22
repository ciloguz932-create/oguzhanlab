import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";

// Dark-first palette. Token names are kept stable (screens reference palette.*), so
// flipping the values here re-themes the whole app. `navy` is the primary TEXT color
// (light on dark); `brandBlock` is the dark navy block used behind white text
// (hero, user message bubble). Aligned with theme.config.js dark tokens so the
// nativewind-backed screen backgrounds and these inline colors stay consistent.
export const palette = {
  navy: "#EAF2FF",
  blue: "#42B6F5",
  blueSoft: "#12314A",
  background: "#0B1220",
  surface: "#121D2E",
  border: "#27364A",
  muted: "#9BACBF",
  success: "#45D6A4",
  successSoft: "#0F3327",
  warning: "#FFC561",
  warningSoft: "#3A2C12",
  error: "#FF8893",
  errorSoft: "#3A1A22",
  brandBlock: "#0E2740",
  neutralSoft: "#1C293A",
};

export function PrimaryButton({ label, onPress, loading, disabled, tone = "primary", icon }: { label: string; onPress: (event: GestureResponderEvent) => void; loading?: boolean; disabled?: boolean; tone?: "primary" | "secondary" | "danger"; icon?: keyof typeof MaterialIcons.glyphMap }) {
  const isPrimary = tone === "primary";
  const isDanger = tone === "danger";
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, isPrimary && styles.buttonPrimary, !isPrimary && styles.buttonSecondary, isDanger && styles.buttonDanger, (disabled || loading) && styles.buttonDisabled, pressed && styles.pressed]}>
      {loading ? <ActivityIndicator color={isPrimary || isDanger ? "#FFFFFF" : palette.navy} /> : icon ? <MaterialIcons name={icon} size={18} color={isPrimary || isDanger ? "#FFFFFF" : palette.navy} /> : null}
      <Text style={[styles.buttonText, isPrimary && styles.buttonTextPrimary, isDanger && styles.buttonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "success" | "warning" | "error" | "info" | "neutral" }) {
  const style = tone === "success" ? styles.success : tone === "warning" ? styles.warning : tone === "error" ? styles.error : tone === "info" ? styles.info : styles.neutral;
  return <View style={[styles.pill, style]}><Text style={[styles.pillText, tone === "success" ? { color: palette.success } : tone === "warning" ? { color: palette.warning } : tone === "error" ? { color: palette.error } : tone === "info" ? { color: palette.blue } : { color: palette.muted }]}>{label}</Text></View>;
}

export function EmptyState({ icon, title, description, action }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; description: string; action?: React.ReactNode }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><MaterialIcons name={icon} size={28} color={palette.blue} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDescription}>{description}</Text>{action}</View>;
}

export function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return <View style={styles.heading}><Text style={styles.headingText}>{title}</Text>{action}</View>;
}

const styles = StyleSheet.create({
  button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  buttonPrimary: { backgroundColor: palette.blue },
  buttonSecondary: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  buttonDanger: { backgroundColor: palette.error },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 14, fontWeight: "700", color: palette.navy },
  buttonTextPrimary: { color: "#FFFFFF" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, alignSelf: "flex-start" },
  pillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  success: { backgroundColor: palette.successSoft },
  warning: { backgroundColor: palette.warningSoft },
  error: { backgroundColor: palette.errorSoft },
  info: { backgroundColor: palette.blueSoft },
  neutral: { backgroundColor: palette.neutralSoft },
  empty: { alignItems: "center", paddingHorizontal: 30, paddingVertical: 34, gap: 9 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: palette.blueSoft, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { color: palette.navy, fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptyDescription: { color: palette.muted, fontSize: 14, lineHeight: 20, textAlign: "center", marginBottom: 8 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  headingText: { color: palette.navy, fontWeight: "800", fontSize: 16 },
});
