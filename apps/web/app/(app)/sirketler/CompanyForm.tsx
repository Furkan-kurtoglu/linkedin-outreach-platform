"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { createCompany, updateCompany, type CompanyState } from "./actions";

export function CompanyForm({ company }: { company?: { id: string; name: string; website: string | null; description: string | null; logoV?: number } }) {
  const [state, action] = useActionState<CompanyState, FormData>(company ? updateCompany : createCompany, {});
  const k = company?.id ?? "yeni";
  return (
    <form action={action} className="stack">
      {company && <input type="hidden" name="id" value={company.id} />}
      <div className="field">
        <label htmlFor={`n-${k}`}>Şirket adı</label>
        <input type="text" id={`n-${k}`} name="name" defaultValue={company?.name} required maxLength={80} placeholder="Ör. HeAlthFintel" />
      </div>
      <div className="field">
        <label htmlFor={`w-${k}`}>Web sitesi <span className="sub" style={{ fontWeight: 400 }}>· isteğe bağlı</span></label>
        <input type="text" id={`w-${k}`} name="website" defaultValue={company?.website ?? ""} placeholder="https://www.ornek.com" />
      </div>
      <div className="field">
        <label htmlFor={`d-${k}`}>Kısa tanım <span className="sub" style={{ fontWeight: 400 }}>· isteğe bağlı</span></label>
        <textarea id={`d-${k}`} name="description" defaultValue={company?.description ?? ""} maxLength={400} style={{ minHeight: 64 }} />
        <span className="help">Ne yaptığınızı bir iki cümleyle yazın; yeni kampanya sihirbazında hatırlatma olarak görünür.</span>
      </div>
      <div className="field">
        <label htmlFor={`l-${k}`}>Logo <span className="sub" style={{ fontWeight: 400 }}>· isteğe bağlı</span></label>
        <div className="row">
          {company?.logoV ? <img src={`/logo/${company.id}?v=${company.logoV}`} alt="" className="brand-img" width={40} height={40} /> : null}
          <input type="file" id={`l-${k}`} name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
        </div>
        <span className="help">PNG, JPG, WebP veya SVG; en çok 100 KB, kare olursa en iyisi. Sol üstte ve şirket seçicide görünür; yoksa şirketin baş harfi kullanılır.</span>
        {company?.logoV ? <label className="row" style={{ fontSize: 13 }}><input type="checkbox" name="removeLogo" /> Mevcut logoyu kaldır</label> : null}
      </div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <div className="row"><SubmitButton className="btn primary">{company ? "Kaydet" : "Şirketi ekle"}</SubmitButton></div>
    </form>
  );
}
