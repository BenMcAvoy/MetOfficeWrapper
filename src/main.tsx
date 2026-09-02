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
  let initialControllerSeen = false;

  const reloadForUpdate = () => {
    if (hasReloadedForUpdate) return;
    hasReloadedForUpdate = true;
    try { sessionStorage.setItem('wx-just-updated', '1'); } catch { /* ignore */ }
    window.location.reload();
  };

  // controllerchange fires once when the very first SW takes control of an
  // uncontrolled page (initial install). We only want to reload when a NEW
  // SW replaces an existing controller.
  initialControllerSeen = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!initialControllerSeen) {
      initialControllerSeen = true;
      return;
    }
    reloadForUpdate();
  });

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
      if (!registration) return;

      const activateIfWaiting = () => {
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      };

      const checkForUpdate = async () => {
        try {
          await registration.update();
          activateIfWaiting();
        } catch {
          // network or sw fetch failure — try again on next event
        }
      };

      void checkForUpdate();

      window.addEventListener('focus', () => void checkForUpdate());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void checkForUpdate();
      });
      // iOS standalone PWAs frequently restore from bfcache on resume —
      // visibilitychange/focus may not fire, but pageshow always does.
      window.addEventListener('pageshow', () => void checkForUpdate());

      // Periodic poll while the tab is visible, so a long-running session
      // still picks up new deploys without needing focus events to fire.
      window.setInterval(() => {
        if (document.visibilityState === 'visible') void checkForUpdate();
      }, 5 * 60 * 1000);

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') activateIfWaiting();
        });
      });
    },
  });
}

setupPwaUpdates();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
