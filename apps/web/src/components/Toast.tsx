import { useEffect } from "react";

import { Icon, type IconName } from "./Icon";

export type ToastTone = "info" | "success" | "error";
export type ToastMessage = { id: number; text: string; tone: ToastTone };

const TONE_ICON: Record<ToastTone, IconName> = { info: "info", success: "check", error: "alert" };

/** Status messages. Errors stay until dismissed; other messages fade after a few seconds. */
export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast || toast.tone === "error") return;
    const timer = window.setTimeout(onDismiss, 6000);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          <Icon name={TONE_ICON[toast.tone]} size={16} />
          <p className="notice">{toast.text}</p>
          <button type="button" className="toast-close" aria-label="Dismiss message" onClick={onDismiss}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
