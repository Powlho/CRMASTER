import { NextRequest, NextResponse } from "next/server";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { getMeetingById } from "@/lib/data/store";
import {
  fileBaseName,
  meetingInfoLines,
  reportSections,
  transcriptTurns,
} from "@/lib/meetingText";

export const dynamic = "force-dynamic";

// Un paragraphe Word par ligne : les retours à la ligne du texte sont conservés.
function textParagraphs(text: string): Paragraph[] {
  return text.split(/\r?\n/).map((line) => new Paragraph({ children: [new TextRun(line)] }));
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const meeting = await getMeetingById(params.id, userId);
  if (!meeting) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const includeTranscript = req.nextUrl.searchParams.get("transcription") !== "0";

  const children: Paragraph[] = [
    new Paragraph({ text: meeting.title, heading: HeadingLevel.TITLE }),
    ...meetingInfoLines(meeting).map(
      (line) => new Paragraph({ children: [new TextRun({ text: line, color: "555555" })] })
    ),
  ];

  for (const section of reportSections(meeting)) {
    children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }));
    children.push(...textParagraphs(section.text));
  }

  if (meeting.notes.trim()) {
    children.push(new Paragraph({ text: "Notes", heading: HeadingLevel.HEADING_1 }));
    children.push(...textParagraphs(meeting.notes.trim()));
  }

  const turns = transcriptTurns(meeting);
  if (includeTranscript && turns.length > 0) {
    children.push(new Paragraph({ text: "Transcription", heading: HeadingLevel.HEADING_1 }));
    for (const turn of turns) {
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [
            ...(turn.speaker ? [new TextRun({ text: `${turn.speaker} : `, bold: true })] : []),
            new TextRun(turn.text),
          ],
        })
      );
    }
  }

  const doc = new Document({
    creator: "CRMASTER",
    title: meeting.title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children }],
  });
  const buffer = await Packer.toBuffer(doc);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileBaseName(meeting)}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
