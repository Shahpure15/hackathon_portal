import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import ParticipantResultCard from './ParticipantResultCard';

/**
 * ParticipantRoundResult container component.
 * Fetches /leader/rounds/{id}/result when results are released.
 * Tracks last seen releaseNo in localStorage to display an "Updated" chip.
 */
export const ParticipantRoundResult = ({ round }) => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isUpdated, setIsUpdated] = useState(false);

  useEffect(() => {
    if (!round?.id) return;

    // Only attempt fetch if round has results released or results flag is true
    const shouldFetch = round.results?.released !== false;
    if (!shouldFetch) return;

    let isMounted = true;
    const fetchResult = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/leader/rounds/${round.id}/result`);
        if (!isMounted) return;

        if (res.data) {
          const fetched = res.data;
          setResult(fetched);

          const storageKey = `last_seen_release_${round.id}`;
          const lastSeenStr = localStorage.getItem(storageKey);
          if (lastSeenStr && fetched.releaseNo) {
            const lastSeenNo = parseInt(lastSeenStr, 10);
            if (fetched.releaseNo > lastSeenNo) {
              setIsUpdated(true);
            }
          }

          if (fetched.releaseNo) {
            localStorage.setItem(storageKey, String(fetched.releaseNo));
          }
        }
      } catch (err) {
        // 404 means results not yet released or retracted - normal state
        if (err.response?.status !== 404) {
          console.error(`Failed to load round results for ${round.id}`, err);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchResult();

    return () => {
      isMounted = false;
    };
  }, [round?.id, round?.results?.released, round?.results?.releaseNo]);

  if (!result && !loading) {
    return null;
  }

  return (
    <div style={{ marginTop: '16px' }}>
      <ParticipantResultCard
        result={result}
        loading={loading}
        isUpdated={isUpdated}
      />
    </div>
  );
};

export default ParticipantRoundResult;
