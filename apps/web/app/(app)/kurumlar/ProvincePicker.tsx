"use client";
import { useState } from "react";

const BIG10 = ["İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana", "Konya", "Gaziantep", "Kocaeli", "Mersin"];
const tr = (s: string) => s.toLocaleLowerCase("tr-TR");

/** İl seçimi: onay kutuları, arama, "tümünü seç / temizle". Seçilenler `name` alanıyla gönderilir. */
export function ProvincePicker({ provinces, name, initial = [] }: { provinces: string[]; name: string; initial?: string[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set(initial));
  const [q, setQ] = useState("");
  const shown = provinces.filter((p) => tr(p).includes(tr(q.trim())));
  const toggle = (p: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  return (
    <div className="stack" style={{ gap: 8 }}>
      {[...sel].map((p) => <input key={p} type="hidden" name={name} value={p} />)}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="İl ara…" aria-label="İl ara" style={{ maxWidth: 180 }} />
        <button type="button" className="btn sm" onClick={() => setSel(new Set(provinces))}>Tüm 81 ili seç</button>
        <button type="button" className="btn sm" onClick={() => setSel(new Set(BIG10.filter((p) => provinces.includes(p))))}>En büyük 10 il</button>
        <button type="button" className="btn sm" onClick={() => setSel(new Set())}>Temizle</button>
        <span className="sub" aria-live="polite">{sel.size === 0 ? "İl seçilmedi: Türkiye geneli tek arama yapılır" : `${sel.size} il seçili`}</span>
      </div>
      <div role="group" aria-label="İller" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 2, maxHeight: 220, overflow: "auto", border: "1px solid var(--line, #ddd)", borderRadius: 6, padding: 8 }}>
        {shown.map((p) => (
          <label key={p} className="row" style={{ gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={sel.has(p)} onChange={() => toggle(p)} /> {p}
          </label>
        ))}
        {!shown.length && <span className="sub">Eşleşen il yok.</span>}
      </div>
    </div>
  );
}
