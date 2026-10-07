export interface ReportFormat {
  id: string;
  label: string;
  description: string;
  /** null = pas de génération supplémentaire, on garde le texte brut + résumé standard. */
  prompt: string | null;
}

export const REPORT_FORMATS: ReportFormat[] = [
  {
    id: "brut",
    label: "Texte brut",
    description: "Transcription telle quelle, avec le résumé standard.",
    prompt: null,
  },
  {
    id: "medical",
    label: "Compte rendu médical",
    description: "Structuré comme un courrier de consultation (motif, examen, diagnostic, conduite à tenir).",
    prompt:
      "Tu es un assistant médical. À partir de la transcription de cette consultation, " +
      "rédige un compte rendu médical structuré en français, avec ces sections si elles " +
      "sont pertinentes : Motif de consultation, Anamnèse, Examen clinique, " +
      "Diagnostic / hypothèses diagnostiques, Conduite à tenir / prescriptions. " +
      "Adopte un style professionnel de courrier médical, concis et factuel. " +
      "N'invente aucune information absente de la transcription ; si une section n'a pas " +
      "d'information, omets-la plutôt que de spéculer.",
  },
  {
    id: "administratif",
    label: "Compte rendu administratif",
    description: "Structuré comme un relevé de décisions (points abordés, décisions, actions).",
    prompt:
      "Tu es un assistant administratif. À partir de la transcription de cette réunion, " +
      "rédige un compte rendu structuré en français avec ces sections : Points abordés, " +
      "Décisions prises, Actions à suivre (avec le responsable si mentionné), " +
      "Prochaines étapes. Sois concis et factuel. N'invente aucune information absente " +
      "de la transcription.",
  },
];

export function getReportFormat(id: string | undefined): ReportFormat {
  return REPORT_FORMATS.find((f) => f.id === id) ?? REPORT_FORMATS[0];
}
