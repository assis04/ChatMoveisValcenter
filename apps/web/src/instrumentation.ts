// Next 15: instrumentation.ts e estavel (sem flag experimental). register() roda
// UMA vez quando o server sobe. Usamos so pra ligar o auto-aquecedor do cache de
// grupos — que mantem o Redis L2 sempre quente e mata o "cache frio" que fazia a
// lista de grupos demorar de vez em quando. So no runtime nodejs (nao no edge,
// nao durante o build). Tudo best-effort: se algo falhar aqui, o app segue normal.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { startGroupsWarmer } = await import("@/lib/evolution/groups-warmer");
    startGroupsWarmer();
  } catch {
    // nunca derruba o boot do server por causa do aquecedor
  }
}
