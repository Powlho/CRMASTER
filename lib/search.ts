import type { Meeting } from "./types";
import { speakerLabel } from "./meetingText";

// Recherche sans tenir compte des accents ni des majuscules : « reunion » trouve « Réunion ».
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export interface SearchHit {
  meeting: Meeting;
  /** Extrait du texte autour du premier mot trouvé dans le contenu (pas le titre). */
  snippet: { before: string; match: string; after: string; source: string } | null;
}

function fields(meeting: Meeting): { source: string; text: string }[] {
  const transcript =
    meeting.transcriptUtterances && meeting.transcriptUtterances.length > 0
      ? meeting.transcriptUtterances
          .map((u) => `${speakerLabel(meeting, u.speaker)} : ${u.text}`)
          .join(" ")
      : meeting.transcriptText ?? "";
  return [
    { source: "Titre", text: meeting.title },
    { source: "Participants", text: meeting.participants },
    { source: "Intervenants", text: Object.values(meeting.speakerNames ?? {}).join(" ") },
    { source: "Notes", text: meeting.notes },
    { source: "Compte rendu", text: meeting.formattedReport ?? "" },
    { source: "Résumé", text: meeting.transcriptSummary ?? "" },
    { source: "Transcription", text: transcript },
  ];
}

/** Tous les mots de la recherche doivent apparaître quelque part dans la réunion. */
export function searchMeetings(meetings: Meeting[], query: string): SearchHit[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const hits: SearchHit[] = [];
  for (const meeting of meetings) {
    const all = fields(meeting);
    const haystack = normalize(all.map((f) => f.text).join("\n"));
    if (!terms.every((t) => haystack.includes(t))) continue;

    let snippet: SearchHit["snippet"] = null;
    for (const field of all.slice(3)) {
      // La normalisation garde la même longueur pour le français courant (accents
      // décomposés puis retirés caractère par caractère) : les positions correspondent.
      const normalized = normalize(field.text);
      if (normalized.length !== field.text.length) continue;
      const index = normalized.indexOf(terms[0]);
      if (index === -1) continue;
      const start = Math.max(0, index - 60);
      const end = Math.min(field.text.length, index + terms[0].length + 80);
      snippet = {
        source: field.source,
        before: (start > 0 ? "…" : "") + field.text.slice(start, index),
        match: field.text.slice(index, index + terms[0].length),
        after: field.text.slice(index + terms[0].length, end) + (end < field.text.length ? "…" : ""),
      };
      break;
    }
    hits.push({ meeting, snippet });
  }
  return hits;
}
