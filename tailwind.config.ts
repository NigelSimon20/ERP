import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        brand: {
          // Primary — Infinity Nexa blue (www.nexainventory.com / www.infinitynexa.co.zw)
          primary: '#1E40AF',
          'primary-dark': '#1B3A96',
          'primary-light': '#DBEAFE',
          'primary-lighter': '#EFF6FF',
          sky: '#38BDF8',
          // Ink — the brand's deep navy
          navy: '#0A1733',
          'navy-light': '#13244A',
          'navy-dark': '#071026',
          // Blue scale (brand-50 … brand-700 on the websites)
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#1E40AF',
          700: '#1B3A96',
          // Surfaces
          light: '#F8FAFC',
          white: '#FFFFFF',
          // Text
          muted: '#676C75',
          'muted-light': '#94A3B8',
          // Structural
          border: '#E2E4E8',
          // Semantic (not brand colours: red stays for errors and destructive actions)
          success: '#02985F',
          warning: '#E49E22',
          danger: '#DF202E',
          info: '#0091CC',
        },
      },
      fontFamily: {
        // Infinity Nexa: Nunito Sans for text, Chillax for headings (app/layout.tsx)
        sans: ['var(--font-nunito-sans)', 'Nunito Sans', 'system-ui', 'sans-serif'],
        display: ['var(--font-chillax)', 'var(--font-nunito-sans)', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        card: '16px',
        btn: '10px',
        field: '10px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08)',
        dropdown: '0 16px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)',
        topbar: '0 1px 0 #E5E7EB',
        'focus-primary': '0 0 0 3px rgba(30,64,175,0.15)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
        'slide-in-right': 'slide-in-right 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
