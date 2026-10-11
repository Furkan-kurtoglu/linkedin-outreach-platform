import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma, type LinkedinAccount } from "@hfo/db";

/** Yeni bağlantı anahtarı: yalnızca bir kez gösterilir, veritabanında özeti tutulur. */
export function newRunnerToken(): { token: string; hash: string } {
  const token = `hfo_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token) };
}

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** İstekteki "Authorization: Bearer ..." anahtarına ait hesap; yoksa null. */
export async function runnerAccount(req: Request): Promise<LinkedinAccount | null> {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(hfo_[A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  return prisma.linkedinAccount.findFirst({ where: { runnerTokenHash: hashToken(m[1]!) } });
}

export const unauthorized = () => Response.json({ error: "Bağlantı anahtarı geçersiz. Panelden yeni anahtar oluşturun." }, { status: 401 });
