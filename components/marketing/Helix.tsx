'use client';

import { useEffect, useRef } from 'react';

/*
 * A decorative DNA double helix that turns in 3D. Purely visual and
 * aria-hidden.
 *
 * The geometry is worked out from a single `phase` angle: each strand is a
 * sine wave, the second strand half a turn behind the first, and `cos(angle)`
 * gives depth. Parts at the back are drawn thinner and fainter, and the front
 * strand is drawn over the base pairs, which gives a real sense of rotation.
 *
 * Each frame writes SVG attributes straight to the DOM, so React never
 * re-renders. The animation pauses when the helix is off screen. With reduced
 * motion it stays as a still helix (the markup rendered on the server).
 *
 * Hovering speeds the spin up. Clicking gives it a quick extra twist.
 */

const W = 160;
const H = 300;
const CX = W / 2;
const AMP = 50; // half the helix width
const TOP = 14;
const BOTTOM = H - 14;
const TURNS = 1.5; // full turns from top to bottom
const SAMPLES = 56; // backbone segments per strand
const PAIRS = 15; // base pairs (rungs)

const BASE_SPEED = 0.7; // rad/s when idle
const HOVER_SPEED = 2.2; // rad/s while hovered
const TWIST_KICK = 9; // extra rad/s from a click, eases off

const INK = '#141414';
const BRAND = '#FF5A1F';
const PEACH = '#FFB38F';

type Geometry = {
  segs: { x1: number; y1: number; x2: number; y2: number; z: number }[][]; // [strand][i]
  pairs: { y: number; xa: number; xb: number; za: number; zb: number }[];
};

function geometry(phase: number): Geometry {
  const angleAt = (t: number) => phase + t * TURNS * Math.PI * 2;
  const yAt = (t: number) => TOP + t * (BOTTOM - TOP);

  const segs: Geometry['segs'] = [[], []];
  for (let s = 0; s < 2; s++) {
    const offset = s * Math.PI;
    for (let k = 0; k < SAMPLES; k++) {
      const t0 = k / SAMPLES;
      const t1 = (k + 1) / SAMPLES;
      const a0 = angleAt(t0) + offset;
      const a1 = angleAt(t1) + offset;
      segs[s].push({
        x1: r2(CX + AMP * Math.sin(a0)),
        y1: r2(yAt(t0)),
        x2: r2(CX + AMP * Math.sin(a1)),
        y2: r2(yAt(t1)),
        z: Math.cos((a0 + a1) / 2),
      });
    }
  }

  const pairs: Geometry['pairs'] = [];
  for (let i = 0; i < PAIRS; i++) {
    const t = (i + 0.5) / PAIRS;
    const a = angleAt(t);
    pairs.push({
      y: r2(yAt(t)),
      xa: r2(CX + AMP * Math.sin(a)),
      xb: r2(CX - AMP * Math.sin(a)),
      za: Math.cos(a),
      zb: -Math.cos(a),
    });
  }
  return { segs, pairs };
}

// Rounded so server and browser render identical markup (no hydration diff).
const r2 = (n: number) => Math.round(n * 100) / 100;
const f = (n: number) => String(r2(n));

// Depth (-1 back .. 1 front) to drawing style.
const depth01 = (z: number) => (z + 1) / 2;
const backOpacity = (z: number) => r2(0.18 + 0.5 * depth01(z));
const strokeW = (z: number) => r2(2 + 2.2 * depth01(z));
const nodeR = (z: number) => r2(2.4 + 2.6 * depth01(z));
const rungOpacity = (xa: number, xb: number) => r2(0.35 + 0.65 * (Math.abs(xa - xb) / (2 * AMP)));

