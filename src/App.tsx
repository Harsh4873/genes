import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import type { Dataset } from './lib/types';
import { loadDataset } from './lib/dataset';
import { href, useRoute } from './lib/router';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Browser } from './pages/Browser';
import { GeneDetail } from './pages/GeneDetail';
import { Compare } from './pages/Compare';
import { Datasets } from './pages/Datasets';
import { About } from './pages/About';

export default function App() {
  const route = useRoute();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((force = false) => {
    setLoading(true);
    setError(null);
    return loadDataset({ force })
      .then((d) => {
        setDataset(d);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loadDataset()
      .then((d) => alive && setDataset(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const label = route.path === 'gene' && route.params.id ? route.params.id : route.path === 'home' ? 'Overview' : route.path;
    document.title = `${label} · MtbScope`;
  }, [route.path, route.params.id]);

  let page: React.ReactNode;

  if (loading && !dataset) {
    page = (
      <div className="center-screen">
        <div className="spinner" />
        <div>Loading the H37Rv genome...</div>
      </div>
    );
  } else if (error && !dataset) {
    page = (
      <div className="container">
        <div className="empty-state">
          <TriangleAlert size={30} />
          <h1 style={{ fontSize: 24 }}>Couldn't load the gene catalog.</h1>
          <p className="dim" style={{ maxWidth: 560, margin: '8px auto 0' }}>{error}</p>
          <button className="btn btn-primary" type="button" onClick={() => void load(true)} style={{ marginTop: 14 }}>
            <RefreshCw size={15} /> Retry catalog load
          </button>
        </div>
      </div>
    );
  } else if (dataset) {
    switch (route.path) {
      case 'browse':
        page = <Browser dataset={dataset} />;
        break;
      case 'gene':
        page = <GeneDetail dataset={dataset} orf={route.params.id ?? ''} />;
        break;
      case 'compare':
        page = <Compare dataset={dataset} />;
        break;
      case 'datasets':
        page = <Datasets dataset={dataset} />;
        break;
      case 'about':
        page = <About />;
        break;
      case 'not-found':
        page = (
          <div className="container">
            <div className="empty-state">
              <TriangleAlert size={30} />
              <h1 style={{ fontSize: 24 }}>No page for “{route.requestedPath}”</h1>
              <p className="dim">That link does not match a MtbScope route.</p>
              <a className="btn btn-primary" href={href('browse')} style={{ marginTop: 12 }}>Browse genes</a>
            </div>
          </div>
        );
        break;
      default:
        page = <Home dataset={dataset} />;
    }
  } else {
    page = null;
  }

  return <Layout genes={dataset?.genes ?? []}>{page}</Layout>;
}
