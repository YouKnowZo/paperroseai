import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-paperrose-turnstile]");
      const script = existing || document.createElement("script");
      const cleanupPromiseListeners = () => {
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onError);
        window.clearTimeout(timer);
      };
      let onLoad;
      let onError;
      let timer;
      const finish = () => {
        if (window.turnstile) resolve(window.turnstile);
        else reject(new Error("Human verification could not initialize."));
      };
      const fail = () => reject(new Error("Could not load human verification."));
      onLoad = () => {
        script.dataset.loaded = "true";
        script.dataset.loading = "false";
        cleanupPromiseListeners();
        finish();
      };
      onError = () => {
        script.dataset.loading = "false";
        cleanupPromiseListeners();
        script.remove();
        fail();
      };
      timer = window.setTimeout(() => {
        cleanupPromiseListeners();
        script.remove();
        fail();
      }, 15000);
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });

      if (!existing) {
        script.src = SCRIPT_URL;
        script.async = true;
        script.defer = true;
        script.dataset.paperroseTurnstile = "true";
        script.dataset.loading = "true";
        document.head.appendChild(script);
      } else if (window.turnstile || existing.dataset.loaded === "true") {
        cleanupPromiseListeners();
        finish();
      } else {
        script.dataset.loading = "true";
      }
    }).catch((error) => {
      scriptPromise = null;
      throw error;
    });
  }
  return scriptPromise;
}

const TurnstileWidget = forwardRef(function TurnstileWidget({ siteKey, onToken, onError }, ref) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const tokenCallbackRef = useRef(onToken);
  const errorCallbackRef = useRef(onError);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    tokenCallbackRef.current = onToken;
    errorCallbackRef.current = onError;
  }, [onToken, onError]);

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
      tokenCallbackRef.current?.("");
      setStatus("loading");
    },
  }), []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    if (!siteKey) {
      setStatus("error");
      errorCallbackRef.current?.("Human verification is not configured.");
      return () => { cancelled = true; };
    }

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current || !siteKey) return;
        containerRef.current.replaceChildren();
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "auto",
          action: "paperrose_scan",
          callback: (token) => {
            setStatus("verified");
            tokenCallbackRef.current?.(token);
          },
          "expired-callback": () => {
            setStatus("expired");
            tokenCallbackRef.current?.("");
          },
          "error-callback": () => {
            setStatus("error");
            tokenCallbackRef.current?.("");
            errorCallbackRef.current?.("Human verification had a problem. Please try again.");
          },
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus("error");
          errorCallbackRef.current?.(error.message);
        }
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
        containerRef.current?.replaceChildren();
      }
    };
  }, [siteKey, attempt]);

  return (
    <div className="turnstile-wrap">
      <div ref={containerRef} />
      {status === "loading" && <span className="turnstile-status">Loading human verification…</span>}
      {status === "expired" && <span className="turnstile-status">Verification expired — complete it again.</span>}
      {status === "error" && <><span className="turnstile-status turnstile-status-error">Verification unavailable. Check the connection and try again.</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => { tokenCallbackRef.current?.(""); errorCallbackRef.current?.(""); setAttempt((value) => value + 1); }}>Retry verification</button></>}
    </div>
  );
});

export default TurnstileWidget;
