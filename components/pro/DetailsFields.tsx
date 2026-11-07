'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import type { DetailsField } from '@/lib/kyc/details';
import { BIO_MAX, professions, specialties, spokenLanguages, type Profession } from '@/lib/kyc/types';

export type DetailsValue = {
  displayName: string;
  profession: Profession | '';
  specialties: string[];
  languages: string[];
  yearsExperience: string;
  facilityName: string;
  bio: string;
};

export const inputClasses =
  'min-h-[52px] w-full min-w-0 rounded-input border border-line-strong bg-surface px-4 text-base text-ink placeholder:text-muted/70 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring aria-[invalid=true]:border-danger';

const chipClasses =
  'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-ring';

/**
 * A professional's own details (task 14): onboarding step 2 and the Profile
 * page. Controlled; the server validates again.
 */
export function DetailsFields({
  value,
  onChange,
  errors,
  showBio = false,
}: {
  value: DetailsValue;
  onChange: (next: DetailsValue) => void;
  errors: DetailsField[];
  showBio?: boolean;
}) {
  const t = useTranslations('proOnboarding');
  const tl = useTranslations('proOnboarding.labels');
  const set = <K extends keyof DetailsValue>(key: K, v: DetailsValue[K]) => onChange({ ...value, [key]: v });
  const toggle = (key: 'specialties' | 'languages', item: string) =>
    set(key, value[key].includes(item) ? value[key].filter((x) => x !== item) : [...value[key], item]);
  const err = (f: DetailsField) => errors.includes(f);
  const errorText = (f: DetailsField) =>
    err(f) ? (
      <p id={`${f}-error`} className="text-sm font-semibold text-danger">
        {t(`errors.${f}`)}
      </p>
    ) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="displayName" className="text-sm font-bold">
          {t('fields.displayName')}
        </label>
        <input
          id="displayName"
          name="displayName"
          autoComplete="name"
          value={value.displayName}
          onChange={(e) => set('displayName', e.target.value)}
          aria-invalid={err('displayName') || undefined}
          aria-describedby={err('displayName') ? 'displayName-error displayName-hint' : 'displayName-hint'}
          className={inputClasses}
        />
        <p id="displayName-hint" className="text-sm text-muted">
          {t('fields.displayNameHint')}
        </p>
        {errorText('displayName')}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="profession" className="text-sm font-bold">
          {t('fields.profession')}
        </label>
        <select
          id="profession"
          name="profession"
          value={value.profession}
          onChange={(e) => set('profession', e.target.value as Profession | '')}
          aria-invalid={err('profession') || undefined}
          aria-describedby={err('profession') ? 'profession-error' : undefined}
          className={cn(inputClasses, 'cursor-pointer')}
        >
          <option value="">{t('fields.choose')}</option>
          {professions.map((p) => (
            <option key={p} value={p}>
              {tl(`profession.${p}`)}
            </option>
          ))}
        </select>
        {errorText('profession')}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold">{t('fields.specialties')}</legend>
        <div className="flex flex-wrap gap-2">
          {specialties.map((s) => {
            const on = value.specialties.includes(s);
            return (
              <label key={s} className={cn(chipClasses, on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface hover:bg-brand-tint-soft')}>
                <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle('specialties', s)} />
                {tl(`specialty.${s}`)}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2" aria-describedby={err('languages') ? 'languages-error' : undefined}>
        <legend className="mb-2 text-sm font-bold">{t('fields.languages')}</legend>
        <div className="flex flex-wrap gap-2">
          {spokenLanguages.map((l) => {
            const on = value.languages.includes(l);
            return (
              <label key={l} className={cn(chipClasses, on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface hover:bg-brand-tint-soft')}>
                <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle('languages', l)} />
                <span lang={l}>{tl(`language.${l}`)}</span>
              </label>
            );
          })}
        </div>
        {errorText('languages')}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <label htmlFor="yearsExperience" className="text-sm font-bold">
            {t('fields.yearsExperience')}
          </label>
          <input
            id="yearsExperience"
            name="yearsExperience"
            inputMode="numeric"
            dir="ltr"
            value={value.yearsExperience}
            onChange={(e) => set('yearsExperience', e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
            aria-invalid={err('yearsExperience') || undefined}
            className={cn(inputClasses, 'text-start rtl:text-right')}
          />
          {errorText('yearsExperience')}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="facilityName" className="text-sm font-bold">
            {t('fields.facilityName')} <span className="font-normal text-muted">{t('fields.optional')}</span>
          </label>
          <input
            id="facilityName"
            name="facilityName"
            autoComplete="organization"
            value={value.facilityName}
            onChange={(e) => set('facilityName', e.target.value)}
            aria-invalid={err('facilityName') || undefined}
            className={inputClasses}
          />
          {errorText('facilityName')}
        </div>
      </div>

      {showBio ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="bio" className="text-sm font-bold">
            {t('fields.bio')} <span className="font-normal text-muted">{t('fields.optional')}</span>
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={4}
            maxLength={BIO_MAX}
            value={value.bio}
            onChange={(e) => set('bio', e.target.value)}
            aria-invalid={err('bio') || undefined}
            aria-describedby="bio-count"
            className={cn(inputClasses, 'py-3')}
          />
          <p id="bio-count" className="text-sm text-muted">
            {t('fields.bioCount', { count: value.bio.length, max: BIO_MAX })}
          </p>
          {errorText('bio')}
        </div>
      ) : null}
    </div>
  );
}
