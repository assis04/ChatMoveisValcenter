"use client";

import { Loader2 } from "lucide-react";
import { useChatwootContext } from "@/lib/chatwoot/dashboard-context";
import { useContact } from "@/hooks/use-contact";
import { GroupMembersPanel } from "@/components/groups/GroupMembersPanel";
import { GroupsListView } from "@/components/groups/GroupsListView";

export default function DashboardAppGroupsPage() {
  const { context, ready } = useChatwootContext();
  const contactId = context.conversation?.contact_id ?? null;
  const inboxId = context.conversation?.inbox_id ?? null;
  const { data: contact, loading: contactLoading } = useContact(contactId);

  if (!ready && contactId) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Conectando ao
        Chatwoot...
      </div>
    );
  }

  if (contactId && inboxId) {
    if (contactLoading) {
      return (
        <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
        </div>
      );
    }
    const jid = contact?.identifier ?? null;
    if (jid && jid.endsWith("@g.us")) {
      return (
        <div className="h-screen">
          <GroupMembersPanel inboxId={inboxId} jid={jid} />
        </div>
      );
    }
    return (
      <div className="flex h-screen items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm text-muted-foreground">
            Esta conversa não é um grupo.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Os controles de grupo aparecem somente em conversas com identificador{" "}
            <code>@g.us</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen">
      <GroupsListView />
    </div>
  );
}
