'use client';
import { createTheme } from '@mui/material/styles';
import type { ModeKey } from '@/lib/modes';
import { MODE_ACCENT } from './accents';

export { MODE_ACCENT };

/**
 * Avionics MFD, not cyberpunk.
 *
 * Gauntlet's Season 4 variant is jets-only, and the cockpit multi-function
 * displays it borrows from are amber phosphor on a blue-black ground. That is
 * where the palette comes from — a subject link rather than a neon mood.
 *
 * Two accents, one job each: amber carries rank and data, ice carries anything
 * interactive plus the ✈ badge (sky reads as aviation). Nothing else glows.
 *
 * The data accent is per mode. Gauntlet seasons keep the amber; Rapid Royale
 * seasons carry magenta, the other colour a cockpit display draws in, so a
 * glance at the board says which mode a season was ranked on. Ice stays the
 * one interactive colour in both.
 */
export const palette = {
  void: '#06080D',
  panel: '#0C1118',
  line: '#1B2634',
  amber: MODE_ACCENT.gauntlet,
  magenta: MODE_ACCENT.rapidRoyale,
  ice: '#7DE2FF',
  text: '#C9D6E4',
  dim: '#6B7C90',
};

const display = 'var(--font-display), "Trebuchet MS", sans-serif';
const body = 'var(--font-body), system-ui, sans-serif';

const makeTheme = (accent: string) => createTheme({
  palette: {
    mode: 'dark',
    background: { default: palette.void, paper: palette.panel },
    primary: { main: accent },
    secondary: { main: palette.ice },
    text: { primary: palette.text, secondary: palette.dim },
    divider: palette.line,
  },
  typography: {
    fontFamily: body,
    h1: { fontFamily: display, fontWeight: 700, letterSpacing: '0.02em' },
    h4: { fontFamily: display, fontWeight: 700, letterSpacing: '0.04em' },
    h6: { fontFamily: display, fontWeight: 600, letterSpacing: '0.06em' },
    button: { fontFamily: display, textTransform: 'none' },
  },
  shape: { borderRadius: 2 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: 'transparent' },
        // Keyboard focus must stay obvious against a busy ground.
        '*:focus-visible': {
          outline: `2px solid ${palette.ice}`,
          outlineOffset: 2,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          fontFamily: display,
          // MUI shouts tabs in caps by default; sentence case reads as content.
          textTransform: 'none',
          letterSpacing: '0.04em',
          fontSize: '0.95rem',
          color: palette.dim,
          '&.Mui-selected': { color: accent },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 2,
          backgroundColor: accent,
          boxShadow: `0 0 12px ${accent}`,
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: palette.ice,
          textDecorationColor: 'rgba(125,226,255,0.35)',
          textUnderlineOffset: '0.25em',
          '&:hover': { textDecorationColor: palette.ice },
        },
      },
    },
  },
});

export const theme = makeTheme(palette.amber);

/** One theme per mode, differing only in the data accent. */
export const MODE_THEMES: Record<ModeKey, ReturnType<typeof makeTheme>> = {
  gauntlet: theme,
  rapidRoyale: makeTheme(palette.magenta),
};