export function Helix() {
  const svgRef = useRef<SVGSVGElement>(null);
  const hoverRef = useRef(false);
  const kickRef = useRef(0);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const back = Array.from(svg.querySelectorAll<SVGLineElement>('[data-back]'));
    const front = Array.from(svg.querySelectorAll<SVGLineElement>('[data-front]'));
    const rungA = Array.from(svg.querySelectorAll<SVGLineElement>('[data-rung-a]'));
    const rungB = Array.from(svg.querySelectorAll<SVGLineElement>('[data-rung-b]'));
    const nodes = Array.from(svg.querySelectorAll<SVGCircleElement>('[data-node]'));

    let phase = 0;
    let speed = BASE_SPEED;
    let last = 0;
    let frame = 0;
    let visible = true;

    const draw = () => {
      const g = geometry(phase);
      g.segs.forEach((strand, s) =>
        strand.forEach((seg, k) => {
          const i = s * SAMPLES + k;
          for (const el of [back[i], front[i]]) {
            el.setAttribute('x1', f(seg.x1));
            el.setAttribute('y1', f(seg.y1));
            el.setAttribute('x2', f(seg.x2));
            el.setAttribute('y2', f(seg.y2));
          }
          back[i].setAttribute('stroke-opacity', f(backOpacity(seg.z)));
          back[i].setAttribute('stroke-width', f(strokeW(seg.z)));
          front[i].setAttribute('stroke-opacity', seg.z > 0.05 ? '1' : '0');
          front[i].setAttribute('stroke-width', f(strokeW(seg.z)));
        }),
      );
      g.pairs.forEach((p, i) => {
        const mid = CX;
        const op = f(rungOpacity(p.xa, p.xb)); // faint when edge-on
        rungA[i].setAttribute('x1', f(p.xa));
        rungA[i].setAttribute('x2', f(mid));
        rungA[i].setAttribute('stroke-opacity', op);
        rungB[i].setAttribute('x1', f(mid));
        rungB[i].setAttribute('x2', f(p.xb));
        rungB[i].setAttribute('stroke-opacity', op);
        const a = nodes[i * 2];
        const b = nodes[i * 2 + 1];
        a.setAttribute('cx', f(p.xa));
        a.setAttribute('r', f(nodeR(p.za)));
        a.setAttribute('fill-opacity', f(backOpacity(p.za) + 0.3));
        b.setAttribute('cx', f(p.xb));
        b.setAttribute('r', f(nodeR(p.zb)));
        b.setAttribute('fill-opacity', f(backOpacity(p.zb) + 0.3));
      });
    };

    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      const target = hoverRef.current ? HOVER_SPEED : BASE_SPEED;
      speed += (target - speed) * Math.min(1, dt * 4);
      kickRef.current *= Math.pow(0.04, dt); // fades over about a second
      phase += (speed + kickRef.current) * dt;
      draw();
      frame = visible ? requestAnimationFrame(tick) : 0;
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    });
    io.observe(svg);
    frame = requestAnimationFrame(tick);

    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  // Server / first render: the helix at phase 0, so reduced motion and
  // no-JS still get a proper still helix.
  const g = geometry(0);
  const seg = (s: number, k: number) => g.segs[s][k];

  return (
    <svg
      ref={svgRef}
      focusable="false"
      viewBox={`0 0 ${W} ${H}`}
      fill="none"
      strokeLinecap="round"
      className="size-full overflow-visible"
      onPointerEnter={() => (hoverRef.current = true)}
      onPointerLeave={() => (hoverRef.current = false)}
      onClick={() => (kickRef.current += TWIST_KICK)}
    >
      {/* Back: every backbone segment, faded by depth. */}
      <g stroke={INK}>
        {[0, 1].flatMap((s) =>
          g.segs[s].map((_, k) => {
            const p = seg(s, k);
            return (
              <line
                key={`b${s}-${k}`}
                data-back=""
                x1={p.x1}
                y1={p.y1}
                x2={p.x2}
                y2={p.y2}
                strokeOpacity={backOpacity(p.z)}
                strokeWidth={strokeW(p.z)}
              />
            );
          }),
        )}
      </g>

      {/* Base pairs: two halves in different shades, like paired bases. */}
      <g strokeWidth={4}>
        {g.pairs.map((p, i) => {
          const op = rungOpacity(p.xa, p.xb);
          return (
            <g key={`r${i}`}>
              <line data-rung-a="" x1={p.xa} y1={p.y} x2={CX} y2={p.y} stroke={i % 2 ? PEACH : BRAND} strokeOpacity={op} />
              <line data-rung-b="" x1={CX} y1={p.y} x2={p.xb} y2={p.y} stroke={i % 2 ? BRAND : PEACH} strokeOpacity={op} />
            </g>
          );
        })}
      </g>

      {/* Front: only the segments facing us, drawn over the base pairs. */}
      <g stroke={INK}>
        {[0, 1].flatMap((s) =>
          g.segs[s].map((_, k) => {
            const p = seg(s, k);
            return (
              <line
                key={`f${s}-${k}`}
                data-front=""
                x1={p.x1}
                y1={p.y1}
                x2={p.x2}
                y2={p.y2}
                strokeOpacity={p.z > 0.05 ? 1 : 0}
                strokeWidth={strokeW(p.z)}
              />
            );
          }),
        )}
      </g>

      {/* Nucleotide beads where each base pair meets its strand. */}
      <g fill={INK}>
        {g.pairs.flatMap((p, i) => [
          <circle key={`na${i}`} data-node="" cx={p.xa} cy={p.y} r={nodeR(p.za)} fillOpacity={r2(backOpacity(p.za) + 0.3)} />,
          <circle key={`nb${i}`} data-node="" cx={p.xb} cy={p.y} r={nodeR(p.zb)} fillOpacity={r2(backOpacity(p.zb) + 0.3)} />,
        ])}
      </g>
    </svg>
  );
}
