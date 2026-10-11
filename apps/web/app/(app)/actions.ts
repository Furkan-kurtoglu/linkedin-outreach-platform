"use server";
import { prisma } from "@hfo/db";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";

export async function hideOnboarding() {
  const ctx = await requireContext();
  await prisma.workspace.update({ where: { id: ctx.workspace.id }, data: { onboardingDone: { push: "hidden" } } });
  revalidatePath("/");
}
