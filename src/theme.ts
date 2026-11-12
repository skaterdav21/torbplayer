export const colors = {
  bg: '#0E0F13',
  surface: '#171920',
  surfaceRaised: '#1F222B',
  border: '#2A2E39',
  text: '#F2F3F5',
  textMuted: '#9AA0AE',
  textFaint: '#666C7A',
  accent: '#7B93FF',
  accentText: '#0E0F13',
  good: '#3FCF8E',
  warn: '#F5B544',
  bad: '#F06B6B',
  cached: '#F7D154',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;

export const type = {
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textMuted },
  tiny: { fontSize: 11, color: colors.textMuted },
};
