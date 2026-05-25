"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ChatwootDashboardContext } from "@/types";

interface ContextValue {
  context: ChatwootDashboardContext;
  ready: boolean;
}

const Ctx = createContext<ContextValue>({ context: {}, ready: false });

// Chatwoot posts the context as `{ event: 'appContext', data: {...} }` once
// the iframe signals readiness via `{ event: 'appReady' }`.
// Older snippets used `{ type: 'chatwoot-dashboard-app:context' }`; we accept
// both shapes to stay compatible across Chatwoot versions.
export function DashboardContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [context, setContext] = useState<ChatwootDashboardContext>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const payload = event.data as
        | { event?: string; type?: string; data?: ChatwootDashboardContext }
        | undefined;
      if (!payload) return;

      const isAppContext =
        payload.event === "appContext" ||
        payload.type === "chatwoot-dashboard-app:context";
      if (isAppContext && payload.data) {
        setContext(payload.data);
        setReady(true);
      }
    };

    window.addEventListener("message", handler);
    // Notify Chatwoot we are ready to receive context.
    window.parent?.postMessage("chatwoot-dashboard-app:fetch-info", "*");
    window.parent?.postMessage({ event: "appReady" }, "*");

    return () => window.removeEventListener("message", handler);
  }, []);

  const value = useMemo(() => ({ context, ready }), [context, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChatwootContext(): ContextValue {
  return useContext(Ctx);
}
