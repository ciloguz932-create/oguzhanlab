import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent } from "react-native";

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
/** Type scale — used for consistent hierarchy across screens. */
export const type = {
  display: { fontSize: 25, fontWeight: "900" as const, letterSpacing: 0.2 },
  title: { fontSize: 20, fontWeight: "900" as const },
  heading: { fontSize: 16, fontWeight: "800" as const, letterSpacing: 0.2 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 17 },
  eyebrow: { fontSize: 10, fontWeight: "800" as const, letterSpacing: 1.1 },
};

/**
 * Single responsive source of truth. Breakpoints: phone < 700 < tablet < 1000 <= wide.
 * `maxContentWidth` keeps text/lists from stretching edge-to-edge on web/desktop; screens
 * spread `contentWidthStyle` into their FlatList contentContainerStyle to opt in.
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 700;
  const isWide = width >= 1000;
  const maxContentWidth = isWide ? 940 : isTablet ? 700 : width;
  return { width, height, isTablet, isWide, maxContentWidth };
}

/** Centers content and caps its width on wide viewports; a no-op on phones. */
export function useContentWidthStyle() {
  const { maxContentWidth } = useResponsive();
  return { width: "100%" as const, maxWidth: maxContentWidth, alignSelf: "center" as const };
}

export function PrimaryButton({ label, onPress, loading, disabled, tone = "primary", icon }: { label: string; onPress: (event: GestureResponderEvent) => void; loading?: boolean; disabled?: boolean; tone?: "primary" | "secondary" | "danger"; icon?: keyof typeof MaterialIcons.glyphMap }) {
  const isPrimary = tone === "primary";
  const isDanger = tone === "danger";
  const contentColor = isPrimary || isDanger ? "#FFFFFF" : palette.navy;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!(disabled || loading) }} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, isPrimary && styles.buttonPrimary, !isPrimary && !isDanger && styles.buttonSecondary, isDanger && styles.buttonDanger, (disabled || loading) && styles.buttonDisabled, pressed && styles.pressed]}>
      {loading ? <ActivityIndicator color={contentColor} /> : icon ? <MaterialIcons name={icon} size={18} color={contentColor} /> : null}
      <Text style={[styles.buttonText, (isPrimary || isDanger) && styles.buttonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

/** Convenience wrappers so intent is explicit at call sites (map to PrimaryButton tones). */
export function SecondaryButton(props: Omit<Parameters<typeof PrimaryButton>[0], "tone">) {
  return <PrimaryButton {...props} tone="secondary" />;
}
export function DestructiveButton(props: Omit<Parameters<typeof PrimaryButton>[0], "tone">) {
  return <PrimaryButton {...props} tone="danger" />;
}

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "success" | "warning" | "error" | "info" | "neutral" }) {
  const bg = tone === "success" ? styles.success : tone === "warning" ? styles.warning : tone === "error" ? styles.error : tone === "info" ? styles.info : styles.neutral;
  const color = tone === "success" ? palette.success : tone === "warning" ? palette.warning : tone === "error" ? palette.error : tone === "info" ? palette.blue : palette.muted;
  // Icon backs up color so status is never communicated by color alone (accessibility).
  const icon = tone === "success" ? "check-circle" : tone === "warning" ? "schedule" : tone === "error" ? "error" : tone === "info" ? "bolt" : "circle";
  return <View accessibilityRole="text" style={[styles.pill, bg]}><MaterialIcons name={icon as keyof typeof MaterialIcons.glyphMap} size={11} color={color} /><Text style={[styles.pillText, { color }]}>{label}</Text></View>;
}

/** Screen title block. Optional eyebrow + trailing action; consistent across screens. */
export function PageHeader({ title, subtitle, eyebrow, action }: { title: string; subtitle?: string; eyebrow?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderText}>
        {eyebrow ? <Text style={styles.pageEyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.pageTitle} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {action ? <View style={styles.pageHeaderAction}>{action}</View> : null}
    </View>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; description: string; action?: React.ReactNode }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><MaterialIcons name={icon} size={30} color={palette.blue} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDescription}>{description}</Text>{action ? <View style={styles.emptyAction}>{action}</View> : null}</View>;
}

/** Visible loading state — never a blank screen. */
export function LoadingState({ label = "Yükleniyor…" }: { label?: string }) {
  return <View style={styles.centerState} accessibilityRole="text"><ActivityIndicator color={palette.blue} /><Text style={styles.centerStateText}>{label}</Text></View>;
}

/** Visible, recoverable error state. */
export function ErrorState({ title = "Bir sorun oluştu", description, onRetry }: { title?: string; description: string; onRetry?: () => void }) {
  return (
    <View style={styles.centerState} accessibilityRole="alert">
      <View style={styles.errorIcon}><MaterialIcons name="error-outline" size={28} color={palette.error} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {onRetry ? <View style={styles.emptyAction}><PrimaryButton label="Yeniden dene" icon="refresh" tone="secondary" onPress={onRetry} /></View> : null}
    </View>
  );
}

export function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return <View style={styles.heading}><Text style={styles.headingText} accessibilityRole="header">{title}</Text>{action}</View>;
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
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, alignSelf: "flex-start" },
  pillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  success: { backgroundColor: palette.successSoft },
  warning: { backgroundColor: palette.warningSoft },
  error: { backgroundColor: palette.errorSoft },
  info: { backgroundColor: palette.blueSoft },
  neutral: { backgroundColor: palette.neutralSoft },
  pageHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  pageHeaderText: { flex: 1, gap: 5 },
  pageHeaderAction: { paddingTop: 2 },
  pageEyebrow: { color: palette.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  pageTitle: { color: palette.navy, fontSize: 25, fontWeight: "900", letterSpacing: 0.2 },
  pageSubtitle: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  empty: { alignItems: "center", paddingHorizontal: 28, paddingVertical: 40, gap: 10 },
  emptyIcon: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: palette.blueSoft, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  emptyTitle: { color: palette.navy, fontSize: 19, fontWeight: "900", textAlign: "center" },
  emptyDescription: { color: palette.muted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  emptyAction: { marginTop: 10, alignSelf: "stretch" },
  centerState: { alignItems: "center", justifyContent: "center", paddingHorizontal: 28, paddingVertical: 44, gap: 12 },
  centerStateText: { color: palette.muted, fontSize: 14 },
  errorIcon: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: palette.errorSoft, alignItems: "center", justifyContent: "center" },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  headingText: { color: palette.navy, fontWeight: "800", fontSize: 16, letterSpacing: 0.2 },
});
