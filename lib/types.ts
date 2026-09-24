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

export interface Meeting {
  id: string;
  title: string;
  type: MeetingType;
  date: string;
  time: string;
  participants: string;
  notes: string;
  transcriptionProfile: string;
  status: MeetingStatus;
  transcriptionStatus: TranscriptionStatus;
  notionStatus: NotionStatus;
  recordingDurationSec: number | null;
  createdAt: string;
  assemblyTranscriptId?: string;
  transcriptText?: string;
  transcriptSummary?: string;
  transcriptUtterances?: TranscriptUtterance[];
  notionPageUrl?: string;
}

export type NewMeetingInput = Pick<
  Meeting,
  "title" | "type" | "date" | "time" | "participants" | "notes" | "transcriptionProfile"
>;
