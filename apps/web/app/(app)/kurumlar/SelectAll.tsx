"use client";

/** Tablodaki sayfadaki tüm kutuları işaretler / kaldırır. */
export function SelectAll({ formId }: { formId: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Sayfadaki hepsini seç"
      onChange={(e) => {
        const on = e.currentTarget.checked;
        document.querySelectorAll<HTMLInputElement>(`#${formId} input[name="ids"]`).forEach((i) => (i.checked = on));
      }}
    />
  );
}
