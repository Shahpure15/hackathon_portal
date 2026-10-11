import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = '500px',
  padding = '24px',
  hideCloseButton = false
}) => {
  const modalRef = useRef();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div 
      onClick={handleBackdropClick}
      className="modal-overlay-fade" 
    >
      <div 
        ref={modalRef}
        className="glass-card modal-scale-up" 
        style={{ 
          width: '100%', 
          maxWidth, 
          padding, 
          position: 'relative',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
      >
        {!hideCloseButton && (
          <button 
            type="button"
            onClick={onClose} 
            style={{ 
              position: 'absolute', 
              right: '20px', 
              top: '20px', 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer', 
              color: 'var(--text-muted)' 
            }}
          >
            <X size={20} />
          </button>
        )}

        {title && (
          <h2 style={{ fontSize: '1.5rem', marginBottom: '16px' }} className="text-gradient">
            {title}
          </h2>
        )}

        <div>{children}</div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
