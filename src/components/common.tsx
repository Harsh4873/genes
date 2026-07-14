import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import type { CategoryId, EssentialityCall } from '../lib/types';
import { category } from '../lib/categories';

export function CategoryTag({ id, withLabel = true }: { id: CategoryId; withLabel?: boolean }) {
  const c = category(id);
  return (
    <span className="cat-tag" title={c.label} aria-label={withLabel ? undefined : c.label}>
      <span className="dot" aria-hidden="true" style={{ background: c.color }} />
      {withLabel ? c.short : null}
    </span>
  );
}

export type DataKind = 'reference' | 'representative';

const SOURCE_META: Record<DataKind, { label: string; short: string; description: string }> = {
  reference: {
    label: 'Reference annotation',
    short: 'Reference',
    description: 'Catalog information from the H37Rv reference annotation.',
  },
  representative: {
    label: 'Representative demonstration data',
    short: 'Representative',
    description: 'Deterministically generated demonstration data, not an experimental measurement.',
  },
};

export function SourceBadge({ kind, compact = false }: { kind: DataKind; compact?: boolean }) {
  const meta = SOURCE_META[kind];
  return (
    <span
      className={`source-badge source-badge-${kind}`}
      data-kind={kind}
      title={meta.description}
      aria-label={`${meta.label}. ${meta.description}`}
    >
      <span className="source-badge-marker" aria-hidden="true" />
      <span className="source-badge-label">{compact ? meta.short : meta.label}</span>
    </span>
  );
}

const ESS_LABEL: Record<EssentialityCall, string> = {
  essential: 'Essential',
  'growth-defect': 'Growth-defect',
  'non-essential': 'Non-essential',
  uncertain: 'Uncertain',
  'no-data': 'No data',
};

export function EssentialityBadge({ call }: { call: EssentialityCall }) {
  return (
    <span className={`ess ess-${call}`}>
      <span className="dot dot-round" aria-hidden="true" style={{ background: 'currentColor', width: 8, height: 8 }} />
      {ESS_LABEL[call]}
    </span>
  );
}

export function StrandBadge({ strand }: { strand: '+' | '-' }) {
  return (
    <span className="mono" title={strand === '+' ? 'Forward strand' : 'Reverse strand'} style={{ fontWeight: 700 }}>
      {strand === '+' ? '+' : '−'}
    </span>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      <span className="rule" />
      {aside}
    </div>
  );
}

export function Provenance({ children }: { children: ReactNode }) {
  return (
    <div className="provenance">
      <Info size={15} style={{ flex: 'none', marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}
