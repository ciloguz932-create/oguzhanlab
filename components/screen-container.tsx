import { StyleSheet, View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { palette } from "@/components/agent-ui";
import { cn } from "@/lib/utils";

export interface ScreenContainerProps extends ViewProps {
  /**
   * SafeArea edges to apply. Defaults to ["top", "left", "right"].
   * Bottom is typically handled by Tab Bar.
   */
  edges?: Edge[];
  /**
   * Tailwind className for the content area.
   */
  className?: string;
  /**
   * Additional className for the outer container (background layer).
   */
  containerClassName?: string;
  /**
   * Additional className for the SafeAreaView (content layer).
   */
  safeAreaClassName?: string;
}

/**
 * A container component that properly handles SafeArea and background colors.
 *
 * The outer View extends to full screen (including status bar area) with the background color,
 * while the inner SafeAreaView ensures content is within safe bounds.
 *
 * Usage:
 * ```tsx
 * <ScreenContainer className="p-4">
 *   <Text className="text-2xl font-bold text-foreground">
 *     Welcome
 *   </Text>
 * </ScreenContainer>
 * ```
 */
export function ScreenContainer({
  children,
  edges = ["top", "left", "right"],
  className,
  containerClassName,
  safeAreaClassName,
  style,
  ...props
}: ScreenContainerProps) {
  // Layout fill is expressed with explicit `flex: 1` styles, NOT the nativewind
  // `flex-1` class: on the native (Android) build that class does not reliably
  // apply, which left the dark background covering only the content and the rest
  // of the screen white. Explicit styles guarantee every layer fills the screen.
  return (
    <View
      className={cn(containerClassName)}
      style={[styles.fill, { backgroundColor: palette.background }]}
      {...props}
    >
      <SafeAreaView edges={edges} className={cn(safeAreaClassName)} style={[styles.fill, style]}>
        <View className={cn(className)} style={styles.fill}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
