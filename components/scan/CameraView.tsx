'use client';

import { Camera, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { buttonClasses } from '@/components/ui/Button';

type Props = {
  onCapture: (photo: Blob) => void;
  onClose: () => void;
  /** Camera permission refused, or no camera: the caller offers upload instead. */
  onDenied: () => void;
};

/**
 * The live camera with an on-screen frame (task 12). Asks for camera
 * permission only once the person tapped "Take a photo"; uses the rear camera
 * on phones.
 */
export function CameraView({ onCapture, onClose, onDenied }: Props) {
  const t = useTranslations('scan.capture');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      onDenied();
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().then(() => setLive(true)).catch(() => setLive(true));
        }
      })
      .catch(() => {
        if (!cancelled) onDenied();
      });
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
  }, [onDenied]);

  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    canvas.toBlob((blob) => blob && onCapture(blob), 'image/jpeg', 0.92);
  };

  return (
    <div data-testid="camera" className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-card bg-ink">
        <video ref={video} playsInline muted className="block aspect-3/4 w-full object-cover sm:aspect-4/3" aria-hidden="true" />
        {/* The page frame: a guide only, the whole picture is kept. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-[8%] rounded-tile border-[3px] border-dashed border-white/90" />
        <p className="absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-ink/80 px-4 py-2 text-center text-sm font-bold text-white">
          {live ? t('frameHint') : t('cameraStarting')}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={shoot} disabled={!live} className={buttonClasses('primary', 'lg', 'flex-1 disabled:cursor-not-allowed disabled:opacity-60')}>
          <Camera aria-hidden="true" className="size-5" strokeWidth={2} />
          {t('shutter')}
        </button>
        <button type="button" onClick={onClose} className={buttonClasses('ghost', 'lg')}>
          <X aria-hidden="true" className="size-5" strokeWidth={2} />
          {t('closeCamera')}
        </button>
      </div>
    </div>
  );
}
