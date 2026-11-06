import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import { assertInboxInScope } from "@/lib/security/context-token";
import { requireConnectedInstance } from "@/lib/chatwoot/instances";
import {
  ensureGroupContact,
  markGroupSynced,
  openGroupConversation,
} from "@/lib/chatwoot/group-contacts";
import { createGroup } from "@/lib/evolution/groups";
import {
  getGroups,
  invalidateGroupsCache,
  addCreatedGroupToCache,
} from "@/lib/evolution/groups-cache";
import { handleApiError } from "@/lib/api/errors";
import { assertGroupWriteAllowed } from "@/lib/evolution/group-write-guard";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// O cache (L1 memoria + L2 Redis, stale-while-revalidate) vive em
// @/lib/evolution/groups-cache — fonte unica compartilhada com o auto-aquecedor
// (instrumentation -> groups-warmer), pra rota e warmer nunca desincronizarem.

const createBody = z.object({
  inbox_id: z.number().int().positive(),
  subject: z.string().trim().min(1).max(100),
  participants: z.array(z.string().min(8)).min(1).max(256),
  description: z.string().trim().max(512).optional(),
});

// Trava contra grupo DUPLICADO: o mesmo nome no mesmo numero so pode ser criado
// uma vez a cada 2 min. A trava NAO sai quando a criacao da erro, porque a
// Evolution pode devolver erro com o grupo ja criado no WhatsApp.
const CREATE_LOCK_S = 120;

function createLockKey(instance: string, subject: string): string {
  const h = createHash("sha256").update(subject.trim().toLowerCase()).digest("hex");
  return `cmv:groups:create-lock:${instance}:${h.slice(0, 16)}`;
}

export async function GET(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    const inboxId = Number(req.nextUrl.searchParams.get("inbox_id") ?? "0");
    const includeParticipants =
      req.nextUrl.searchParams.get("participants") === "true";

    const gate = assertInboxInScope(req, inboxId);
    if (!gate.ok) return gate.response;

    const lookup = await requireConnectedInstance(gate.scope.accountId, inboxId);
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }

    const force = req.nextUrl.searchParams.get("refresh") === "true";
    if (force) invalidateGroupsCache(lookup.mapping.instance_name);

    const { groups, warming } = await getGroups(
      lookup.mapping.instance_name,
      includeParticipants,
    );
    return NextResponse.json({ inbox_id: inboxId, groups, warming });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    const input = createBody.parse(await req.json());
    const gate = assertInboxInScope(req, input.inbox_id);
    if (!gate.ok) return gate.response;
    const lookup = await requireConnectedInstance(gate.scope.accountId, input.inbox_id);
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }
    const instance = lookup.mapping.instance_name;

    // Protecao da conexao: espaca/limita escrita em grupo (gatilho device_removed)
    await assertGroupWriteAllowed(instance);

    const lock = await getRedis()
      ?.set(createLockKey(instance, input.subject), "1", "EX", CREATE_LOCK_S, "NX")
      .catch(() => "OK");
    if (lock === null) {
      return NextResponse.json(
        {
          error:
            "Um grupo com este nome acabou de ser criado neste número. Atualize a lista e confira antes de criar de novo.",
        },
        { status: 409 },
      );
    }

    let group;
    try {
      group = await createGroup({
        instance,
        subject: input.subject,
        participants: input.participants,
        ...(input.description ? { description: input.description } : {}),
      });
    } catch (err) {
      const detail = String((err as Error)?.message ?? err).slice(0, 200);
      console.warn(`[groups] criacao com erro em ${instance}: ${detail}`);
      return NextResponse.json(
        {
          error:
            "Não deu para confirmar a criação do grupo. Ele pode ter sido criado mesmo assim: aguarde 1 minuto, atualize a lista e confira antes de tentar de novo.",
          detail,
        },
        { status: 502 },
      );
    }

    // Fork Valcenter: INJETA o grupo novo no cache (nao invalida!). O JID vem
    // da resposta da Evolution; o nome usamos o que o usuario digitou (sempre temos).
    const g = group as { id?: string; groupJid?: string; jid?: string };
    const jid = g?.id ?? g?.groupJid ?? g?.jid;
    let conversationId: number | null = null;
    if (jid) {
      await addCreatedGroupToCache(instance, {
        id: String(jid),
        subject: input.subject,
        pictureUrl: null,
      });
      // Fork Valcenter (2026-11): registra o grupo no Chatwoot na hora (contato +
      // conversa atribuida a quem criou), sem esperar a 1a mensagem. Best-effort: o
      // grupo ja existe no WhatsApp; se isto falhar, o aquecedor cadastra o contato
      // no proximo ciclo (ate 20 min).
      try {
        const accountId = gate.scope.accountId;
        const contactId = await ensureGroupContact(accountId, input.inbox_id, String(jid), input.subject);
        await markGroupSynced(accountId, input.inbox_id, String(jid));
        conversationId = await openGroupConversation(
          accountId,
          input.inbox_id,
          contactId,
          gate.scope.userId,
        );
      } catch (err) {
        console.warn(
          `[groups] ${String(jid)} criado, mas nao registrado no Chatwoot: ${String((err as Error)?.message ?? err).slice(0, 200)}`,
        );
      }
    }
    return NextResponse.json(
      { inbox_id: input.inbox_id, group, conversation_id: conversationId },
      { status: 201 },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
