import { prisma } from "../db";

/**
 * Decides which User row a completed Google sign-in actually belongs to.
 *
 * Sign-in mints a shell User before bouncing to Google, so a returning user
 * comes back holding a brand new empty account. When the Google email already
 * has a row we adopt that row and drop the shell, which is what keeps a repeat
 * ad click from piling up duplicate accounts.
 *
 * The shell is only deleted when it really is a shell. Someone who filled in
 * the onboarding questions before linking Google has real answers on that row,
 * and quietly deleting them would be worse than leaving a stray record behind.
 */
export async function resolveGoogleUser(userId: string, email?: string): Promise<string> {
  if (!email) return userId;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing || existing.id === userId) return userId;

  const shell = await prisma.user.findUnique({
    where: { id: userId },
    include: { _count: { select: { candidates: true, feedback: true } } },
  });
  if (!shell) return existing.id;

  const isEmpty = !shell.address && shell._count.candidates === 0 && shell._count.feedback === 0;
  if (isEmpty) {
    // PreferenceProfile has no cascade rule, so it has to go first or the
    // user delete trips a foreign key constraint.
    await prisma.preferenceProfile.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  } else {
    console.warn(
      `google merge: user ${userId} had onboarding data, kept it and moved the session to ${existing.id}`
    );
  }

  return existing.id;
}
