// Paste into tailwind.config.(js|ts) under theme.extend
module.exports = {
  colors: {
    bg: '#FFF7F0',
    surface: '#FFFFFF',
    line: { DEFAULT: '#F1E3D8', strong: '#E7D7CA' },
    ink: { DEFAULT: '#141414', soft: '#3A3532' },
    muted: '#5C5550',
    brand: {
      DEFAULT: '#FF5A1F',
      hover: '#FF7440',
      text: '#C2410C',
      'text-dark': '#9A3412',
      tint: '#FFEDE2',
      'tint-soft': '#FFF1E7',
      ring: '#FFD9C7',
    },
    affected: { DEFAULT: '#9F1239', tint: '#FDE2E2' },
    unaffected: '#15803D',
    success: { tint: '#E7F6EC', text: '#166534' },
    info: { tint: '#E5ECF6', text: '#1E3A8A' },
    danger: '#B91C1C',
    bead: { typical: '#EFE7E1' },
    neutral: { line: '#BFAEA2', fill: '#E7DED6' },
  },
  borderRadius: { card: '20px', input: '14px', tile: '16px' },
  boxShadow: { card: '0 8px 24px rgba(60,30,10,0.06)' },
  fontFamily: {
    sans: ['"Plus Jakarta Sans"', '"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
  },
  maxWidth: { page: '1240px' },
};
