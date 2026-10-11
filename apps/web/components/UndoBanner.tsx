import { canUndo } from "@hfo/core";
import { prisma } from "@hfo/db";
import { undoAction } from "@/app/(app)/kampanyalar/[id]/actions";

const TEXT: Record<string, (n: number) => string> = {
  "people.ok": (n) => `${n} kişi uygun sayıldı.`,
  "people.skip": (n) => `${n} kişi atlandı.`,
  "people.exclude": () => "Kurumlar hariç tutuldu.",
  "people.never": (n) => `${n} kişi kalıcı olarak listeden çıkarıldı.`,
};

/** Son toplu işlemi 10 dakika içinde geri almayı sağlar. */
export async function UndoBanner({ auditId, workspaceId, back }: { auditId?: string; workspaceId: string; back: string }) {
  if (!auditId) return null;
  const log = await prisma.auditLog.findFirst({ where: { id: auditId, workspaceId } });
  if (!log) return null;
  const n = (log.details as { count?: number } | null)?.count ?? 0;
  const text = TEXT[log.action]?.(n) ?? "İşlem tamamlandı.";
  const can = canUndo(log, new Date());
  return (
    <div className="banner warning" role="status" style={{ background: "var(--sunk)", borderColor: "var(--line)" }}>
      <span className="dot ok" style={{ marginTop: 6 }} />
      <div className="txt"><b>{log.undoneAt ? "Geri alındı." : text}</b>{can && <p>10 dakika içinde geri alabilirsiniz.</p>}</div>
      {can && (
        <form action={undoAction}>
          <input type="hidden" name="auditId" value={log.id} />
          <input type="hidden" name="back" value={back} />
          <button className="btn sm">Geri al</button>
        </form>
      )}
    </div>
  );
}
