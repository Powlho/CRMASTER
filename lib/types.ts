export type MeetingType = "visio" | "presentiel";

export type MeetingStatus =
  | "planifiee"
  | "enregistrement_en_cours"
  | "enregistree"
  | "transcription_en_cours"
  | "transcrite";

export type TranscriptionStatus =
  | "indisponible"
  | "en_attente_outil"
  | "en_cours"
  | "terminee";

export type NotionStatus = "non_configure" | "a_envoyer" | "envoyee";

export interface Meeting {
  id: string;
  title: string;
  type: MeetingType;
  date: string;
  time: string;
  participants: string;
  notes: string;
  status: MeetingStatus;
  transcriptionStatus: TranscriptionStatus;
  notionStatus: NotionStatus;
  recordingDurationSec: number | null;
  createdAt: string;
  /** Fichier de la bibliothèque audio (stocké sur le serveur) utilisé pour la transcription. */
  audioId?: string;
  assemblyTranscriptId?: string;
  transcriptText?: string;
  transcriptSummary?: string;
  notionPageUrl?: string;
}

export type NewMeetingInput = Pick<
  Meeting,
  "title" | "type" | "date" | "time" | "participants" | "notes"
>;

export interface AudioFile {
  id: string;
  title: string;
  source: "download" | "upload";
  sourceUrl: string | null;
  platform: string | null;
  durationSec: number | null;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AudioDownloadJob {
  id: string;
  url: string;
  status: "running" | "done" | "error";
  progress: number;
  title: string | null;
  error: string | null;
  audioId: string | null;
  startedAt: string;
}
