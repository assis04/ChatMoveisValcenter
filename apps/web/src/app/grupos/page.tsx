import { GroupsListView } from "@/components/groups/GroupsListView";

export const metadata = {
  title: "Grupos · Chatcenter",
};

export default function GruposPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <GroupsListView />
    </main>
  );
}
