"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { createCompany, updateCompany, type CompanyState } from "./actions";

export function CompanyForm({ company }: { company?: { id: string; name: string; website: string | null; description: string | null } }) {
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
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <div className="row"><SubmitButton className="btn primary">{company ? "Kaydet" : "Şirketi ekle"}</SubmitButton></div>
    </form>
  );
}
