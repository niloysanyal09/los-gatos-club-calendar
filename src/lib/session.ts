import { cookies } from "next/headers";
import { prisma } from "./db";

const COOKIE = "jarvis_uid";

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

export async function getSessionUser() {
  const id = await getSessionUserId();
  if (!id) return null;
  return prisma.user.findUnique({ where: { id }, include: { profile: true } });
}

export async function clearSessionUser() {
  const store = await cookies();
  // Same path the cookie was written with, or the browser keeps the old one.
  store.set(COOKIE, "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
}

export async function setSessionUser(userId: string) {
  const store = await cookies();
  store.set(COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}
