import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { useSettings } from './stores/settings';
import { useProgress } from './stores/progress';
import { useFavorites } from './stores/favorites';
import { useSRS } from './stores/srs';
import './styles/tokens.css';
import './styles/index.css';

// Hydrate IndexedDB stores before first paint of routed content.
// Each store renders defaults until hydrated; routes guard on `hydrated`
// where the difference is user-visible.
void useSettings.getState().hydrate();
void useProgress.getState().hydrate();
void useFavorites.getState().hydrate();
void useSRS.getState().hydrate();

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);

// Register service worker (auto-update on new deploy)
registerSW({ immediate: true });
