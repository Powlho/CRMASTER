import { NextRequest, NextResponse } from "next/server";
import { getUserById, toPublicUser } from "@/lib/data/users";

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
