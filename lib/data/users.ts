import { promises as fs } from "fs";
import path from "path";
import { hashPassword, verifyPassword } from "@/lib/passwords";

export type UserRole = "admin" | "user";

export interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  notionEnabled: boolean;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  username: string;
  role: UserRole;
  notionEnabled: boolean;
  createdAt: string;
}

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

let writeQueue: Promise<unknown> = Promise.resolve();

async function ensureFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(USERS_FILE);
  } catch {
    await fs.writeFile(USERS_FILE, "[]", "utf-8");
  }
}

async function readAll(): Promise<StoredUser[]> {
  await ensureFile();
  const raw = await fs.readFile(USERS_FILE, "utf-8");
  try {
    return JSON.parse(raw) as StoredUser[];
  } catch {
    return [];
  }
}

function writeAll(users: StoredUser[]): Promise<void> {
  writeQueue = writeQueue.then(() => fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf-8"));
  return writeQueue as Promise<void>;
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    notionEnabled: user.notionEnabled,
    createdAt: user.createdAt,
  };
}

/**
 * Crée le premier compte admin (nom d'utilisateur "admin") à partir de APP_PASSWORD si
 * aucun utilisateur n'existe encore. Retourne l'id de l'admin (existant ou nouvellement créé),
 * ou null si aucun admin ne peut être déterminé (pas d'utilisateurs et pas d'APP_PASSWORD).
 */
export async function ensureBootstrapAdmin(): Promise<string | null> {
  const users = await readAll();
  const existingAdmin = users.find((u) => u.role === "admin");
  if (existingAdmin) return existingAdmin.id;

  const bootstrapPassword = process.env.APP_PASSWORD;
  if (!bootstrapPassword) return null;

  const admin: StoredUser = {
    id: crypto.randomUUID(),
    username: "admin",
    passwordHash: await hashPassword(bootstrapPassword),
    role: "admin",
    notionEnabled: true,
    createdAt: new Date().toISOString(),
  };
  await writeAll([admin, ...users]);
  return admin.id;
}

export async function listUsers(): Promise<PublicUser[]> {
  const users = await readAll();
  return users.map(toPublicUser);
}

export async function getUserById(id: string): Promise<StoredUser | undefined> {
  const users = await readAll();
  return users.find((u) => u.id === id);
}

export async function getUserByUsername(username: string): Promise<StoredUser | undefined> {
  const users = await readAll();
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase());
}

export async function verifyCredentials(username: string, password: string): Promise<StoredUser | null> {
  const user = await getUserByUsername(username);
  if (!user) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? user : null;
}

export async function createUser(input: {
  username: string;
  password: string;
  role: UserRole;
  notionEnabled: boolean;
}): Promise<StoredUser> {
  const users = await readAll();
  if (users.some((u) => u.username.toLowerCase() === input.username.toLowerCase())) {
    throw new Error("Ce nom d'utilisateur existe déjà.");
  }
  const user: StoredUser = {
    id: crypto.randomUUID(),
    username: input.username,
    passwordHash: await hashPassword(input.password),
    role: input.role,
    notionEnabled: input.notionEnabled,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeAll(users);
  return user;
}

export async function updateUser(
  id: string,
  patch: Partial<{ password: string; role: UserRole; notionEnabled: boolean }>
): Promise<StoredUser | undefined> {
  const users = await readAll();
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) return undefined;

  const updated = { ...users[index] };
  if (patch.password) updated.passwordHash = await hashPassword(patch.password);
  if (patch.role) updated.role = patch.role;
  if (patch.notionEnabled !== undefined) updated.notionEnabled = patch.notionEnabled;
  users[index] = updated;
  await writeAll(users);
  return updated;
}

export async function deleteUser(id: string): Promise<void> {
  const users = await readAll();
  await writeAll(users.filter((u) => u.id !== id));
}

export async function countAdmins(): Promise<number> {
  const users = await readAll();
  return users.filter((u) => u.role === "admin").length;
}
