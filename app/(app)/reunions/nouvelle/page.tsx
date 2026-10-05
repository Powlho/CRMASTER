"use client";

import { useRouter } from "next/navigation";
import { useMeetings } from "@/lib/store";
import MeetingForm from "@/components/MeetingForm";

export default function NewMeetingPage() {
  const router = useRouter();
  const { createMeeting } = useMeetings();

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">Nouvelle réunion</h1>
      <p className="mb-8 text-sm text-slate-500">
        Renseignez les informations de la réunion. Vous pourrez lancer l&apos;enregistrement
        (ou importer un fichier audio) depuis sa page dédiée.
      </p>
      <MeetingForm
        submitLabel="Créer la réunion"
        onCancel={() => router.push("/")}
        onSubmit={async (input) => {
          const meeting = await createMeeting(input);
          router.push(`/reunions/${meeting.id}`);
        }}
      />
    </div>
  );
}
