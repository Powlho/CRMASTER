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

export interface TranscriptUtterance {
  speaker: string;
  text: string;
}

export interface MeetingAudio {
  mimeType: string;
  sizeBytes: number;
  savedAt: string;
}

export interface Meeting {
  id: string;
  userId: string;
  title: string;
  type: MeetingType;
  date: string;
  time: string;
  participants: string;
  notes: string;
  transcriptionProfile: string;
  reportFormat: string;
  speakersExpected?: number;
  status: MeetingStatus;
  transcriptionStatus: TranscriptionStatus;
  notionStatus: NotionStatus;
  recordingDurationSec: number | null;
  createdAt: string;
  audio?: MeetingAudio;
  /** Date de suppression automatique de l'audio (durée de conservation dépassée). */
  audioDeletedAt?: string;
  assemblyTranscriptId?: string;
  transcriptText?: string;
  transcriptSummary?: string;
  transcriptUtterances?: TranscriptUtterance[];
  /** Noms donnés aux intervenants détectés : { "A": "Marie", "B": "Jean" }. */
  speakerNames?: Record<string, string>;
  formattedReport?: string;
  notionPageUrl?: string;
  /** Événement Google Agenda à l'origine de la réunion. */
  googleEventId?: string;
}

export type NewMeetingInput = Pick<
  Meeting,
  | "title"
  | "type"
  | "date"
  | "time"
  | "participants"
  | "notes"
  | "transcriptionProfile"
  | "reportFormat"
  | "speakersExpected"
>;

/** Piste audio de la bibliothèque (récupérée depuis YouTube ou une autre plateforme). */
export interface LibraryFile {
  id: string;
  userId: string;
  title: string;
  sourceUrl: string | null;
  platform: string | null;
  durationSec: number | null;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AudioDownloadJob {
  id: string;
  userId: string;
  url: string;
  status: "running" | "done" | "error";
  progress: number;
  title: string | null;
  error: string | null;
  audioId: string | null;
  startedAt: string;
}
