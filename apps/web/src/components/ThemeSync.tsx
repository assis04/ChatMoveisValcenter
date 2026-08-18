"use client";

import { useEffect } from "react";

// Mantém o tema do app em sincronia com o Chatwoot pai enquanto o iframe está
// aberto. O Chatwoot alterna `dark` no <body> dele; espelhamos no nosso <html>.
export function ThemeSync() {
  useEffect(() => {
    const parentBody =
      window.parent && window.parent !== window
        ? window.parent.document.body
        : null;
    if (!parentBody) return;

    const apply = () => {
      const isDark = parentBody.classList.contains("dark");
      document.documentElement.classList.toggle("dark", isDark);
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(parentBody, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
