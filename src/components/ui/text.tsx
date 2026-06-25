import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { Fonts, Typography, Weights, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextVariant = keyof typeof Typography;

export type AppTextProps = TextProps & {
  variant?: TextVariant;
  color?: ThemeColor;
  weight?: keyof typeof Weights;
};

export function Text({ variant = 'body', color = 'text', weight, style, ...rest }: AppTextProps) {
  const theme = useTheme();
  const variantStyle = Typography[variant] as TextStyle;
  const fontFamily = Fonts.sans;
  const fontWeight = weight ? Weights[weight] : (variantStyle.fontWeight as TextStyle['fontWeight']);
  return (
    <RNText
      style={[
        variantStyle,
        { color: theme[color], fontFamily, fontWeight },
        style,
      ]}
      {...rest}
    />
  );
}
