import { describe, expect, it } from 'vitest';
import { getGuides, guideIds, starterFor } from './guides';
import { checkDraftPrivacy } from './privacy';

const flagged = (text: string) => checkDraftPrivacy(text).flagged;

describe('privacy check: English', () => {
  it("flags a partner's or relative's result", () => {
    expect(checkDraftPrivacy('Khalid is a carrier, so we should talk.')).toEqual({
      flagged: true,
      subject: { kind: 'name', name: 'Khalid' },
    });
    expect(checkDraftPrivacy("I saw Khalid's result yesterday.")).toMatchObject({ subject: { kind: 'name', name: 'Khalid' } });
    expect(checkDraftPrivacy('Uncle Saeed has sickle cell disease.')).toMatchObject({ subject: { kind: 'name', name: 'Saeed' } });
    expect(checkDraftPrivacy('My brother is a carrier too.')).toMatchObject({ subject: { kind: 'relation', relation: 'brother' } });
    expect(checkDraftPrivacy("My wife's result came back.")).toMatchObject({ subject: { kind: 'relation', relation: 'wife' } });
    expect(flagged('He is also a carrier.')).toBe(true);
    expect(flagged('We are both carriers, Mum.')).toBe(true);
    expect(flagged('I saw his result.')).toBe(true);
  });

  it("doesn't flag the person's own result", () => {
    expect(flagged("I got my screening result. I'm a carrier, which means I'm healthy.")).toBe(false);
    expect(flagged("Khalid, I got my screening result. I'm a carrier, which means I'm healthy, but I'd like us to understand it together.")).toBe(false);
    expect(flagged('My result shows I carry a gene change.')).toBe(false);
    expect(flagged("Being a carrier is common and doesn't mean you're ill.")).toBe(false);
    expect(flagged('')).toBe(false);
  });
});

describe('privacy check: Arabic', () => {
  it("flags a partner's or relative's result", () => {
    expect(checkDraftPrivacy('خالد حامل للصفة الوراثية.')).toEqual({ flagged: true, subject: { kind: 'name', name: 'خالد' } });
    expect(checkDraftPrivacy('خالد يحمل الصفة أيضاً')).toMatchObject({ subject: { kind: 'name', name: 'خالد' } });
    expect(checkDraftPrivacy('رأيت نتيجة خالد')).toMatchObject({ subject: { kind: 'name', name: 'خالد' } });
    expect(checkDraftPrivacy('عمي مصاب بفقر الدم المنجلي')).toMatchObject({ subject: { kind: 'relation', relation: 'uncle' } });
    expect(checkDraftPrivacy('ابن عمي حامل للصفة')).toMatchObject({ subject: { kind: 'relation', relation: 'cousin' } });
    expect(checkDraftPrivacy('نتيجة زوجي وصلت')).toMatchObject({ subject: { kind: 'relation', relation: 'husband' } });
    expect(flagged('هو أيضاً حامل للصفة')).toBe(true);
    expect(flagged('رأيت نتيجته')).toBe(true);
    expect(flagged('كلانا نحمل الصفة')).toBe(true);
  });

  it("doesn't flag the person's own result", () => {
    expect(flagged('وصلتني نتيجة الفحص، وهي تُظهر أنني أحمل صفة وراثية. هذا يعني أنني بصحة جيدة.')).toBe(false);
    expect(flagged('أنا أحمل صفة وراثية ولست مريضاً.')).toBe(false);
    expect(flagged('حمل الصفة الوراثية أمر شائع ولا يعني أنك مريض.')).toBe(false);
  });
});

describe("the guides' own wording", () => {
  it('never triggers the warning', () => {
    for (const locale of ['en', 'ar'] as const) {
      for (const guide of getGuides(locale)) {
        const texts = [
          guide.intro,
          ...guide.steps,
          ...guide.phrases,
          ...Object.values(guide.drafts).map((d) => d.replace('{name}', locale === 'ar' ? 'خالد' : 'Khalid')),
          starterFor(guide, locale === 'ar' ? 'خالد' : 'Khalid'),
        ];
        for (const text of texts) expect(flagged(text), `${locale}/${guide.id}: ${text}`).toBe(false);
      }
    }
    expect(guideIds).toHaveLength(4);
  });
});
