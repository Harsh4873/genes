import { useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { SourceBadge } from './common';

/** Shows a published portal figure, with an SVG fallback if the remote asset fails. */
export function PortalFigure({
  src,
  alt,
  href,
  fallback,
  caption,
}: {
  src: string;
  alt: string;
  href: string;
  fallback: ReactNode;
  caption?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="portal-figure">
      <div className="portal-figure-frame">
        {!failed ? (
          <img
            className="portal-figure-img"
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="portal-figure-fallback">
            <div className="portal-figure-fallback-note">
              <SourceBadge kind="representative" compact />
              <span className="dim">Portal image unavailable — showing a local GenomegaMap/TMHMM-style sketch.</span>
            </div>
            {fallback}
          </div>
        )}
      </div>
      <div className="portal-figure-meta">
        {caption}
        <a className="btn btn-ghost btn-sm" href={href} target="_blank" rel="noopener noreferrer">
          Open source plot <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}
