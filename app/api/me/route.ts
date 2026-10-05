import { NextRequest, NextResponse } from "next/server";
import { getUserById, toPublicUser, updateUser } from "@/lib/data/users";

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
  }
  return NextResponse.json(toPublicUser(user));
}

// Préférences que chacun peut modifier pour son propre compte (les droits restent à l'admin).
export async function PATCH(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const body = (await req.json()) as { notionReview?: unknown };
  if (typeof body.notionReview !== "boolean") {
    return NextResponse.json({ error: "Préférence invalide." }, { status: 400 });
  }
  const user = await updateUser(userId, { notionReview: body.notionReview });
  if (!user) {
    return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
  }
  return NextResponse.json(toPublicUser(user));
}
