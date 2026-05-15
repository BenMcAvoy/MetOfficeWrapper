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

      const applyIfWaiting = () => {
        if (registration.waiting) void updateSW(true);
      };

      const checkForUpdate = async () => {
        try {
          await registration.update();
          applyIfWaiting();
        } catch {
          // network or sw fetch failure — try again on next event
        }
      };

      void checkForUpdate();

      window.addEventListener('focus', () => void checkForUpdate());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void checkForUpdate();
      });

      // Periodic poll while the tab is visible, so a long-running session
      // still picks up new deploys without needing focus events to fire.
      window.setInterval(() => {
        if (document.visibilityState === 'visible') void checkForUpdate();
      }, 5 * 60 * 1000);

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', applyIfWaiting);
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
