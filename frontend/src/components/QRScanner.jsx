import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

export default function QRScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(document.createElement('canvas'));
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState(null);
  const hasNativeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (hasNativeDetector) {
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          const tick = async () => {
            if (cancelled || !videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes.length > 0) {
                handleDecoded(codes[0].rawValue);
                return;
              }
            } catch (e) {
              // BarcodeDetector can throw transiently on bad frames — keep polling
            }
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
        } else {
          const ctx = canvasRef.current.getContext('2d');
          const tick = () => {
            if (cancelled || !videoRef.current) return;
            const video = videoRef.current;
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
              canvasRef.current.width = video.videoWidth;
              canvasRef.current.height = video.videoHeight;
              ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
              const imageData = ctx.getImageData(0, 0, video.videoWidth, video.videoHeight);
              const code = jsQR(imageData.data, imageData.width, imageData.height);
              if (code) {
                handleDecoded(code.data);
                return;
              }
            }
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
        }
      } catch (e) {
        setError('Camera access failed — check permissions and try again.');
      }
    }

    function handleDecoded(rawValue) {
      try {
        const parsed = JSON.parse(rawValue);
        if (parsed.teamId) {
          onScan(parsed.teamId);
        }
      } catch (e) {
        // Not a QR this app generated — ignore and keep scanning rather than crash
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [hasNativeDetector, onScan]);

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, gap: '16px', padding: '24px',
    }}>
      {error ? (
        <p style={{ color: 'white' }}>{error}</p>
      ) : (
        <video ref={videoRef} style={{ maxWidth: '90vw', maxHeight: '70vh', borderRadius: '8px' }} muted playsInline />
      )}
      <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
    </div>
  );
}
