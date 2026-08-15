import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4500) => {
    let textMessage = message;

    if (message && typeof message === 'object') {
      if (typeof message.detail === 'string') {
        textMessage = message.detail;
      } else if (Array.isArray(message.detail)) {
        textMessage = message.detail.map((d) => (typeof d === 'object' && d?.msg ? d.msg : String(d))).join(', ');
      } else if (Array.isArray(message)) {
        textMessage = message.map((d) => (typeof d === 'object' && d?.msg ? d.msg : String(d))).join(', ');
      } else if (typeof message.message === 'string') {
        textMessage = message.message;
      } else if (message instanceof Error) {
        textMessage = message.message || 'An error occurred';
      } else {
        try {
          textMessage = JSON.stringify(message);
        } catch (e) {
          textMessage = 'An unexpected error occurred';
        }
      }
    } else if (typeof message !== 'string') {
      textMessage = String(message || '');
    }

    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message: textMessage, type }]);

    // Auto-dismiss all toast notifications after 4.5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);


  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            onClick={() => removeToast(toast.id)}
            style={{ cursor: 'pointer' }}
            title={toast.type === 'error' ? "Click to dismiss" : ""}
          >
            <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{toast.message}</span>
              {toast.type === 'error' && (
                <span style={{ fontSize: '0.75rem', opacity: 0.6, marginLeft: '8px' }}>✕</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
