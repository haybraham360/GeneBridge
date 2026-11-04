import type { Config } from 'tailwindcss';
// Design tokens exported from the design canvas (design/tailwind.theme.js).
import designTheme from './design/tailwind.theme.js';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    // The token's font stack names the real families. next/font registers them
    // under those names (loaded via the font classes on <html>), so Latin uses
    // Plus Jakarta Sans and Arabic falls through to IBM Plex Sans Arabic.
    extend: designTheme,
  },
};

export default config;
