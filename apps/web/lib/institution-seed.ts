import type { InstitutionDraft } from "@hfo/core";

const H = ["Memorial Sağlık Grubu", "Memorial Şişli Hastanesi", "Memorial Bahçelievler Hastanesi", "Memorial Ataşehir Hastanesi", "Medipol Mega Hastanesi", "Medicana Health Group", "Liv Hospital", "Amerikan Hastanesi", "Florence Nightingale Hastaneleri", "Medical Park Hastaneleri", "VM Medical Park", "Hisar Intercontinental Hospital", "Kolan International Hospital", "Kolan British Hospital", "Medistate Kavacık Hastanesi", "Tema Hastanesi", "Emsey Hospital", "Taksim Alman Hastanesi", "Surp Agop Hastanesi", "Batı Bahat Hastanesi", "Dünya Göz Hastaneleri", "Ethica Hospital"];
const I = ["Allianz Sigorta", "Bupa Acıbadem Sigorta", "Anadolu Sigorta", "Axa Sigorta", "Türkiye Sigorta", "Mapfre Sigorta", "Aksigorta", "HDI Sigorta", "Generali Sigorta", "Sompo Sigorta", "Neova Sigorta", "Ankara Sigorta", "Doğa Sigorta", "Ray Sigorta", "Gulf Sigorta", "Halk Sigorta", "QNB Sigorta", "Anadolu Hayat Emeklilik", "Allianz Yaşam ve Emeklilik", "Axa Hayat ve Emeklilik"];
const C = ["Estethica", "Estetik International", "Düzey Göz Merkezi", "Superplast Estetik Cerrahi Merkezi", "MetropolDoctors"];

const mk = (names: string[], kind: InstitutionDraft["kind"]): InstitutionDraft[] => names.map((name) => ({ name, rawName: name, kind, city: "İstanbul", source: "seed" }));

/** Bilinen büyük gruplar ve sigortacılar; resmî liste gelene kadar da kullanılabilir. */
export const SEED: InstitutionDraft[] = [...mk(H, "HOSPITAL"), ...mk(I, "INSURER"), ...mk(C, "CLINIC")];
