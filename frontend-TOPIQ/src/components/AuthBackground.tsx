"use client";

import { useEffect, useRef } from "react";
import styles from "./AuthBackground.module.css";

type Dot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  offsetX: number;
  offsetY: number;
  accent: boolean;
};

export default function AuthBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    const context = canvas?.getContext("2d");
    if (!canvas || !container || !context) return;

    const targetCanvas: HTMLCanvasElement = canvas;
    const parent: HTMLElement = container;
    const ctx: CanvasRenderingContext2D = context;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, strength: 0, targetStrength: 0 };
    let dots: Dot[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;

    function draw(time: number) {
      const delta = last ? Math.min((time - last) / 16.67, 2) : 1;
      last = time;
      ctx.clearRect(0, 0, width, height);

      if (!reduceMotion.matches) {
        const easing = Math.min(1, .12 * delta);
        pointer.x += (pointer.targetX - pointer.x) * easing;
        pointer.y += (pointer.targetY - pointer.y) * easing;
        pointer.strength += (pointer.targetStrength - pointer.strength) * Math.min(1, .08 * delta);
      }

      const positions = dots.map(dot => {
        if (!reduceMotion.matches) {
          dot.x = (dot.x + dot.vx * delta + width) % width;
          dot.y = (dot.y + dot.vy * delta + height) % height;
        }
        const dx = dot.x - pointer.x;
        const dy = dot.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        const near = Math.max(0, 1 - distance / 180) * pointer.strength;
        const targetX = distance ? dx / distance * near * 28 : 0;
        const targetY = distance ? dy / distance * near * 28 : 0;
        const easing = Math.min(1, .1 * delta);
        dot.offsetX += (targetX - dot.offsetX) * easing;
        dot.offsetY += (targetY - dot.offsetY) * easing;
        return { x: dot.x + dot.offsetX, y: dot.y + dot.offsetY, near };
      });

      ctx.lineWidth = 1;
      for (let i = 0; i < dots.length; i += 1) {
        for (let j = i + 1; j < dots.length; j += 1) {
          const dx = positions[i].x - positions[j].x;
          const dy = positions[i].y - positions[j].y;
          const distance = Math.hypot(dx, dy);
          if (distance >= 112) continue;
          const emphasis = Math.max(positions[i].near, positions[j].near);
          ctx.strokeStyle = `rgba(45,94,197,${(1 - distance / 112) * (.055 + emphasis * .1)})`;
          ctx.beginPath();
          ctx.moveTo(positions[i].x, positions[i].y);
          ctx.lineTo(positions[j].x, positions[j].y);
          ctx.stroke();
        }
      }

      dots.forEach((dot, index) => {
        const position = positions[index];
        if (position.near > .01) {
          ctx.strokeStyle = `rgba(45,94,197,${position.near * .18})`;
          ctx.beginPath();
          ctx.moveTo(position.x, position.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(position.x, position.y, dot.radius + position.near * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = dot.accent
          ? `rgba(234,102,65,${.2 + position.near * .38})`
          : `rgba(45,94,197,${.2 + position.near * .45})`;
        ctx.fill();
      });

      if (pointer.strength > .01) {
        const glow = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 150);
        glow.addColorStop(0, `rgba(45,94,197,${pointer.strength * .055})`);
        glow.addColorStop(1, "rgba(45,94,197,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(pointer.x - 150, pointer.y - 150, 300, 300);
      }

      if (!reduceMotion.matches) frame = requestAnimationFrame(draw);
    }

    function restart() {
      cancelAnimationFrame(frame);
      last = 0;
      if (reduceMotion.matches) draw(performance.now());
      else frame = requestAnimationFrame(draw);
    }

    function resize() {
      const bounds = parent.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      targetCanvas.width = Math.round(width * ratio);
      targetCanvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.min(76, Math.max(28, Math.floor(width * height / 16000)));
      dots = Array.from({ length: count }, (_, index) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - .5) * .13,
        vy: (Math.random() - .5) * .13,
        radius: Math.random() * 1.1 + .8,
        offsetX: 0,
        offsetY: 0,
        accent: index % 11 === 0,
      }));
      restart();
    }

    const move = (event: PointerEvent) => {
      if (reduceMotion.matches || !finePointer.matches) return;
      const bounds = parent.getBoundingClientRect();
      pointer.targetX = event.clientX - bounds.left;
      pointer.targetY = event.clientY - bounds.top;
      if (!pointer.targetStrength) {
        pointer.x = pointer.targetX;
        pointer.y = pointer.targetY;
      }
      pointer.targetStrength = 1;
    };
    const leave = () => { pointer.targetStrength = 0; };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    parent.addEventListener("pointermove", move, { passive: true });
    parent.addEventListener("pointerleave", leave);
    reduceMotion.addEventListener("change", restart);
    resize();

    return () => {
      observer.disconnect();
      parent.removeEventListener("pointermove", move);
      parent.removeEventListener("pointerleave", leave);
      reduceMotion.removeEventListener("change", restart);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <div className={styles.background} aria-hidden="true"><canvas ref={canvasRef} className={styles.canvas} /></div>;
}
