"use client";
import { useRef } from "react";

/**
 * Toplu işlem düğmeleri. İşlem adı gizli alanla gönderilir: gönderen düğmenin name/value değeri
 * sunucu eylemine her zaman ulaşmadığı için (sessizce boş kalıyordu) düğmeler formu kendisi gönderir.
 */
export function BulkOps({ ops }: { ops: { value: string; label: string; quiet?: boolean; danger?: boolean; className?: string }[] }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={input} type="hidden" name="op" defaultValue="" />
      {ops.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.className ?? `btn sm${o.quiet ? " quiet" : ""}${o.danger ? " danger" : ""}`}
          onClick={(e) => {
            if (input.current) input.current.value = o.value;
            e.currentTarget.form?.requestSubmit();
          }}
        >
          {o.label}
        </button>
      ))}
    </>
  );
}
