/**
 * animated-icon.tsx
 *
 * Premium branded splash overlay — no Reanimated, no worklets.
 * Uses only React Native's built-in `Animated` API.
 *
 * Contract (must not change):
 *   - `AnimatedSplashOverlay` is mounted once by `_layout.tsx`.
 *   - It renders an absolute-fill overlay above the app.
 *   - After the reveal animation finishes it calls `setVisible(false)`
 *     and returns `null`, letting the app underneath show through.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { prefersReducedMotion } from '@/constants/motion';
import { Colors, Typography } from '@/constants/theme';

// ─── Brand tokens ────────────────────────────────────────────────────────────
const GRADIENT_FROM = Colors.light.primaryDeep; // #005A3C — deep authority green
const GRADIENT_TO   = Colors.light.primary;     // #00875A — brand green

// ─── Timing (total ≈ 1 400 ms, same as the old Keyframe animation) ───────────
const T_LOGO_IN      = 420; // logo + wordmark fade/scale in
const T_GLYPH_STAGGER = 60; // delay between each service glyph
const T_TAGLINE_IN   = 300; // tagline fades in after glyphs
const T_HOLD         = 300; // hold everything visible
const T_OUT          = 280; // final fade-out

// Sparse service glyphs shown around the wordmark
const GLYPHS = ['⚡', '🔧', '🧹', '🎨', '🛠️'] as const;

// ─── Component ───────────────────────────────────────────────────────────────
export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);

  // --- Animated values ---
  // Logo mark
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale   = useRef(new Animated.Value(0.85)).current;

  // Wordmark
  const wordOpacity = useRef(new Animated.Value(0)).current;

  // Service glyphs (one value per glyph)
  const glyphOpacities = useRef(GLYPHS.map(() => new Animated.Value(0))).current;
  const glyphScales    = useRef(GLYPHS.map(() => new Animated.Value(0.7))).current;

  // Tagline
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  // Whole-screen exit fade
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      const reduced = await prefersReducedMotion();

      if (reduced) {
        // Static branded frame — no motion, dismiss after short hold
        logoOpacity.setValue(1);
        logoScale.setValue(1);
        wordOpacity.setValue(1);
        timer = setTimeout(() => setVisible(false), 800);
        return;
      }

      // ── Phase 1: logo mark + wordmark reveal ──────────────────────────────
      const logoReveal = Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: T_LOGO_IN,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: T_LOGO_IN,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(wordOpacity, {
          toValue: 1,
          duration: T_LOGO_IN,
          delay: 80, // wordmark trails the mark slightly
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);

      // ── Phase 2: service glyphs stagger in ───────────────────────────────
      const glyphAnimations = GLYPHS.map((_, i) =>
        Animated.parallel([
          Animated.timing(glyphOpacities[i], {
            toValue: 0.55, // low-opacity → elegant, not cluttered
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(glyphScales[i], {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.back(1.4)),
            useNativeDriver: true,
          }),
        ])
      );
      const glyphStagger = Animated.stagger(T_GLYPH_STAGGER, glyphAnimations);

      // ── Phase 3: tagline ─────────────────────────────────────────────────
      const taglineReveal = Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: T_TAGLINE_IN,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });

      // ── Phase 4: hold ────────────────────────────────────────────────────
      const hold = Animated.delay(T_HOLD);

      // ── Phase 5: exit fade ───────────────────────────────────────────────
      const exit = Animated.timing(containerOpacity, {
        toValue: 0,
        duration: T_OUT,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      });

      // ── Sequence: reveal → glyphs+tagline → hold → exit ──────────────────
      Animated.sequence([
        logoReveal,
        Animated.parallel([glyphStagger, taglineReveal]),
        hold,
        exit,
      ]).start(({ finished }) => {
        if (finished) setVisible(false);
      });
    })();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      {/* Full-screen gradient backdrop */}
      <LinearGradient
        colors={[GRADIENT_FROM, GRADIENT_TO]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Sparse service glyphs — staggered, low-opacity */}
      <View style={styles.glyphRing} pointerEvents="none">
        {GLYPHS.map((glyph, i) => (
          <Animated.Text
            key={glyph}
            style={[
              styles.glyph,
              {
                opacity: glyphOpacities[i],
                transform: [{ scale: glyphScales[i] }],
              },
            ]}>
            {glyph}
          </Animated.Text>
        ))}
      </View>

      {/* Logo mark */}
      <Animated.View
        style={[
          styles.markContainer,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}>
        <Text style={styles.markEmoji}>⚡</Text>
      </Animated.View>

      {/* Wordmark */}
      <Animated.Text style={[styles.wordmark, { opacity: wordOpacity }]}>
        QuickServe
      </Animated.Text>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        Trusted professionals · Fast service
      </Animated.Text>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 5 glyphs laid out in a horizontal row, centered, sparse spacing
  glyphRing: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 28,
    // Sit slightly above the mark
    top: '35%',
  },
  glyph: {
    fontSize: 22,
  },
  markContainer: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  markEmoji: {
    fontSize: 48,
  },
  wordmark: {
    ...Typography.display,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  tagline: {
    ...Typography.caption,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 10,
    letterSpacing: 0.2,
  },
});
