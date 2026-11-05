import { describe, expect, it } from 'vitest';
import { checkDraft } from './draftCheck';

const original = "I'm a carrier, which means I'm healthy. Can we talk?";

describe('drafting-mode check', () => {
  it('passes a gentle rewrite in the right language', () => {
    expect(checkDraft("When you have a moment, could we talk? I'm a carrier, which means I'm healthy.", original, 'en')).toEqual([]);
    expect(checkDraft('هل يمكننا أن نتحدث؟ أحمل صفة وراثية، وهذا يعني أنني بصحة جيدة.', original, 'ar')).toEqual([]);
  });

  it('catches pressure, guilt and ultimatums, but not "you don\'t have to"', () => {
    expect(checkDraft('You must get tested this week.', original, 'en')).toContain('pressure');
    expect(checkDraft("If you don't talk to me, I'll tell everyone.", original, 'en')).toContain('pressure');
    expect(checkDraft("It's your fault we're in this situation.", original, 'en')).toContain('pressure');
    expect(checkDraft('يجب عليك أن تجري الفحص.', original, 'ar')).toContain('pressure');
    expect(checkDraft("You don't have to share your result with me.", original, 'en')).not.toContain('pressure');
  });

  it('keeps carriers healthy, short, in the right language, with no new numbers', () => {
    expect(checkDraft("I'm a carrier, so I'm ill.", original, 'en')).toContain('carrier_not_healthy');
    expect(checkDraft('word '.repeat(85), original, 'en')).toContain('too_long');
    expect(checkDraft("I'm a carrier and healthy.", original, 'ar')).toContain('wrong_language');
    expect(checkDraft("There's a 25% chance for each pregnancy.", original, 'en')).toContain('new_numbers');
  });
});
