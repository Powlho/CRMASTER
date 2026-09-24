import { NextRequest, NextResponse } from "next/server";

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

export async function POST(req: NextRequest) {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!apiKey || !databaseId) {
    return NextResponse.json(
      { error: "NOTION_API_KEY et/ou NOTION_DATABASE_ID ne sont pas configurés sur le serveur." },
      { status: 500 }
    );
  }

  const body = (await req.json()) as {
    title: string;
    date: string;
    time: string;
    type: string;
    participants: string;
    summary: string | null;
    transcript: string;
    utterances: { speaker: string; text: string }[] | null;
  };

  const headers = {
    authorization: `Bearer ${apiKey}`,
    "Notion-Version": NOTION_VERSION,
    "content-type": "application/json",
  };

  const dbRes = await fetch(`${NOTION_BASE}/databases/${databaseId}`, { headers });
  if (!dbRes.ok) {
    return NextResponse.json(
      {
        error: `Impossible de lire la base Notion (${dbRes.status}). Vérifiez que l'intégration a bien été partagée avec cette base.`,
      },
      { status: 502 }
    );
  }
  const db = (await dbRes.json()) as { properties: Record<string, NotionProperty> };

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

  if (body.summary) {
    blocks.push(heading("Résumé"));
    for (const chunk of chunkText(body.summary)) blocks.push(paragraph(chunk));
  }

  blocks.push(heading("Transcription complète"));
  const transcriptText =
    body.utterances && body.utterances.length > 0
      ? body.utterances.map((u) => `Intervenant ${u.speaker} : ${u.text}`).join("\n\n")
      : body.transcript;
  for (const chunk of chunkText(transcriptText)) blocks.push(paragraph(chunk));

  const pageRes = await fetch(`${NOTION_BASE}/pages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
      children: blocks.slice(0, BLOCKS_PER_REQUEST),
    }),
  });

  if (!pageRes.ok) {
    const errBody = await pageRes.text();
    return NextResponse.json(
      { error: `Échec de la création de la page Notion (${pageRes.status}): ${errBody}` },
      { status: 502 }
    );
  }

  const page = (await pageRes.json()) as { id: string; url: string };

  const remaining = blocks.slice(BLOCKS_PER_REQUEST);
  for (let i = 0; i < remaining.length; i += BLOCKS_PER_REQUEST) {
    const batch = remaining.slice(i, i + BLOCKS_PER_REQUEST);
    await fetch(`${NOTION_BASE}/blocks/${page.id}/children`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ children: batch }),
    });
  }

  return NextResponse.json({ url: page.url });
}
