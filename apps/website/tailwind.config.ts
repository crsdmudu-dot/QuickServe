import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Green ecosystem (brand primary)
        primary: '#00875A',
        primaryDark: '#006B47',
        primaryDeep: '#005A3C',
        primaryTint: '#E7F7F0',
        primarySurface: '#F2FBF7',
        // Text / ink
        ink: '#0E1116',
        textSecondary: '#5B6470',
        textTertiary: '#8C939D',
        // Backgrounds
        background: '#FFFFFF',
        surface: '#FFFFFF',
        surfaceMuted: '#F7F8FA',
        backgroundElement: '#F0F0F3',
        // Borders
        border: '#ECEEF1',
        borderStrong: '#D5D8DC',
        // Semantic
        success: '#00875A',
        warning: '#F5A524',
        error: '#E5484D',
        info: '#0EA5E9',
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        pill: '999px',
      },
      fontSize: {
        // [fontSize, { lineHeight, fontWeight }]
        display: ['32px', { lineHeight: '38px', fontWeight: '700' }],
        title: ['24px', { lineHeight: '30px', fontWeight: '700' }],
        heading: ['18px', { lineHeight: '24px', fontWeight: '600' }],
        body: ['16px', { lineHeight: '24px', fontWeight: '400' }],
        label: ['14px', { lineHeight: '20px', fontWeight: '500' }],
        caption: ['12px', { lineHeight: '16px', fontWeight: '400' }],
      },
      spacing: {
        '0.5': '2px',
        '1': '4px',
        '2': '8px',
        '4': '16px',
        '6': '24px',
        '8': '32px',
        '16': '64px',
      },
    },
  },
  plugins: [],
};

export default config;
