import { useCallback, useEffect, useState } from 'react';
import { loadPortalEnrichment, resetPortalEnrichmentCache, type PortalGeneEnrichment } from './portalEnrichment';

export function usePortalEnrichment(orf: string | undefined): {
  enrichment: PortalGeneEnrichment | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const [enrichment, setEnrichment] = useState<PortalGeneEnrichment | null>(null);
  const [loading, setLoading] = useState(Boolean(orf));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const retry = useCallback(() => {
    resetPortalEnrichmentCache();
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!orf) {
      setEnrichment(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    loadPortalEnrichment()
      .then((map) => {
        if (cancelled) return;
        setEnrichment(map.get(orf) ?? null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setEnrichment(null);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orf, nonce]);

  return { enrichment, loading, error, retry };
}
