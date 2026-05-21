import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import UpdateToast from './components/UpdateToast';
import ErrorBoundary from './components/ErrorBoundary';

const Home = lazy(() => import('./pages/Home'));
const Toc = lazy(() => import('./pages/Toc'));
const Lesson = lazy(() => import('./pages/Lesson'));
const Search = lazy(() => import('./pages/Search'));
const Learn = lazy(() => import('./pages/Learn'));
const Hanzi = lazy(() => import('./pages/Hanzi'));
const Settings = lazy(() => import('./pages/Settings'));
const About = lazy(() => import('./pages/About'));
const Appendix = lazy(() => import('./pages/Appendix'));
const Help = lazy(() => import('./pages/Help'));

function LoadingFallback(): JSX.Element {
  return (
    <div className="flex items-center justify-center py-16 text-muted" aria-live="polite">
      <span className="animate-pulse text-base">불러오는 중…</span>
    </div>
  );
}

export default function App(): JSX.Element {
  return (
    <>
      <Layout>
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/toc" element={<Toc />} />
              <Route path="/toc/:vol" element={<Toc />} />
              <Route path="/lesson/:id" element={<Lesson />} />
              <Route path="/search" element={<Search />} />
              <Route path="/learn" element={<Learn />} />
              {/* 구 경로 호환: 북마크/외부 링크 보존 */}
              <Route path="/flashcards" element={<Navigate to="/learn?mode=flashcard" replace />} />
              <Route path="/quiz" element={<Navigate to="/learn?mode=sentence" replace />} />
              <Route path="/hanzi" element={<Hanzi />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/about" element={<About />} />
              <Route path="/help" element={<Help />} />
              <Route path="/appendix/:id" element={<Appendix />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Layout>
      <UpdateToast />
    </>
  );
}
