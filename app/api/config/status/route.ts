import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    assemblyAI: Boolean(process.env.ASSEMBLYAI_API_KEY),
    notion: Boolean(process.env.NOTION_API_KEY && process.env.NOTION_DATABASE_ID),
  });
}
