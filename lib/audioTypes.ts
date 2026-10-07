// Types de fichiers acceptés, partagés entre le navigateur (import) et le serveur.

// Types acceptés à l'envoi et seuls types renvoyés tels quels à la lecture : le type stocké
// ne doit jamais permettre de servir autre chose que de l'audio (ex. text/html).
// Les vidéos mp4/webm sont acceptées pour importer un enregistrement Teams ou Zoom.
export const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/aac": "aac",
  "audio/flac": "flac",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

// Variantes de noms renvoyées selon les navigateurs et systèmes.
const TYPE_ALIASES: Record<string, string> = {
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/mp3": "audio/mpeg",
  "audio/x-flac": "audio/flac",
  "audio/x-aac": "audio/aac",
};

// Certains systèmes ne donnent pas de type au fichier : on se fie alors à l'extension.
const TYPE_BY_EXTENSION: Record<string, string> = {
  webm: "audio/webm",
  weba: "audio/webm",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aac: "audio/aac",
  flac: "audio/flac",
  mp4: "video/mp4",
};

export const IMPORT_ACCEPT =
  "audio/*,video/mp4,video/webm," +
  Object.keys(TYPE_BY_EXTENSION)
    .map((ext) => `.${ext}`)
    .join(",");

export function normalizeAudioType(raw: string | null): string | null {
  let type = (raw ?? "").split(";")[0].trim().toLowerCase();
  type = TYPE_ALIASES[type] ?? type;
  return type in AUDIO_EXTENSIONS ? type : null;
}

export function audioTypeOfFile(file: { name: string; type: string }): string | null {
  const fromType = normalizeAudioType(file.type);
  if (fromType) return fromType;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TYPE_BY_EXTENSION[ext] ?? null;
}
