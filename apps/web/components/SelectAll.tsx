"use client";

/** Formdaki tüm kişi kutularını seçer/bırakır. */
export function SelectAll({ name = "ap" }: { name?: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Tümünü seç"
      onChange={(e) => {
        const form = e.currentTarget.form;
        form?.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"]`).forEach((x) => (x.checked = e.currentTarget.checked));
      }}
    />
  );
}
