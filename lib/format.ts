/**
 * Number formatting shared by the board and the places that quote it (the
 * join form, the signup notification). Locale pinned: the server and the
 * browser can disagree on it, and that is a hydration mismatch.
 */
const INT = new Intl.NumberFormat('en-US');
const MINUS = '−';
const DASH = '—';

/**
 * A points total as the board shows it: a whole number with thousands
 * separators and a true minus sign. The half point an assist earns rounds
 * away from zero for display only; sorting is on the exact value. `== null`
 * so a row from before the ledger existed shows a dash rather than NaN.
 */
export const fmtPoints = (v: number | null | undefined): string => {
  if (v == null) return DASH;
  const whole = Math.round(Math.abs(v));
  return `${v < 0 && whole > 0 ? MINUS : ''}${INT.format(whole)}`;
};
