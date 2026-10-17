"use client";

/** Onay kuyruğunda tüm taslak kutularını işaretler / kaldırır. */
export function SelectAllJobs() {
  return (
    <label className="row" style={{ gap: 6 }}>
      <input
        type="checkbox"
        onChange={(e) => {
          const on = e.currentTarget.checked;
          document.querySelectorAll<HTMLInputElement>('input[name="ids"][form="bulk-form"]').forEach((i) => (i.checked = on));
        }}
      />
      Hepsini seç
    </label>
  );
}
