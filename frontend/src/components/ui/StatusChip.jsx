import React from 'react';
import './uikit.css';

export default function StatusChip({
  label,
  variant = 'neutral', // success | warning | error | info | neutral
  withDot = true,
  className = '',
  style = {},
}) {
  return (
    <span
      className={`ui-status-chip variant-${variant} ${className}`}
      style={style}
    >
      {withDot && <span className="ui-status-chip-dot" />}
      <span>{label}</span>
    </span>
  );
}
