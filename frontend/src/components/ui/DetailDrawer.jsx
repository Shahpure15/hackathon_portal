import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './uikit.css';

export default function DetailDrawer({
  isOpen = false,
  onClose,
  title,
  subtitle,
  footer,
  children,
  width,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="ui-drawer-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className="ui-drawer-panel"
        style={width ? { maxWidth: width } : {}}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Detail Drawer'}
      >
        <div className="ui-drawer-header">
          <div className="ui-drawer-title-group">
            {title && <h3 className="ui-drawer-title">{title}</h3>}
            {subtitle && <span className="ui-drawer-sub">{subtitle}</span>}
          </div>
          <button
            type="button"
            className="ui-drawer-close"
            onClick={onClose}
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="ui-drawer-body">
          {children}
        </div>

        {footer && (
          <div className="ui-drawer-footer">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
