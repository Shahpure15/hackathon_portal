import React from 'react';

export function Skeleton({
  variant = 'text',
  width,
  height,
  className = '',
  count = 1,
  style = {}
}) {
  const getVariantStyle = () => {
    switch (variant) {
      case 'circle':
        return {
          borderRadius: '50%',
          width: width || '40px',
          height: height || '40px'
        };
      case 'card':
        return {
          borderRadius: 'var(--radius-lg, 12px)',
          width: width || '100%',
          height: height || '180px'
        };
      case 'statBlock':
        return {
          borderRadius: 'var(--radius-md, 8px)',
          width: width || '100%',
          height: height || '90px'
        };
      case 'text':
      default:
        return {
          borderRadius: 'var(--radius-sm, 4px)',
          width: width || '100%',
          height: height || '1rem',
          margin: '0.4rem 0'
        };
    }
  };

  const items = Array.from({ length: count });

  return (
    <>
      {items.map((_, idx) => (
        <div
          key={idx}
          className={`skeleton ${className}`}
          style={{
            ...getVariantStyle(),
            ...style
          }}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

export default Skeleton;
