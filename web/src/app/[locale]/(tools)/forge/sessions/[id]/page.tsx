import { sessionStore } from "@/lib/forge/session-store";
import { SessionProgress } from "./_components/SessionProgress";

interface PageProps {
  params: Promise<{ id: string; locale: string }>;
}

export default async function ForgeSessionPage({ params }: PageProps) {
  const { id } = await params;
  const session = sessionStore.get(id);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Forge session</h1>
      </div>

      <SessionProgress
        sessionId={id}
        eventsUrl={`/api/v1/forge/sessions/${id}/events`}
        initialStatus={session?.status ?? "created"}
        worktreePath={session?.worktreePath ?? ""}
      />
    </div>
  );
}
