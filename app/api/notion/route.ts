import { NextRequest, NextResponse } from "next/server";
import { getUserById } from "@/lib/data/users";

const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const BLOCK_TEXT_LIMIT = 1900;
const BLOCKS_PER_REQUEST = 100;

interface NotionProperty {
  type: string;
}

type Block = Record<string, unknown>;

function heading(content: string): Block {
  return {
    object: "block",
    type: "heading_2",
    heading_2: { rich_text: [{ type: "text", text: { content } }] },
  };
}

function paragraph(content: string): Block {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [{ type: "text", text: { content } }] },
  };
}

function chunkText(text: string, size = BLOCK_TEXT_LIMIT): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

type NotionResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; status: number };

// Erreurs Notion les plus courantes, traduites avec la marche à suivre.
function describeNotionError(status: number, body: { code?: string; message?: string }): string {
  switch (body.code) {
    case "unauthorized":
      return "Notion refuse la clé (NOTION_API_KEY) : vérifiez le jeton de l'intégration dans .env.local, puis redémarrez l'application.";
    case "object_not_found":
    case "restricted_resource":
      return "Base Notion introuvable : vérifiez NOTION_DATABASE_ID et que la base est bien connectée à l'intégration (sur la page de la base : ••• → Connexions → votre intégration).";
    case "rate_limited":
      return "Notion limite temporairement les envois : réessayez dans une minute.";
    case "validation_error":
      return `Notion a refusé la page : ${body.message ?? "données invalides"}`;
  }
  return `Erreur Notion (${status})${body.message ? ` : ${body.message}` : ""}`;
}

async function notionFetch(path: string, init: RequestInit): Promise<NotionResult> {
  let res: Response;
  try {
    res = await fetch(`${NOTION_BASE}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    const cause = (err as { cause?: { code?: string } })?.cause?.code;
    console.error(`[notion] ${path} :`, err);
    return {
      ok: false,
      status: 502,
      error: `Le serveur n'arrive pas à joindre Notion${cause ? ` (${cause})` : ""}. Réessayez dans un instant.`,
    };
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const error = describeNotionError(res.status, data as { code?: string; message?: string });
    console.error(`[notion] ${path} : ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
    return { ok: false, status: 502, error };
  }
  return { ok: true, data };
}

// NOTION_DATABASE_ID accepte l'identifiant seul ou le lien complet de la base (copié depuis
// le navigateur : …/Ma-base-1a2b3c…?v=…).
function normalizeDatabaseId(raw: string): string {
  const beforeQuery = raw.trim().split("?")[0];
  const dashed = beforeQuery.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (dashed) return dashed[0];
  const plain = beforeQuery.match(/[0-9a-f]{32}(?![0-9a-f])/i);
  return plain ? plain[0] : raw.trim();
}

export async function POST(req: NextRequest) {
  try {
    return await sendToNotion(req);
  } catch (err) {
    console.error("[notion] erreur inattendue :", err);
    return NextResponse.json(
      { error: "Erreur interne pendant l'envoi vers Notion (voir pm2 logs crmaster)." },
      { status: 500 }
    );
  }
}

async function sendToNotion(req: NextRequest) {
  const apiKey = process.env.NOTION_API_KEY?.trim();
  const databaseId = normalizeDatabaseId(process.env.NOTION_DATABASE_ID ?? "");
  if (!apiKey || !databaseId) {
    return NextResponse.json(
      { error: "NOTION_API_KEY et/ou NOTION_DATABASE_ID ne sont pas configurés sur le serveur." },
      { status: 500 }
    );
  }

  const userId = req.headers.get("x-user-id");
  const user = userId ? await getUserById(userId) : undefined;
  if (!user?.notionEnabled) {
    return NextResponse.json(
      { error: "L'envoi vers Notion n'est pas activé pour votre compte." },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    title: string;
    date: string;
    time: string;
    type: string;
    participants: string;
    summary: string | null;
    transcript: string;
    /** speaker = nom affiché (« Marie » ou « Intervenant A »), déjà résolu par le client. */
    utterances: { speaker: string; text: string }[] | null;
    formattedReport: string | null;
    formattedReportLabel: string | null;
  };

  if (!body?.title) {
    return NextResponse.json({ error: "Données de la réunion manquantes." }, { status: 400 });
  }

  const headers = {
    authorization: `Bearer ${apiKey}`,
    "Notion-Version": NOTION_VERSION,
    "content-type": "application/json",
  };

  const dbRes = await notionFetch(`/databases/${databaseId}`, { headers });
  if (!dbRes.ok) return NextResponse.json({ error: dbRes.error }, { status: dbRes.status });
  const db = dbRes.data as { properties?: Record<string, NotionProperty> };
  if (!db.properties) {
    return NextResponse.json(
      { error: "Réponse inattendue de Notion pour la base (pas de propriétés)." },
      { status: 502 }
    );
  }

  const titlePropName = Object.entries(db.properties).find(
    ([, prop]) => prop.type === "title"
  )?.[0];
  if (!titlePropName) {
    return NextResponse.json(
      { error: "Aucune propriété de titre trouvée dans la base Notion." },
      { status: 500 }
    );
  }
  const datePropName = Object.entries(db.properties).find(([, prop]) => prop.type === "date")?.[0];

  const properties: Record<string, unknown> = {
    [titlePropName]: { title: [{ text: { content: body.title } }] },
  };
  if (datePropName && body.date) {
    properties[datePropName] = { date: { start: body.date } };
  }

  const blocks: Block[] = [
    heading("Informations"),
    paragraph(
      `Type : ${body.type} · Date : ${body.date} ${body.time} · Participants : ${
        body.participants || "—"
      }`
    ),
  ];

  if (body.formattedReport) {
    blocks.push(heading(body.formattedReportLabel || "Compte rendu"));
    for (const chunk of chunkText(body.formattedReport)) blocks.push(paragraph(chunk));
  }

  if (body.summary) {
    blocks.push(heading("Résumé"));
    for (const chunk of chunkText(body.summary)) blocks.push(paragraph(chunk));
  }

  blocks.push(heading("Transcription complète"));
  const transcriptText =
    body.utterances && body.utterances.length > 0
      ? body.utterances.map((u) => `${u.speaker} : ${u.text}`).join("\n\n")
      : body.transcript;
  for (const chunk of chunkText(transcriptText)) blocks.push(paragraph(chunk));

  const pageRes = await notionFetch("/pages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
      children: blocks.slice(0, BLOCKS_PER_REQUEST),
    }),
  });
  if (!pageRes.ok) return NextResponse.json({ error: pageRes.error }, { status: pageRes.status });
  const page = pageRes.data as { id: string; url: string };

  // Notion limite à 100 blocs par requête : la suite d'une longue transcription est ajoutée
  // ensuite. Si cet ajout échoue, la page existe déjà : on le signale sans la recréer.
  const remaining = blocks.slice(BLOCKS_PER_REQUEST);
  for (let i = 0; i < remaining.length; i += BLOCKS_PER_REQUEST) {
    const appended = await notionFetch(`/blocks/${page.id}/children`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ children: remaining.slice(i, i + BLOCKS_PER_REQUEST) }),
    });
    if (!appended.ok) {
      return NextResponse.json({
        url: page.url,
        warning: `Page créée, mais la fin de la transcription n'a pas pu être ajoutée : ${appended.error}`,
      });
    }
  }

  return NextResponse.json({ url: page.url });
}
