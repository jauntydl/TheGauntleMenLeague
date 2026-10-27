/**
 * Which of a player's names the board should show.
 *
 * An EA account has one persona per platform, and the name on the scoreboard
 * in game is the platform one, not the EA ID:
 *
 *   TTVLezWin [ea]  + LezWin [steam]      -> LezWin
 *   dirtymcrae [ea] + Dirty McRae [xbox]  -> Dirty McRae
 *   Exclusiive_9    + Exclusiive [steam]  -> Exclusiive
 *
 * The EA ID is usually built from the platform name, because EA IDs must be
 * globally unique and a plain name is normally taken. Sometimes it contains
 * it outright (LezWin -> TTVLezWin) and sometimes the two only share a stem
 * (flounderpounder -> warFlounder). Either way a long run of characters in
 * common is not a coincidence, and that is the signal this uses.
 *
 * EA lists Steam and Xbox personas but never a PlayStation one — verified
 * against every member of this roster, 19 of whom play on PlayStation and
 * none of whom return a ps persona. So `platform` here means "the platform
 * this name came from", never "the platform they play on": a PlayStation
 * player is indistinguishable from a PC one, which is why the board shows no
 * platform beside the name.
 *
 * A persona that looks nothing like the EA ID is a different identity on a
 * platform they may not even play Battlefield on — SPETZNAZ_HALO also owns
 * "Walmart" on Steam and "Hawkster0828" on Xbox. Guessing between those would
 * put a name on the board that nobody recognises, so an unrelated persona is
 * never chosen and the EA ID stands.
 */

export type Persona = { displayName: string; platform: string };

/** Lowercase and drop everything that is not a letter or digit. */
const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * How many characters the two names share in one unbroken run.
 *
 * Six is the floor for calling that a relationship. Five would accept
 * "Heelios 7" as a match for "Heelix_5" on the strength of "heeli", which is
 * a different persona on a different console.
 */
const MIN_SHARED = 6;

function longestSharedRun(a: string, b: string): number {
  // Row-wise longest common substring; the names are short enough that the
  // simple table costs nothing.
  let best = 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        current[j] = previous[j - 1] + 1;
        if (current[j] > best) best = current[j];
      }
    }
    previous = current;
  }
  return best;
}

/**
 * Map a roster platform string to the platform ids EA uses.
 *
 * Roster values are free text from member introductions — "steam pc",
 * "xbox series x", "ps5: kricked_-" — so this matches loosely.
 */
function platformMatches(rosterPlatform: string | undefined, eaPlatform: string): boolean {
  if (!rosterPlatform) return false;
  const r = rosterPlatform.toLowerCase();
  if (eaPlatform === 'steam') return r.includes('steam');
  if (eaPlatform.startsWith('xbox')) return r.includes('xbox');
  if (eaPlatform.startsWith('ps')) return r.includes('ps') || r.includes('playstation');
  return false;
}

/**
 * The name to show for a player, given every persona on their account.
 *
 * Falls back to the EA ID whenever no platform persona is recognisably the
 * same person, which is the safe direction: a stale-looking EA ID is a name
 * people can still match to the roster, while a wrong persona is not.
 */
export function pickInGameName(eaId: string, personas: Persona[]): string {
  const target = normalize(eaId);

  const related = personas
    .filter((p) => p.platform !== 'ea' && normalize(p.displayName).length >= 3)
    .map((p) => {
      const n = normalize(p.displayName);
      // One name inside the other is a match at any length; otherwise they
      // have to share a long enough run to rule out coincidence.
      const contained = n.includes(target) || target.includes(n);
      return { persona: p, shared: contained ? Math.max(n.length, target.length) : longestSharedRun(n, target) };
    })
    .filter((c) => c.shared >= MIN_SHARED);

  if (related.length === 0) return eaId;

  // Several platforms can carry the same identity. The one sharing the most
  // with the EA ID is the least likely to be a coincidental overlap.
  return [...related].sort((a, b) => b.shared - a.shared)[0].persona.displayName;
}

/**
 * The same choice, but preferring the platform the member says they play on.
 *
 * Used when the roster records one. It only ever reorders candidates that
 * already passed the name test, so a stated platform cannot drag in an
 * unrelated persona.
 */
export function pickInGameNameFor(
  eaId: string,
  personas: Persona[],
  rosterPlatform?: string,
): string {
  const preferred = personas.filter((p) => platformMatches(rosterPlatform, p.platform));
  const fromPreferred = preferred.length > 0 ? pickInGameName(eaId, preferred) : eaId;
  return fromPreferred !== eaId ? fromPreferred : pickInGameName(eaId, personas);
}

/**
 * Names set by hand, keyed by EA ID, that win over anything the build
 * resolved. For a member whose in-game name EA does not expose at all, so no
 * persona lookup can ever find it.
 *
 * Applied where the name is shown, not written into roster.json or the board:
 * the build treats inGameName as a cache it may refresh, and archived seasons
 * are frozen, so either place would lose it or miss rows.
 */
export const NAME_OVERRIDES: Record<string, string> = {
  Antimere99: 'OO',
};

/** The name the board shows for a row: an override, the in-game name, or the EA ID. */
export function shownName(row: { eaId: string; inGameName?: string }): string {
  return NAME_OVERRIDES[row.eaId] ?? row.inGameName ?? row.eaId;
}
