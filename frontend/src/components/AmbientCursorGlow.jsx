import React, { useState, useEffect } from 'react';

export function AmbientCursorGlow() {
  const [pos, setPos] = useState({ x: -500, y: -500 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let targetX = -500;
    let targetY = -500;
    let currentX = -500;
    let currentY = -500;
    let animationFrameId;

    const handleMouseMove = (e) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!visible) setVisible(true);
    };

    const handleMouseLeave = () => {
      setVisible(false);
    };

    const loop = () => {
      // Smooth interpolation (lerp) with slight delay for silky motion
      currentX += (targetX - currentX) * 0.07;
      currentY += (targetY - currentY) * 0.07;
      setPos({ x: currentX, y: currentY });
      animationFrameId = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    animationFrameId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '450px',
        height: '450px',
        transform: `translate3d(${pos.x - 225}px, ${pos.y - 225}px, 0)`,
        background: 'radial-gradient(circle, rgba(185, 111, 56, 0.22) 0%, rgba(224, 92, 26, 0.1) 45%, transparent 75%)',
        filter: 'blur(65px)',
        pointerEvents: 'none',
        zIndex: 0,
        borderRadius: '50%',
        willChange: 'transform',
        transition: 'opacity 0.5s ease',
        opacity: 0.85
      }}
    />
  );
}

export default AmbientCursorGlow;
