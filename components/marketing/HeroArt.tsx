'use client';

import { useEffect, useRef } from 'react';

/*
 * Interactive, purely decorative hero art. Everything here is aria-hidden and
 * carries no meaning, so nothing is lost for keyboard, touch or screen-reader
 * users. Pointer effects are skipped entirely for reduced motion and for
 * coarse (touch) pointers, leaving the calm CSS idle animations.
 *
 * - Pills drift with the cursor at different depths (parallax) and lean away
 *   when the cursor gets close. Hovering a pill gives it a small bounce.
 * - The helix tilts towards the cursor; clicking it gives it one full twist.
 * - A soft orange glow follows the cursor across the hero.
 *
 * Positions are written straight to the DOM in a requestAnimationFrame loop,
 * so moving the mouse never re-renders React.
 */

// Literal class strings so Tailwind can see them. `depth` scales the parallax.
const pills = [
  { pos: 'start-[40px] top-0', tilt: 'rotate-[30deg] [animation-delay:0s]', depth: 1 },
  { pos: 'start-[110px] top-[20px]', tilt: '-rotate-[20deg] [animation-delay:-1.4s]', depth: 0.6 },
  { pos: 'start-0 top-[60px]', tilt: 'rotate-[60deg] [animation-delay:-2.8s]', depth: 1.4 },
  { pos: 'start-[70px] top-[80px]', tilt: 'rotate-[10deg] [animation-delay:-4.2s]', depth: 0.8 },
  { pos: 'start-[150px] top-[90px]', tilt: 'rotate-[45deg] [animation-delay:-0.7s]', depth: 1.2 },
  { pos: 'start-[20px] top-[140px]', tilt: '-rotate-[35deg] [animation-delay:-3.5s]', depth: 0.5 },
  { pos: 'start-[100px] top-[150px]', tilt: 'rotate-[80deg] [animation-delay:-5.6s]', depth: 1.1 },
  { pos: 'start-[170px] top-[170px]', tilt: '-rotate-[10deg] [animation-delay:-2.1s]', depth: 0.7 },
  { pos: 'start-[60px] top-[210px]', tilt: 'rotate-[25deg] [animation-delay:-4.9s]', depth: 1.3 },
];

const rungs = [
  { d: 'M62 34l40 10', delay: '[animation-delay:0s]' },
  { d: 'M52 58l58 12', delay: '[animation-delay:0.35s]' },
  { d: 'M62 86l40 8', delay: '[animation-delay:0.7s]' },
  { d: 'M58 210l44 10', delay: '[animation-delay:1.05s]' },
  { d: 'M50 236l60 12', delay: '[animation-delay:1.4s]' },
  { d: 'M60 262l40 8', delay: '[animation-delay:1.75s]' },
];

const PARALLAX = 14; // px of drift at the hero's edge, for depth 1
const REPEL_RADIUS = 110; // px from a pill's centre where it starts leaning away
const REPEL_PUSH = 22; // px of push when the cursor is right on top
const TILT = 14; // degrees of helix tilt at the hero's edge
const EASE = 0.12; // how quickly things catch up with the cursor each frame

type Vec = { x: number; y: number };

