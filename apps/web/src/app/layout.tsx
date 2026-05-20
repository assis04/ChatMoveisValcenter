import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chatcenter",
  description: "Central de atendimento inteligente",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
