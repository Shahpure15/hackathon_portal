import React from 'react';

export function IconButton({
  size = '36px',
  children,
  onClick,
  className = '',
  style = {},
  disabled = false,
  title,
  type = 'button',
  'aria-label': ariaLabel,
  ...rest
}) {
  const combinedStyle = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    flexShrink: 0,
    aspectRatio: '1 / 1',
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    cursor: disabled ? 'not-allowed' : 'pointer',
    ...style
  };

  return (
    <button
      type={type}
      className={`icon-btn ${className}`}
      style={combinedStyle}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel || title}
      {...rest}
    >
      {children}
    </button>
  );
}

export default IconButton;
