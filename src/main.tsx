import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

declare global {
  interface Window {
    __wxPwaUpdateSetup?: boolean;
    __wxDeferredInstallPrompt?: Event | null;
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__wxDeferredInstallPrompt = e;
  window.dispatchEvent(new CustomEvent('wx-install-available'));
});
window.addEventListener('appinstalled', () => {
  window.__wxDeferredInstallPrompt = null;
  window.dispatchEvent(new CustomEvent('wx-installed'));
});

function setupPwaUpdates(): void {
  if (!('serviceWorker' in navigator)) return;
  if (window.__wxPwaUpdateSetup) return;
  window.__wxPwaUpdateSetup = true;

  let hasReloadedForUpdate = false;

  const reloadForUpdate = () => {
    if (hasReloadedForUpdate) return;
    hasReloadedForUpdate = true;
    window.location.reload();
  };

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateSW(true);
    },
    onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
      if (!registration) return;

      const checkForUpdate = () => {
        void registration.update();
      };

      checkForUpdate();

      window.addEventListener('focus', checkForUpdate);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    },
  });

  navigator.serviceWorker.addEventListener('controllerchange', reloadForUpdate);
}

setupPwaUpdates();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
