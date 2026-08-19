import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export default function TeamQRCode({ teamId, eventId, teamName }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!teamId || !canvasRef.current) return;
    const payload = JSON.stringify({ teamId, eventId });
    QRCode.toCanvas(canvasRef.current, payload, { width: 220, margin: 2 }, (err) => {
      if (err) console.error('Failed to render QR code:', err);
    });
  }, [teamId, eventId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <canvas ref={canvasRef} />
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        {teamName ? `${teamName} — show this to check in` : 'Show this to check in'}
      </p>
    </div>
  );
}
