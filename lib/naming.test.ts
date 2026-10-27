import { describe, it, expect } from 'vitest';
import { pickInGameName, pickInGameNameFor, type Persona, shownName } from './naming';

const p = (displayName: string, platform: string): Persona => ({ displayName, platform });

describe('pickInGameName', () => {
  // Every case below is a real account, read from EA through gametools.
  it('prefers the platform persona the EA ID was built from', () => {
    expect(pickInGameName('TTVLezWin', [p('TTVLezWin', 'ea'), p('LezWin', 'steam')])).toBe('LezWin');
    expect(pickInGameName('Exclusiive_9', [p('Exclusiive', 'steam'), p('Exclusiive_9', 'ea')])).toBe(
      'Exclusiive',
    );
    expect(pickInGameName('Zenith13', [p('Zenith13', 'ea'), p('Zenith', 'steam')])).toBe('Zenith');
    expect(pickInGameName('ZD4NIM4L', [p('ZD4NIM4L', 'ea'), p('D4NIM4L', 'steam')])).toBe('D4NIM4L');
  });

  it('matches a shared stem, not just one name inside the other', () => {
    // warFlounder on EA is flounderpounder on Steam: neither contains the
    // other, but eight characters in common is not an accident.
    expect(
      pickInGameName('warFlounder', [
        p('flounderpounder', 'steam'),
        p('WarFlounder', 'ea'),
      ]),
    ).toBe('flounderpounder');
  });

  it('sees through punctuation, case and spacing', () => {
    // "dirtymcrae" and "Dirty McRae" are the same name to everyone but a
    // string comparison.
    expect(pickInGameName('dirtymcrae', [p('Dirty McRae', 'xboxone'), p('dirtymcrae', 'ea')])).toBe(
      'Dirty McRae',
    );
    expect(
      pickInGameName('Excited_Pianist', [
        p('Excited Pianist', 'xboxone'),
        p('Excited_Pianist', 'ea'),
        p('SirBuckFutt59', 'xboxone'),
      ]),
    ).toBe('Excited Pianist');
  });

  it('ignores a persona that is a different identity', () => {
    // SPETZNAZ_HALO also owns Walmart on Steam and Hawkster0828 on Xbox.
    // Nobody on the board would recognise either, so the EA ID stands.
    expect(
      pickInGameName('SPETZNAZ_HALO', [
        p('SPETZNAZ_HALO', 'ea'),
        p('Hawkster0828', 'xboxone'),
        p('Walmart', 'steam'),
      ]),
    ).toBe('SPETZNAZ_HALO');
    expect(pickInGameName('EnriqueTheKid', [p('Young Pressa', 'xboxone'), p('EnriqueTheKid', 'ea')])).toBe(
      'EnriqueTheKid',
    );
  });

  it('picks the closest when one identity spans several platforms', () => {
    expect(
      pickInGameName('Heelix_5', [p('Heelix', 'steam'), p('Heelix_5', 'ea'), p('Heelios 7', 'xboxone')]),
    ).toBe('Heelix');
  });

  it('keeps the EA ID when there is nothing else', () => {
    expect(pickInGameName('CyclonicNinja', [p('CyclonicNinja', 'ea')])).toBe('CyclonicNinja');
    expect(pickInGameName('sfw421', [])).toBe('sfw421');
  });

  it('will not match on a fragment too short to mean anything', () => {
    // "GG" appears inside half the EA IDs in the game.
    expect(pickInGameName('VanzzGG', [p('GG', 'steam'), p('VanzzGG', 'ea')])).toBe('VanzzGG');
    // Five shared characters is where coincidence still lives: "Heelios 7"
    // shares "heeli" with "Heelix_5" and is a different person's console.
    expect(pickInGameName('Heelix_5', [p('Heelios 7', 'xboxone'), p('Heelix_5', 'ea')])).toBe('Heelix_5');
  });
});

describe('pickInGameNameFor', () => {
  it('prefers the platform the member says they play on', () => {
    const personas = [p('kricked', 'ea'), p('kricked', 'xboxone'), p('kricked', 'steam')];
    expect(pickInGameNameFor('kricked', personas, 'steam pc')).toBe('kricked');
  });

  it('never lets a stated platform drag in an unrelated persona', () => {
    // He says Steam, and his Steam persona is "Walmart" — still not a name
    // this board can put next to his stats.
    expect(
      pickInGameNameFor(
        'SPETZNAZ_HALO',
        [p('SPETZNAZ_HALO', 'ea'), p('Walmart', 'steam')],
        'steam',
      ),
    ).toBe('SPETZNAZ_HALO');
  });

  it('falls back to the whole set when the stated platform has no persona', () => {
    expect(
      pickInGameNameFor('TTVLezWin', [p('TTVLezWin', 'ea'), p('LezWin', 'steam')], 'ps5'),
    ).toBe('LezWin');
  });
});

describe('shownName', () => {
  it('prefers a hand-set name over the resolved one and the EA ID', () => {
    expect(shownName({ eaId: 'Antimere99', inGameName: 'Antimere99' })).toBe('OO');
    expect(shownName({ eaId: 'HoRR1DDD', inGameName: 'HoRR1DDD' })).toBe('D3VouRR');
  });

  it('falls back to the in-game name, then the EA ID', () => {
    expect(shownName({ eaId: 'TTVLezWin', inGameName: 'LezWin' })).toBe('LezWin');
    expect(shownName({ eaId: 'TTVLezWin' })).toBe('TTVLezWin');
  });
});
