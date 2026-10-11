"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { applyBulk } from "@/lib/bulk";
import { requireContext } from "@/lib/context";

/** Karar bekleyenler birden fazla kampanyadan gelebilir; toplu işlem çalışma alanı genelinde uygulanır. */
export async function bulkReview(form: FormData) {
  const ctx = await requireContext();
  const logId = await applyBulk(ctx, String(form.get("op")), form.getAll("ap").map(String));
  revalidatePath("/", "layout");
  redirect(`/kisi-bulma?sekme=karar${logId ? `&geri=${logId}` : ""}`);
}
