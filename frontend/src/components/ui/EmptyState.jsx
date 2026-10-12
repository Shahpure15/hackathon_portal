import React from 'react';
import { Sparkles } from 'lucide-react';
import './uikit.css';

export default function EmptyState({
  icon: Icon = Sparkles,
  title = 'No items found',
  description = 'There are no records to display matching your criteria.',
  action,
}) {
  return (
    <div className="ui-empty-state">
      <div className="ui-empty-state-icon">
        <Icon size={26} />
      </div>
      <h3 className="ui-empty-state-title">{title}</h3>
      {description && <p className="ui-empty-state-desc">{description}</p>}
      {action && <div className="ui-empty-state-action">{action}</div>}
    </div>
  );
}
