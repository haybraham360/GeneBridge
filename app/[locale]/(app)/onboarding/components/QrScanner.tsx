'use client';

import { CameraOff, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

type QrScannerProps = {
  /** Called once with the decoded text. */
  onScan: (text: string) => void;
  onClose: () => void;
  /** "Type the number instead". */
  onTypeInstead: () => void;
};

type Detector = (video: HTMLVideoElement) => Promise<string | null>;

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
};
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/**
 * The browser's own BarcodeDetector where it exists; otherwise jsQR, loaded
 * only when the camera opens.
 */
async function createDetector(): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (Native) {
    const detector = new Native({ formats: ['qr_code'] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  }

  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    if (!context || video.videoWidth === 0) return null;
    // Scan a downscaled frame: plenty for a QR code and much faster.
    const scale = Math.min(1, 640 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, image.width, image.height)?.data ?? null;
  };
}

function cameraAvailable() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Camera view that reads the QR code on a screening report. */
export function QrScanner({ onScan, onClose, onTypeInstead }: QrScannerProps) {
  const t = useTranslations('onboarding.steps.connect.scanner');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(() => !cameraAvailable());
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (failed) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const detect = await createDetector();

        let busy = false;
        const tick = async () => {
          if (stopped) return;
          if (!busy) {
            busy = true;
            const text = await detect(video).catch(() => null);
            busy = false;
            if (text && !stopped) {
              stopped = true;
              onScanRef.current(text);
              return;
            }
          }
          frame = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        if (!stopped) setFailed(true);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [failed]);

  // Escape closes the camera; it never leaves the step.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (failed) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-tile bg-bg p-4" role="status">
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          <CameraOff aria-hidden="true" className="size-5 text-brand-text" strokeWidth={2} />
          {t('noCamera')}
        </p>
        <button
          type="button"
          onClick={onTypeInstead}
          className="min-h-11 cursor-pointer text-[15px] font-bold text-brand-text underline hover:text-brand-text-dark"
        >
          {t('typeInstead')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-tile bg-ink">
        <video
          ref={videoRef}
          aria-label={t('label')}
          muted
          playsInline
          className="aspect-[4/3] w-full object-cover"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[18%] rounded-2xl border-[3px] border-brand"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="absolute end-3 top-3 flex size-11 cursor-pointer items-center justify-center rounded-full bg-surface text-ink"
        >
          <X aria-hidden="true" className="size-5" strokeWidth={2} />
        </button>
      </div>
      <p className="text-sm text-muted">{t('hint')}</p>
      <button
        type="button"
        onClick={onTypeInstead}
        className="min-h-11 cursor-pointer self-start text-sm font-bold text-brand-text underline hover:text-brand-text-dark"
      >
        {t('typeInstead')}
      </button>
    </div>
  );
}
