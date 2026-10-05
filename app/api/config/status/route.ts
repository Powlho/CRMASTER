import { NextResponse } from "next/server";

// Lu à chaque requête : sinon Next fige la réponse au moment du build, et une clé ajoutée
// ensuite dans .env.local resterait invisible.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    assemblyAI: Boolean(process.env.ASSEMBLYAI_API_KEY),
    notion: Boolean(process.env.NOTION_API_KEY && process.env.NOTION_DATABASE_ID),
    auth: Boolean(process.env.APP_PASSWORD && process.env.AUTH_SECRET),
  });
}
