import React from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Declarative component for permission-gated rendering.
 *
 * Usage:
 *   <Can perm="team.view" fallback={<AccessDenied />}>
 *     <TeamList />
 *   </Can>
 */
export const Can = ({ perm, any, fallback = null, children }) => {
  const { can, canAny } = useAuth();

  let allowed = false;
  if (perm) {
    allowed = can(perm);
  } else if (Array.isArray(any) && any.length > 0) {
    allowed = canAny(any);
  }

  if (allowed) {
    return <>{children}</>;
  }

  return fallback;
};

export default Can;
