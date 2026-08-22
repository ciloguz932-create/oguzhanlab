import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";

/**
 * Dark-first design system. Token names are stable so every screen (which references
 * palette.*) is re-themed from here. `navy` is the primary TEXT color (light on dark);
 * `brandBlock` is the accent block behind white text (hero, user bubble).
 */
export const palette = {
  navy: "#EEF3FB",
  blue: "#4C9EF2",
  blueSoft: "#16304C",
  background: "#0A0F1A",
  surface: "#111A28",
  surfaceAlt: "#182436",
  border: "#223247",
  muted: "#8DA0BC",
  success: "#3FD79E",
  successSoft: "#0E3327",
  warning: "#FFC663",
  warningSoft: "#392B12",
  error: "#FF7E8B",
  errorSoft: "#3A1B22",
  brandBlock: "#123A63",
  neutralSoft: "#1B2637",
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 };
export const spacing = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 };

export function PrimaryButton({ label, onPress, loading, disabled, tone = "primary", icon }: { label: string; onPress: (event: GestureResponderEvent) => void; loading?: boolean; disabled?: boolean; tone?: "primary" | "secondary" | "danger"; icon?: keyof typeof MaterialIcons.glyphMap }) {
  const isPrimary = tone === "primary";
  const isDanger = tone === "danger";
  const contentColor = isPrimary || isDanger ? "#FFFFFF" : palette.navy;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, isPrimary && styles.buttonPrimary, !isPrimary && !isDanger && styles.buttonSecondary, isDanger && styles.buttonDanger, (disabled || loading) && styles.buttonDisabled, pressed && styles.pressed]}>
      {loading ? <ActivityIndicator color={contentColor} /> : icon ? <MaterialIcons name={icon} size={18} color={contentColor} /> : null}
      <Text style={[styles.buttonText, (isPrimary || isDanger) && styles.buttonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "success" | "warning" | "error" | "info" | "neutral" }) {
  const bg = tone === "success" ? styles.success : tone === "warning" ? styles.warning : tone === "error" ? styles.error : tone === "info" ? styles.info : styles.neutral;
  const color = tone === "success" ? palette.success : tone === "warning" ? palette.warning : tone === "error" ? palette.error : tone === "info" ? palette.blue : palette.muted;
  return <View style={[styles.pill, bg]}><Text style={[styles.pillText, { color }]}>{label}</Text></View>;
}

export function EmptyState({ icon, title, description, action }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; description: string; action?: React.ReactNode }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><MaterialIcons name={icon} size={30} color={palette.blue} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDescription}>{description}</Text>{action ? <View style={styles.emptyAction}>{action}</View> : null}</View>;
}

export function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return <View style={styles.heading}><Text style={styles.headingText}>{title}</Text>{action}</View>;
}

const styles = StyleSheet.create({
  button: { minHeight: 50, paddingHorizontal: 18, borderRadius: radius.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  buttonPrimary: { backgroundColor: palette.blue, shadowColor: palette.blue, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  buttonSecondary: { backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.border },
  buttonDanger: { backgroundColor: palette.error },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: 15, fontWeight: "800", color: palette.navy, letterSpacing: 0.2 },
  buttonTextPrimary: { color: "#FFFFFF" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  pill: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: radius.pill, alignSelf: "flex-start" },
  pillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  success: { backgroundColor: palette.successSoft },
  warning: { backgroundColor: palette.warningSoft },
  error: { backgroundColor: palette.errorSoft },
  info: { backgroundColor: palette.blueSoft },
  neutral: { backgroundColor: palette.neutralSoft },
  empty: { alignItems: "center", paddingHorizontal: 28, paddingVertical: 40, gap: 10 },
  emptyIcon: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: palette.blueSoft, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  emptyTitle: { color: palette.navy, fontSize: 19, fontWeight: "900", textAlign: "center" },
  emptyDescription: { color: palette.muted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  emptyAction: { marginTop: 10, alignSelf: "stretch" },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  headingText: { color: palette.navy, fontWeight: "800", fontSize: 16, letterSpacing: 0.2 },
});
