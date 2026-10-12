import React from 'react';
import './uikit.css';

export default function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  children,
}) {
  return (
    <div className="ui-page-header">
      <div className="ui-page-header-text">
        <div className="ui-page-header-title-row">
          <h1 className="ui-page-header-title">{title}</h1>
          {badge && <span className="admin-badge-count">{badge}</span>}
        </div>
        {subtitle && <p className="ui-page-header-sub">{subtitle}</p>}
      </div>
      {actions && <div className="ui-page-header-actions">{actions}</div>}
      {children}
    </div>
  );
}
