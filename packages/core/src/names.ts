/**
 * LinkedIn'den gelen isimleri hitaba uygun hale getirir.
 * "Huri CALAYIR" -> "Huri Calayır", "Ali okyay" -> "Ali Okyay".
 * Türkçe büyük/küçük harf kuralları (I/ı, İ/i) korunur.
 */
export function normalizeName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word.split("-").map(capitalizeTr).join("-"))
    .join(" ");
}

function capitalizeTr(word: string): string {
  if (word.length === 0) return word;
  const lower = word.toLocaleLowerCase("tr-TR");
  return lower.charAt(0).toLocaleUpperCase("tr-TR") + lower.slice(1);
}
