import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--rgb-bg) / <alpha-value>)',
        surface: 'rgb(var(--rgb-surface) / <alpha-value>)',
        fg: 'rgb(var(--rgb-text) / <alpha-value>)',
        muted: 'rgb(var(--rgb-text-muted) / <alpha-value>)',
        primary: 'rgb(var(--rgb-primary) / <alpha-value>)',
        'primary-soft': 'rgb(var(--rgb-primary-soft) / <alpha-value>)',
        accent: 'rgb(var(--rgb-accent) / <alpha-value>)',
        success: 'rgb(var(--rgb-success) / <alpha-value>)',
        divider: 'rgb(var(--rgb-divider) / <alpha-value>)',
        pinyin: 'rgb(var(--rgb-pinyin) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        pinyin: ['var(--font-pinyin)'],
      },
    },
  },
  corePlugins: {
    gradientColorStops: false,
    backgroundImage: false,
    backdropFilter: false,
    backdropBlur: false,
    blur: false,
  },
  plugins: [],
} satisfies Config;
