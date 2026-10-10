/**
 * Hitap: varsayılan ad soyad. "Bey/Hanım" yalnızca cinsiyet kullanıcı tarafından
 * kesin olarak işaretlenmişse kullanılır; isimden tahmin edilmez (Deniz, Ümit gibi
 * isimler iki cinsiyette de kullanılır, yanlış hitap kötü ilk izlenim bırakır).
 */
import { normalizeName } from "./names";
import type { Salutation } from "./wizard";

export type KnownGender = "kadin" | "erkek" | undefined;

export function salutationFor(fullName: string, style: Salutation, gender?: KnownGender): string {
  const name = normalizeName(fullName);
  if (style === "bey_hanim" && gender) {
    const first = name.split(" ")[0]!;
    return `${first} ${gender === "kadin" ? "Hanım" : "Bey"}`;
  }
  return name;
}
