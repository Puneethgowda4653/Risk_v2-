import { useEffect, useRef } from 'react';

/**
 * CursorField — a lightweight, dependency-free interactive particle field.
 *
 * Inspired by the Antigravity effect: glowing particles drift on their own and
 * swarm into an orbiting ring around the cursor when it comes near. When the
 * pointer is idle (or outside the field) the ring auto-animates on a slow path.
 * Rendered on a 2D canvas with additive blending, so it looks best on a dark
 * background.
 */

const DEFAULT_COLORS = ['#5b8def', '#38bdf8', '#818cf8', '#a78bfa'];

interface CursorFieldProps {
  count?: number;
  magnetRadius?: number;
  ringRadius?: number;
  colors?: string[];
  className?: string;
  style?: React.CSSProperties;
}

export default function CursorField({
  count = 110,
  magnetRadius = 160,
  ringRadius = 72,
  colors = DEFAULT_COLORS,
  className,
  style,
}: CursorFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    // Pre-render a soft glow sprite per colour (cheap to blit each frame).
    const makeSprite = (color: string) => {
      const s = 64;
      const c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d')!;
      const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, color);
      grd.addColorStop(0.25, color);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
      return c;
    };
    const sprites = colors.map(makeSprite);

    interface P {
      hx: number; hy: number; x: number; y: number;
      ang: number; spin: number; off: number; size: number;
      phase: number; sprite: HTMLCanvasElement;
    }
    let particles: P[] = [];
    let W = 0, H = 0;

    const seed = () => {
      particles = [];
      for (let i = 0; i < count; i++) {
        const hx = Math.random() * W;
        const hy = Math.random() * H;
        particles.push({
          hx, hy, x: hx, y: hy,
          ang: Math.random() * Math.PI * 2,
          spin: rand(0.002, 0.012) * (Math.random() < 0.5 ? -1 : 1),
          off: rand(-1, 1),
          size: rand(1.4, 4),
          phase: Math.random() * Math.PI * 2,
          sprite: sprites[i % sprites.length],
        });
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const pointer = { x: 0, y: 0, inside: false, lastMove: 0 };
    const target = { x: 0, y: 0 };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      pointer.x = mx;
      pointer.y = my;
      pointer.inside = mx >= 0 && my >= 0 && mx <= rect.width && my <= rect.height;
      pointer.lastMove = performance.now();
    };
    window.addEventListener('mousemove', onMove, { passive: true });

    let t = 0;
    let raf = 0;
    const frame = () => {
      t += 0.016;

      // Auto-animate the ring when the cursor is idle or outside the field.
      const idle = !pointer.inside || performance.now() - pointer.lastMove > 1800;
      let tx = pointer.x, ty = pointer.y;
      if (idle) {
        tx = W * 0.5 + Math.sin(t * 0.45) * W * 0.28;
        ty = H * 0.5 + Math.cos(t * 0.6) * H * 0.26;
      }
      target.x += (tx - target.x) * 0.06;
      target.y += (ty - target.y) * 0.06;

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      const lerp = reduce ? 0.04 : 0.12;
      for (const p of particles) {
        const driftX = p.hx + Math.sin(t * 0.3 + p.phase) * 8;
        const driftY = p.hy + Math.cos(t * 0.34 + p.phase) * 8;
        const dx = p.x - target.x;
        const dy = p.y - target.y;
        const dist = Math.hypot(dx, dy);

        let destX = driftX, destY = driftY, glow = 0.45;

        if (dist < magnetRadius) {
          p.ang += p.spin + (reduce ? 0 : 0.02);
          const wave = Math.sin(t * 1.6 + p.ang) * 10;
          const r = ringRadius + wave + p.off * 14;
          destX = target.x + Math.cos(p.ang) * r;
          destY = target.y + Math.sin(p.ang) * r;
          const nearRing = 1 - Math.min(1, Math.abs(dist - ringRadius) / magnetRadius);
          glow = 0.5 + nearRing * 0.9;
        }

        p.x += (destX - p.x) * lerp;
        p.y += (destY - p.y) * lerp;

        const pulse = 0.8 + Math.sin(t * 3 + p.phase) * 0.2;
        const s = p.size * (dist < magnetRadius ? 1.1 + (glow - 0.5) : 1) * pulse;
        const draw = s * 6;
        ctx.globalAlpha = Math.min(1, 0.3 + glow * 0.6);
        ctx.drawImage(p.sprite, p.x - draw / 2, p.y - draw / 2, draw, draw);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    };

    resize();
    target.x = W / 2;
    target.y = H / 2;
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('mousemove', onMove);
    };
  }, [count, magnetRadius, ringRadius, colors]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', ...style }}
    />
  );
}
