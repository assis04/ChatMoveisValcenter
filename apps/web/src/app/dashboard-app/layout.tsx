"use client";

import { useEffect, useState, useCallback } from "react";

interface ChatwootContext {
  conversation?: {
    id: number;
    inbox_id: number;
    status: string;
    contact_id: number;
  };
  contact?: {
    id: number;
    name: string;
    email: string;
    phone_number: string;
  };
  currentAgent?: {
    id: number;
    name: string;
    email: string;
  };
}

export default function DashboardAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [chatwootContext, setChatwootContext] = useState<ChatwootContext>({});

  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.data?.type === "chatwoot-dashboard-app:context") {
      setChatwootContext(event.data.data as ChatwootContext);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  return (
    <div
      className="min-h-screen bg-background"
      data-chatwoot-context={JSON.stringify(chatwootContext)}
    >
      {children}
    </div>
  );
}
