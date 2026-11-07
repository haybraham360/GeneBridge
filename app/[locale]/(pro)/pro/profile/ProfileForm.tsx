'use client';

import { Upload, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';
import { DetailsFields, type DetailsValue } from '@/components/pro/DetailsFields';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { pageFromFile } from '@/components/scan/scanClient';
import { createClient } from '@/lib/supabase/browser';
import { cn } from '@/lib/cn';
import type { DetailsField } from '@/lib/kyc/details';
import { saveProfile, type SaveResult } from '../kycActions';

/** Profile details, bio and photo. The photo is re-encoded in the browser, which drops EXIF data. */
export function ProfileForm({
  userId,
  initial,
  initialPhotoUrl,
  initialPhotoPath,
}: {
  userId: string;
  initial: DetailsValue;
  initialPhotoUrl: string | null;
  initialPhotoPath: string | null;
}) {
  const t = useTranslations('verify.profile');
  const [value, setValue] = useState(initial);
  const [errors, setErrors] = useState<DetailsField[]>([]);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error' | 'photoError'>('idle');
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [photoPath, setPhotoPath] = useState(initialPhotoPath);
  const [pending, startTransition] = useTransition();
  const photoInput = useId();

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setStatus('idle');
    try {
      const page = await pageFromFile(file, file.name);
      if (page.kind !== 'image') throw new Error('not an image');
      const path = `${userId}/photo.jpg`;
      const { error } = await createClient().storage.from('pro-photos').upload(path, page.blob, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      setPhotoUrl(page.preview);
      setPhotoPath(path);
    } catch {
      setStatus('photoError');
    }
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveProfile({ ...value, photoPath }).catch((): SaveResult => ({ status: 'error' }));
      if (result.status === 'invalid') {
        setErrors(result.errors);
        setStatus('idle');
        requestAnimationFrame(() => document.getElementById(result.errors[0])?.focus());
        return;
      }
      setErrors([]);
      setStatus(result.status === 'ok' ? 'saved' : 'error');
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      noValidate
      className={cn(cardClasses, 'flex max-w-2xl flex-col gap-6 p-[clamp(20px,3vw,32px)]')}
    >
      <div className="flex items-center gap-4">
        <span className="flex size-20 flex-none items-center justify-center overflow-hidden rounded-full bg-bg">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a private, short-lived signed URL or local preview
            <img src={photoUrl} alt={t('photoAlt')} className="size-full object-cover" />
          ) : (
            <UserRound aria-hidden="true" className="size-8 text-muted" />
          )}
        </span>
        <div className="flex flex-col gap-1">
          <label htmlFor={photoInput} className={buttonClasses('ghost', 'sm', 'cursor-pointer has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-ring')}>
            <Upload aria-hidden="true" className="size-4" />
            {photoUrl ? t('changePhoto') : t('addPhoto')}
            <input id={photoInput} type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => void onPhoto(e.target.files?.[0])} />
          </label>
          <p className="text-sm text-muted">{t('photoHint')}</p>
        </div>
      </div>

      <DetailsFields value={value} onChange={setValue} errors={errors} showBio />

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'md', 'min-w-40 disabled:cursor-wait disabled:opacity-60')}>
          {pending ? t('saving') : t('save')}
        </button>
        <p role="status" aria-live="polite" className={cn('text-sm font-semibold', status === 'saved' ? 'text-success-text' : 'text-danger')}>
          {status === 'saved' ? t('saved') : status === 'error' ? t('error') : status === 'photoError' ? t('photoError') : ''}
        </p>
      </div>
    </form>
  );
}
