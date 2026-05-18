import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';

const Home = lazy(() => import('./pages/Home'));
const Toc = lazy(() => import('./pages/Toc'));
const Lesson = lazy(() => import('./pages/Lesson'));
const Search = lazy(() => import('./pages/Search'));
const Flashcards = lazy(() => import('./pages/Flashcards'));
const Settings = lazy(() => import('./pages/Settings'));
const About = lazy(() => import('./pages/About'));
const Appendix = lazy(() => import('./pages/Appendix'));

function LoadingFallback(): JSX.Element {
  return (
    <div className="flex items-center justify-center py-16 text-muted" aria-live="polite">
      <span className="animate-pulse text-base">불러오는 중…</span>
    </div>
  );
}

export default function App(): JSX.Element {
  return (
    <Layout>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/toc" element={<Toc />} />
          <Route path="/toc/:vol" element={<Toc />} />
          <Route path="/lesson/:id" element={<Lesson />} />
          <Route path="/search" element={<Search />} />
          <Route path="/flashcards" element={<Flashcards />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/about" element={<About />} />
          <Route path="/appendix/:id" element={<Appendix />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
