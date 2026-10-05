import type { Meeting } from "./types";
import { getReportFormat } from "./reportFormats";

// Mise en forme texte d'une réunion, partagée par la copie, l'impression PDF, l'export Word
// et l'envoi vers Notion : tous affichent les mêmes noms d'intervenants et les mêmes sections.

export function speakerLabel(meeting: Meeting, speaker: string): string {
  return meeting.speakerNames?.[speaker]?.trim() || `Intervenant ${speaker}`;
}

/** Intervenants dans l'ordre de leur première prise de parole. */
export function speakersOf(meeting: Meeting): string[] {
  const seen: string[] = [];
  for (const u of meeting.transcriptUtterances ?? []) {
    if (!seen.includes(u.speaker)) seen.push(u.speaker);
  }
  return seen;
}

export function formatMeetingDate(meeting: Meeting): string {
  const d = new Date(`${meeting.date}T${meeting.time || "00:00"}`);
  if (Number.isNaN(d.getTime())) return meeting.date;
  const day = d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return meeting.time ? `${day} à ${meeting.time}` : day;
}

export function meetingInfoLines(meeting: Meeting): string[] {
  const lines = [
    `Date : ${formatMeetingDate(meeting)}`,
    `Type : ${meeting.type === "visio" ? "Visioconférence" : "Présentiel"}`,
  ];
  if (meeting.participants.trim()) lines.push(`Participants : ${meeting.participants.trim()}`);
  return lines;
}

/** Sections « compte rendu » (hors transcription), dans l'ordre d'affichage. */
export function reportSections(meeting: Meeting): { title: string; text: string }[] {
  const sections: { title: string; text: string }[] = [];
  const format = getReportFormat(meeting.reportFormat);
  if (meeting.formattedReport?.trim()) {
    sections.push({
      title: format.prompt ? format.label : "Compte rendu",
      text: meeting.formattedReport.trim(),
    });
  }
  if (meeting.transcriptSummary?.trim()) {
    sections.push({ title: "Résumé", text: meeting.transcriptSummary.trim() });
  }
  return sections;
}

/** Transcription découpée par prise de parole (speaker null si non identifié). */
export function transcriptTurns(meeting: Meeting): { speaker: string | null; text: string }[] {
  if (meeting.transcriptUtterances && meeting.transcriptUtterances.length > 0) {
    return meeting.transcriptUtterances.map((u) => ({
      speaker: speakerLabel(meeting, u.speaker),
      text: u.text,
    }));
  }
  return meeting.transcriptText?.trim() ? [{ speaker: null, text: meeting.transcriptText.trim() }] : [];
}

export function transcriptAsText(meeting: Meeting): string {
  return transcriptTurns(meeting)
    .map((t) => (t.speaker ? `${t.speaker} : ${t.text}` : t.text))
    .join("\n\n");
}

export function reportAsText(meeting: Meeting): string {
  const parts = [meeting.title, ...meetingInfoLines(meeting)];
  for (const section of reportSections(meeting)) {
    parts.push("", section.title.toUpperCase(), section.text);
  }
  return parts.join("\n");
}

/** Nom de fichier sans accents ni caractères spéciaux, ex. « 2026-10-05-Point-hebdo ». */
export function fileBaseName(meeting: Meeting): string {
  const base = `${meeting.date}-${meeting.title}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "reunion";
}
