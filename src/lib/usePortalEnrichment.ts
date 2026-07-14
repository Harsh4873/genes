import { useEffect, useState } from 'react';
import { loadPortalEnrichment, type PortalGeneEnrichment } from './portalEnrichment';

export function usePortalEnrichment(orf: string | undefined): {
  enrichment: PortalGeneEnrichment | null;
  loading: boolean;
} {
  const [enrichment, setEnrichment] = useState<PortalGeneEnrichment | null>(null);
  const [loading, setLoading] = useState(Boolean(orf));

  useEffect(() => {
    let cancelled = false;
    if (!orf) {
      setEnrichment(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadPortalEnrichment().then((map) => {
      if (cancelled) return;
      setEnrichment(map.get(orf) ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [orf]);

  return { enrichment, loading };
}
