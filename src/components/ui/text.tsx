import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { Typography, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextVariant = keyof typeof Typography;

export type AppTextProps = TextProps & {
  variant?: TextVariant;
  color?: ThemeColor;
};

export function Text({ variant = 'body', color = 'text', style, ...rest }: AppTextProps) {
  const theme = useTheme();
  return <RNText style={[Typography[variant] as TextStyle, { color: theme[color] }, style]} {...rest} />;
}
