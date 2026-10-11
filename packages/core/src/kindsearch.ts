import type { InstitutionKind } from "./institutions";

/** Kurum türü seçilince LinkedIn'de aranacak sözcükler; sigorta gibi merkezi şirketler il il aranmaz. */
export const KIND_SEARCH: Partial<Record<InstitutionKind, { label: string; keywords: string[]; byCity: boolean }>> = {
  HOSPITAL: { label: "Hastane", keywords: ["özel hastane", "hastane", "hospital"], byCity: true },
  MEDICAL_CENTER: { label: "Tıp merkezi", keywords: ["tıp merkezi", "sağlık merkezi", "poliklinik", "medical center"], byCity: true },
  CLINIC: { label: "Klinik", keywords: ["özel klinik", "estetik klinik", "göz merkezi", "tüp bebek merkezi", "fizik tedavi merkezi"], byCity: true },
  DENTAL: { label: "Diş", keywords: ["diş kliniği", "ağız ve diş sağlığı merkezi", "dental"], byCity: true },
  INSURER: { label: "Sigorta", keywords: ["sigorta şirketi", "sağlık sigortası", "hayat sigortası", "emeklilik şirketi", "sigorta"], byCity: false },
};

/** Geçerli kurum türleri; kampanyanın hedef türleri bu listeye göre doğrulanır. */
export const ALL_KINDS: InstitutionKind[] = ["HOSPITAL", "MEDICAL_CENTER", "CLINIC", "DENTAL", "INSURER", "OTHER"];
export const parseKinds = (v: unknown): InstitutionKind[] => (Array.isArray(v) ? v.filter((x): x is InstitutionKind => ALL_KINDS.includes(x as InstitutionKind)) : []);
