import { NextRequest, NextResponse } from "next/server";
import { getUserById, type StoredUser } from "@/lib/data/users";

export async function requireAdmin(
  req: NextRequest
): Promise<{ user: StoredUser; error: null } | { user: null; error: NextResponse }> {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return { user: null, error: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };
  }
  const user = await getUserById(userId);
  if (!user || user.role !== "admin") {
    return {
      user: null,
      error: NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 }),
    };
  }
  return { user, error: null };
}
