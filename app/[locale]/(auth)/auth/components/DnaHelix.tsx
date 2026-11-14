import type { CSSProperties } from 'react';

const RUNGS = 26;

/**
 * Decorative rotating double helix for the auth panel. Two strands (white and
 * ink) joined by base-pair rungs; the motion lives in the `helix` utility in
 * globals.css. Hidden from assistive tech.
 */
export function DnaHelix({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none select-none ${className}`}>
      <div className="helix-glow absolute inset-[-30%_5%] rounded-full bg-[radial-gradient(closest-side,rgba(255,237,226,0.55),transparent)] blur-2xl" />
      <div className="helix relative flex h-full items-center justify-between [--r:52px]">
        {Array.from({ length: RUNGS }, (_, i) => (
          <div
            key={i}
            className="helix-rung relative flex h-full w-3.5 items-center justify-center"
            style={{ '--i': i } as CSSProperties}
          >
            <span className="helix-bar absolute h-[104px] w-[2px] rounded-full bg-white" />
            <span className="helix-dot absolute size-3.5 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.7)]" />
            <span className="helix-dot-b absolute size-3.5 rounded-full bg-ink" />
          </div>
        ))}
      </div>
    </div>
  );
}
