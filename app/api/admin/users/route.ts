import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/data/adminGuard";
import { createUser, listUsers, type UserRole } from "@/lib/data/users";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const users = await listUsers();
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = (await req.json()) as {
    username?: string;
    password?: string;
    role?: UserRole;
    notionEnabled?: boolean;
  };

  if (!body.username?.trim() || !body.password || body.password.length < 6) {
    return NextResponse.json(
      { error: "Nom d'utilisateur requis et mot de passe d'au moins 6 caractères." },
      { status: 400 }
    );
  }

  try {
    const user = await createUser({
      username: body.username.trim(),
      password: body.password,
      role: body.role === "admin" ? "admin" : "user",
      notionEnabled: Boolean(body.notionEnabled),
    });
    return NextResponse.json(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        notionEnabled: user.notionEnabled,
        createdAt: user.createdAt,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de la création." },
      { status: 400 }
    );
  }
}
