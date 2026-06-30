/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./**/*.njk'],
  theme: {
    extend: {
      colors: {
        'accent': {
          50: 'color-mix(in srgb, rgba(var(--cl-accent), <alpha-value>) 5%, white)',
          100: 'color-mix(in srgb, rgba(var(--cl-accent), <alpha-value>) 10%, white)',
          200: 'color-mix(in srgb, rgba(var(--cl-accent), <alpha-value>) 30%, white)',
          300: 'color-mix(in srgb, rgba(var(--cl-accent), <alpha-value>) 50%, white)',
          400: 'color-mix(in srgb, rgba(var(--cl-accent), <alpha-value>) 70%, white)',
          500: 'rgba(var(--cl-accent), <alpha-value>)',
          600: 'color-mix(in srgb, rgba(var(--cl-accent), <alpha-value>), black 10%)',
          700: 'color-mix(in srgb, rgba(var(--cl-accent), <alpha-value>), black 30%)',
          800: 'color-mix(in srgb, rgba(var(--cl-accent), <alpha-value>), black 50%)',
          900: 'color-mix(in srgb, rgba(var(--cl-accent), <alpha-value>), black 70%)'
        },
        't-primary': 'rgba(var(--cl-t-primary), <alpha-value>)',
        't-accent': 'rgba(var(--cl-t-accent), <alpha-value>)',
        'background': 'rgba(var(--cl-background), <alpha-value>)',
        'card': 'rgba(var(--cl-card), <alpha-value>)',
      },
      keyframes: {
        'announcement-fade': {
          '0%': { opacity: '0' },
          '50%': { opacity: '1' },
          '100%': { opacity: '0' },
        }
      },
      animation: {
        'announcement-fade': 'announcement-fade 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: []
}
