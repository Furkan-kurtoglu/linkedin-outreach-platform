/** Türkçe metin yardımcıları: büyük/küçük harf duyarsız arama ve normalleştirme. */

export function lowerTr(s: string): string {
  return s.toLocaleLowerCase("tr-TR");
}

/** Karşılaştırma için sadeleştirir: küçük harf, Türkçe karakterleri ASCII'ye indirger, fazla boşluğu siler. */
export function fold(s: string): string {
  return lowerTr(s)
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** `haystack` içinde `needle` geçiyor mu (Türkçe ve aksan duyarsız)? */
export function containsFolded(haystack: string, needle: string): boolean {
  const n = fold(needle);
  return n.length > 0 && fold(haystack).includes(n);
}

/** Cümle sonunu düzeltir: boşlukları kırpar, sonda nokta yoksa ekler. */
export function sentence(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return "";
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/** İlk harfi büyütür (Türkçe kurallarla). */
export function capFirst(s: string): string {
  const t = s.trim();
  return t ? t.charAt(0).toLocaleUpperCase("tr-TR") + t.slice(1) : t;
}

/** Baştaki büyük harfi küçültür; cümle içine yerleştirmek için. */
export function lowerFirst(s: string): string {
  const t = s.trim();
  if (!t) return t;
  // Kısaltma ya da özel isimle başlıyorsa (ör. "SGK", "HeAlthFintel") dokunma.
  const firstWord = t.split(/\s/)[0]!;
  if (firstWord.length > 1 && firstWord.slice(1) !== lowerTr(firstWord.slice(1))) return t;
  return t.charAt(0).toLocaleLowerCase("tr-TR") + t.slice(1);
}

/** Son noktalama işaretini kaldırır. */
export function stripEnd(s: string): string {
  return s.trim().replace(/[.!?…]+$/, "");
}

/**
 * Hariç kurum kuralı eşleşiyor mu? Kural "Acıbadem -Bupa" biçiminde yazılırsa kurum adında
 * Acıbadem geçer ama Bupa geçmiyorsa eşleşir (Bupa Acıbadem Sigorta hariç sayılmaz).
 */
export function matchesExcludedCompany(company: string, rule: string): boolean {
  const [base = "", ...except] = rule.split(/\s+-/);
  if (!containsFolded(company, base)) return false;
  return !except.some((x) => containsFolded(company, x));
}
