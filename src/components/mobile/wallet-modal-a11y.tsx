"use client";

import { useEffect } from "react";

/**
 * The wallet library's Connect sheet, made usable from a keyboard: its close button gets a
 * name, focus moves to the first wallet when it opens (its own Tab trap then holds) and goes
 * back to whatever opened it when it closes.
 */
export function WalletModalA11y() {
  useEffect(() => {
    let opener: HTMLElement | null = null;
    let open = false;
    const sync = () => {
      const modal = document.querySelector<HTMLElement>(".wallet-adapter-modal");
      if (modal && !open) {
        open = true;
        opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        modal.querySelector(".wallet-adapter-modal-button-close")?.setAttribute("aria-label", "Close");
        requestAnimationFrame(() =>
          modal.querySelector<HTMLElement>(".wallet-adapter-modal-list .wallet-adapter-button")?.focus()
        );
      } else if (!modal && open) {
        open = false;
        if (opener && document.contains(opener)) opener.focus();
        opener = null;
      }
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
