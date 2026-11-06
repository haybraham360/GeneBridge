import { describe, expect, it } from 'vitest';
import { containsAnyName, findNames, maskText, newNameMap, unmaskText } from './mask';

const demoEn =
  "My father Ahmed has a brother, Saeed, who has beta-thalassemia major. My husband Khalid is Saeed's son. My mother's mother, Noura, had hearing problems, but I'm not sure if it was genetic.";
const demoAr = 'عمي سعيد عنده ثلاسيميا، وزوجي خالد ابن عمي. جدتي أم أمي كانت عندها مشاكل في السمع';

describe('name masking', () => {
  it('masks every name in the English demo and keeps the rest', () => {
    const map = newNameMap();
    const masked = maskText(demoEn, map);
    expect(containsAnyName(masked, ['Ahmed', 'Saeed', 'Khalid', 'Noura'])).toBe(false);
    expect(masked).toContain("[PERSON_2]'s son");
    expect(masked).toContain('beta-thalassemia major');
    expect(masked).toContain("My mother's mother");
    // The same name always gets the same token.
    expect(masked.match(/\[PERSON_2\]/g)).toHaveLength(2);
  });

  it('masks Arabic names, including after a joined و, and leaves kinship words', () => {
    const map = newNameMap();
    const masked = maskText(demoAr, map);
    expect(containsAnyName(masked, ['سعيد', 'خالد'])).toBe(false);
    expect(masked).toContain('عمي [PERSON_1]');
    expect(masked).toContain('وزوجي [PERSON_2]');
    expect(masked).toContain('جدتي أم أمي');
    expect(masked).toContain('ثلاسيميا');
  });

  it('un-masks back to exactly what was written', () => {
    const map = newNameMap();
    expect(unmaskText(maskText(demoEn, map), map)).toBe(demoEn);
    expect(unmaskText(maskText(demoAr, map), map)).toBe(demoAr);
  });

  it('finds unlisted names from context, and never kinship or condition words', () => {
    const map = newNameMap();
    expect(maskText('My cousin Zubair has CF.', map)).toBe('My cousin [PERSON_1] has CF.');
    expect(maskText('Her name is Ritaj. My aunt, called Ritaj, is a carrier.', map)).toContain('called [PERSON_2]');
    expect(findNames('My uncle has sickle cell disease and my aunt is deaf.')).toEqual([]);
    expect(findNames('خالي عنده الثلاسيميا')).toEqual([]);
  });

  it('only masks name-words that are also English words when they look like names', () => {
    expect(findNames('May I add my uncle? He will tell me.')).toEqual([]);
    expect(findNames('My brother Will has CF.').map((n) => n.name)).toEqual(['Will']);
  });

  it('always masks names already on the map', () => {
    const map = newNameMap();
    expect(maskText('Add a son for Zayneb', map, ['Zayneb'])).toBe('Add a son for [PERSON_1]');
  });
});
