import type { Metadata } from "next";
import "./globals.css";
import { ThemeSync } from "@/components/ThemeSync";

export const metadata: Metadata = {
  title: "Chatcenter",
  description: "Central de atendimento inteligente",
};

// Lê o tema do Chatwoot pai (iframe mesma origem) ANTES de pintar, pra abrir no
// tema certo sem flash. O Chatwoot alterna a classe `dark` no <body> dele;
// standalone (sem pai) cai no escuro por padrão.
const themeBootstrap = `
(function () {
  try {
    var isDark = true;
    if (window.parent && window.parent !== window) {
      isDark = window.parent.document.body.classList.contains('dark');
    }
    document.documentElement.classList.toggle('dark', isDark);
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="bg-background text-foreground antialiased">
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