export function HeroArt() {
  const glowRef = useRef<HTMLDivElement>(null);
  const pillRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const helixRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = glowRef.current?.parentElement;
    if (!section) return;

    const calm = window.matchMedia('(prefers-reduced-motion: reduce), (pointer: coarse)');
    if (calm.matches) return;

    let pointer: Vec | null = null; // cursor position in viewport coords
    let frame = 0;
    const current = pills.map(() => ({ x: 0, y: 0 }));
    const tilt = { x: 0, y: 0 };

    const tick = () => {
      frame = 0;
      const box = section.getBoundingClientRect();
      // Cursor relative to the hero's centre, roughly -1..1 on each axis.
      const n = pointer
        ? {
            x: ((pointer.x - box.left) / box.width) * 2 - 1,
            y: ((pointer.y - box.top) / box.height) * 2 - 1,
          }
        : { x: 0, y: 0 };

      let moving = false;
      const step = (from: number, to: number) => {
        const next = from + (to - from) * EASE;
        if (Math.abs(to - next) < 0.05) return to;
        moving = true;
        return next;
      };

      pillRefs.current.forEach((el, i) => {
        if (!el) return;
        const { depth } = pills[i];
        const target = { x: n.x * PARALLAX * depth, y: n.y * PARALLAX * depth };

        if (pointer) {
          // Where the pill sits without our offset, so the push doesn't feed back on itself.
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2 - current[i].x;
          const cy = r.top + r.height / 2 - current[i].y;
          const dx = cx - pointer.x;
          const dy = cy - pointer.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < REPEL_RADIUS) {
            const push = (1 - dist / REPEL_RADIUS) ** 2 * REPEL_PUSH;
            target.x += (dx / dist) * push;
            target.y += (dy / dist) * push;
          }
        }

        current[i].x = step(current[i].x, target.x);
        current[i].y = step(current[i].y, target.y);
        el.style.transform = `translate3d(${current[i].x}px, ${current[i].y}px, 0)`;
      });

      tilt.x = step(tilt.x, -n.y * TILT);
      tilt.y = step(tilt.y, n.x * TILT);
      helixRef.current?.style.setProperty('--tilt-x', `${tilt.x}deg`);
      helixRef.current?.style.setProperty('--tilt-y', `${tilt.y}deg`);

      if (pointer) {
        glowRef.current?.style.setProperty('--glow-x', `${pointer.x - box.left}px`);
        glowRef.current?.style.setProperty('--glow-y', `${pointer.y - box.top}px`);
      }

      if (moving) frame = requestAnimationFrame(tick);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pointer = { x: e.clientX, y: e.clientY };
      glowRef.current?.style.setProperty('opacity', '1');
      schedule();
    };

    const onLeave = () => {
      pointer = null;
      glowRef.current?.style.setProperty('opacity', '0');
      schedule(); // ease everything back home
    };

    section.addEventListener('pointermove', onMove);
    section.addEventListener('pointerleave', onLeave);
    return () => {
      section.removeEventListener('pointermove', onMove);
      section.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  const motionOk = () =>
    typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // A quick bounce. The Web Animations API lets it replay on every hover
  // without touching React state, and it composes with the CSS float.
  const bounce = (el: HTMLElement) => {
    if (!motionOk()) return;
    el.animate([{ scale: '1' }, { scale: '1.25' }, { scale: '0.92' }, { scale: '1' }], {
      duration: 520,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    });
  };

  // One full twist around the helix's long axis.
  const twist = (el: HTMLElement) => {
    if (!motionOk()) return;
    el.animate([{ transform: 'rotateY(0turn)' }, { transform: 'rotateY(1turn)' }], {
      duration: 1100,
      easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
    });
  };

  return (
    <>
      {/* Cursor glow: sits behind the hero content. */}
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 [background:radial-gradient(420px_circle_at_var(--glow-x,50%)_var(--glow-y,50%),rgba(255,90,31,0.10),transparent_70%)]"
      />

      <div
        aria-hidden="true"
        className="absolute start-0 top-10 hidden h-[260px] w-[240px] min-[900px]:block"
      >
        {pills.map(({ pos, tilt, depth }, i) => (
          <span
            key={pos}
            ref={(el) => {
              pillRefs.current[i] = el;
            }}
            onPointerEnter={(e) => bounce(e.currentTarget)}
            className={`absolute ${pos} will-change-transform`}
            style={{ zIndex: Math.round(depth * 10) }}
          >
            <span
              className={`block h-[26px] w-[58px] rounded-full bg-brand motion-safe:animate-float ${tilt}`}
            />
          </span>
        ))}
      </div>

      <div
        ref={helixRef}
        aria-hidden="true"
        className="absolute end-4 top-6 hidden h-[280px] w-[150px] [perspective:600px] min-[900px]:block"
      >
        <div
          // Twist the inner layer so it doesn't fight the tilt transform.
          onClick={(e) => twist(e.currentTarget.firstElementChild as HTMLElement)}
          className="size-full cursor-pointer [transform-style:preserve-3d] [transform:rotateX(var(--tilt-x,0deg))_rotateY(var(--tilt-y,0deg))]"
        >
          <div className="size-full">
            <svg
              focusable="false"
              viewBox="0 0 160 300"
              fill="none"
              strokeLinecap="round"
              className="size-full origin-center motion-safe:animate-sway"
            >
              <path d="M40 10C140 60 140 110 80 150S20 240 120 290" stroke="#141414" strokeWidth="3" />
              <path d="M120 10C20 60 20 110 80 150S140 240 40 290" stroke="#141414" strokeWidth="3" />
              {/* Rungs shimmer one after another, top to bottom. */}
              {rungs.map(({ d, delay }) => (
                <path
                  key={d}
                  d={d}
                  stroke="#FF5A1F"
                  strokeWidth="5"
                  className={`motion-safe:animate-rung ${delay}`}
                />
              ))}
            </svg>
          </div>
        </div>
      </div>
    </>
  );
}
