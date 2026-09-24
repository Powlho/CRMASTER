import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/data/adminGuard";
import { countAdmins, deleteUser, getUserById, updateUser, type UserRole } from "@/lib/data/users";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = (await req.json()) as {
    password?: string;
    role?: UserRole;
    notionEnabled?: boolean;
  };

  if (body.password && body.password.length < 6) {
    return NextResponse.json(
      { error: "Le mot de passe doit contenir au moins 6 caractères." },
      { status: 400 }
    );
  }

  const target = await getUserById(params.id);
  if (!target) {
    return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
  }
  if (target.role === "admin" && body.role === "user" && (await countAdmins()) <= 1) {
    return NextResponse.json(
      { error: "Impossible de retirer le dernier compte administrateur." },
      { status: 400 }
    );
  }

  const updated = await updateUser(params.id, body);
  if (!updated) {
    return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
  }
  return NextResponse.json({
    id: updated.id,
    username: updated.username,
    role: updated.role,
    notionEnabled: updated.notionEnabled,
    createdAt: updated.createdAt,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  if (params.id === user.id) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas supprimer votre propre compte." },
      { status: 400 }
    );
  }

  const target = await getUserById(params.id);
  if (target?.role === "admin" && (await countAdmins()) <= 1) {
    return NextResponse.json(
      { error: "Impossible de supprimer le dernier compte administrateur." },
      { status: 400 }
    );
  }

  await deleteUser(params.id);
  return NextResponse.json({ ok: true });
}
