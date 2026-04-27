'use client';
import React, { useRef } from 'react';

interface TiltCardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  /** Max tilt in degrees (default 5) */
  maxTilt?: number;
}

/**
 * Wraps children with a 3D perspective tilt effect on hover.
 * Uses CSS perspective + rotateX/Y, no third-party deps.
 */
export default function TiltCard({
  children,
  style,
  className,
  maxTilt = 5,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width  - 0.5;   // -0.5 → 0.5
    const y = (e.clientY - rect.top)  / rect.height - 0.5;   // -0.5 → 0.5
    const rotX = -y * maxTilt * 2;
    const rotY =  x * maxTilt * 2;
    el.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.01)`;
  }

  function handleLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)';
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...style, transition: 'transform 0.18s ease-out', willChange: 'transform' }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      {children}
    </div>
  );
}
