import { useEffect, useState } from 'react';
import { APP_VERSION } from '../version';
import api from '../services/api';

export default function VersionBadge() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/admin/system/info')
      .then((res) => { if (!cancelled) setInfo(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const mismatch = info && info.appVersion !== APP_VERSION;
  const detail = info ? 'schema ' + (info.schemaRevision || 'unknown') + (info.commit ? ' / ' + info.commit : '') : '';
  return (
    <div title={detail} style={{ fontSize: 11, opacity: 0.65, padding: '6px 12px', color: mismatch ? '#d97706' : 'inherit' }}>
      v{APP_VERSION}{info ? ' / api v' + info.appVersion : ''}{mismatch ? ' (version mismatch)' : ''}
    </div>
  );
}
