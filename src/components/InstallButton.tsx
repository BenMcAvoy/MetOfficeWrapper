import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Share, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone) return true;
  return document.referrer.startsWith('android-app://');
}

function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as Mac; distinguish by touch support
  if (ua.includes('Mac') && 'ontouchend' in document) return true;
  return false;
}

export default function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState<boolean>(isStandalone());
  const [showIosHint, setShowIosHint] = useState(false);
  const [iosEligible, setIosEligible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    if (isIos()) {
      setIosEligible(true);
    }

    const deferred = window.__wxDeferredInstallPrompt;
    if (deferred) setPromptEvent(deferred as BeforeInstallPromptEvent);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__wxDeferredInstallPrompt = e;
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onAvailable = () => {
      const ev = window.__wxDeferredInstallPrompt;
      if (ev) setPromptEvent(ev as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setHidden(true);
      setPromptEvent(null);
      window.__wxDeferredInstallPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('wx-install-available', onAvailable);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('wx-installed', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('wx-install-available', onAvailable);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('wx-installed', onInstalled);
    };
  }, []);

  if (hidden) return null;

  const onClickInstall = async () => {
    if (!promptEvent) return;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') setHidden(true);
      setPromptEvent(null);
    } catch {
      setPromptEvent(null);
    }
  };

  const dismissIosHint = () => {
    setShowIosHint(false);
  };

  if (promptEvent) {
    return (
      <button
        onClick={onClickInstall}
        className="flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all"
        aria-label="Install app"
      >
        <Download className="h-3 w-3" strokeWidth={2.25} />
        Install
      </button>
    );
  }

  if (iosEligible) {
    return (
      <>
        <button
          onClick={() => setShowIosHint(true)}
          className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all"
          aria-label="Install app"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={2.5} />
          Install
        </button>
        {showIosHint && createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)',
              paddingLeft: 'calc(env(safe-area-inset-left) + 1rem)',
              paddingRight: 'calc(env(safe-area-inset-right) + 1rem)',
            }}
            onClick={dismissIosHint}
          >
            <div
              className="bg-background rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-3 relative my-auto"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={dismissIosHint}
                className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
              <h2 className="font-semibold text-base">Install on iPhone</h2>
              <ol className="text-sm space-y-2 text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-semibold text-foreground">1.</span>
                  <span>Tap the <Share className="inline h-4 w-4 mx-0.5 -mt-0.5" /> Share button in Safari's toolbar.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-foreground">2.</span>
                  <span>Scroll down and tap <span className="font-medium text-foreground">Add to Home Screen</span>.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-foreground">3.</span>
                  <span>Tap <span className="font-medium text-foreground">Add</span> to confirm.</span>
                </li>
              </ol>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return null;
}
