# Arayüz ve yapı planı (ProspectHalo ekranlarından çıkarılan ihtiyaçlar)

## ProspectHalo'nun yapısı (68 ekran görüntüsü, ~16 benzersiz ekran)
Ana menü: Home · Agents · Leads · Accounts · Inbox · Content (kapsam dışı) · Analytics · Settings.

**Agents (liste)**: kart başına ad, durum, açma/kapama, 4 sayaç (ulaşılan/davet/kabul/yanıt), "Open". Üstte "gönderim hesapları" şeridi.
**Agent detay sekmeleri**: Overview · Leads · Sequence · Approve · Replies · Settings.
- Overview: 5 kutu (ulaşılan x/y, davet, kabul %, yanıt, nitelikli olumlu) + 30 günlük olay grafiği, sağda olay listesi (keşfedilen, ulaşılan, bağlanan, yanıtlayan, nitelikli, toplantı niyeti, onaylı randevu, geri dönen, başarısız).
- Sequence: görsel akış tuvali (adım, koşul "bağlantı kabul edildi mi", evet/hayır dalı, bekleme), sağda adım paneli (eylem, zamanlama, AI-yönlendirmeli / özel mesaj). Yanıt gelince akış kendiliğinden durur.
- Settings alt menüsü: General · Sending · Accounts · Targeting · Intent signals · Autonomy · Learning · Notifications · Integration · Danger zone.
  - General: ad, hedef, teklif, ton, "Sales playbook".
  - Sending: gün seçimi (Pzt–Paz), başlangıç/bitiş, saat dilimi; "güvenli aralık için en az 8 saat" uyarısı.
  - Accounts: bu temsilcinin kullanacağı hesaplar.
  - Targeting: özet kutusu (kişiler/şirketler/konum), unvanlar, sektör, konum, şirket büyüklüğü, şirket adı anahtar kelimeleri, "İnce ayar" (hariç unvan, hariç şirket sözcükleri, iş arayanları atla, kıdem, işlev, bağlantı mesafesi), satın alma tetikleyicileri, ek arama sözcükleri, **Zorunlu/Tercihli nitelik kuralları**, takipçi/bağlantı/şirket çalışan üst sınırı, **kararsız adaylar için 3 seçenek** (kanıtlı olanları ekle / at / bekletip bana sor).
  - Intent signals: 6 açılır grup (kişi etkinliği, şirketiniz, etkileşim, iş ilanları, uzmanlar, rakipler).
  - Autonomy: çalışma modu (bul+ulaş / yalnız bul), onay düzeyi (ilk adım / otomatik / her adım), otomatik yanıt, dönüşüm hedefi, toplantı linki, kişiyi araştır, güncel sinyali davet notuna kat.
  - Learning: bağlantı notu deneyi (notsuz / notlu / sıcak notlu, 14 gün), olumlu sonuçlar, terfi/ret sayıları, reddedilen profil örnekleri, sorgu verimi.
  - Notifications, Integration (webhook, alan eşleme, yanıt bildirimi), Danger zone.
**Leads**: tablo (kişi, sinyal, niyet puanı, kanal, durum, tarih), arama, Filtre/Sütun/Dışa aktar, toplu seçim, içe aktarma.
**Inbox**: niyete göre süzgeç (Hepsi, İlgili, Toplantı, Soru, İtiraz, İlgisiz, Belirsiz), sol liste + sağ konuşma.
**Accounts**: hesap kartı, sağlık durumu, günlük davet/mesaj limiti (±), son 24 saat ve haftalık sayaç çubukları, "eski bekleyen davetleri temizle" anahtarı.

## Bizdeki durum ve planlanan işler
Sıralama: önce kullanıcıya en çok değer katan, sonra kalan.

| # | İş | Şu an | Yapılacak |
|---|---|---|---|
| 1 | Kampanya ayarları: alt menülü yapı | Sekmeler dağınık (Hedefleme, Seçenekler, Mesajlar…) | Kampanya → Ayarlar altında Genel · Gönderim · Hedefleme · Sinyaller · Özerklik · Öğrenme · Bildirim · Entegrasyon · Tehlikeli alan |
| 2 | Kampanya başına gönderim penceresi | Yalnız hesap takvimi | Kampanya gün/saat penceresi + "güvenli aralık" doğrulaması |
| 3 | Hesaplar: sayaçlar ve temizlik | Takvim ve anahtar var | 24 saat/haftalık sayaç çubukları, günlük limit ±, eski davetleri temizle anahtarı |
| 4 | Nitelik kuralları | Tek serbest metin | Zorunlu / Tercihli ayrımı, üst sınırlar (takipçi, bağlantı, çalışan) |
| 5 | Kararsız adaylar | Belirsiz kuyruğu | Kampanya başına 3 seçenek: ekle / at / bekle |
| 6 | Genel Bakış | Sayılar | 5 kutu + 30 günlük olay grafiği + olay listesi |
| 7 | Gelen kutusu | Liste | Niyet süzgeçleri + sol/sağ konuşma düzeni |
| 8 | Kişiler tablosu | Var | Süzgeç, sütun seçimi, toplu işlem, puan sütunu |
| 9 | Akış tuvali | Liste biçimli adımlar | Koşul adımı ("kabul edildi mi") ve bekleme süresini gösteren görsel akış |
| 10 | Öğrenme | A/B sonucu | Not deneyi özeti, ret nedenleri, sorgu verimi |
| 11 | Bildirim ve webhook | Panel uyarıları | E-posta/webhook (ücretsiz seçenekle) |
| 12 | Niyet sinyalleri | Yok | Önce profil ziyareti ve etkinlik sinyali; diğerleri LinkedIn'den okunabildiği ölçüde |

Bilerek yapılmayanlar: içerik/gönderi üretimi, ücretli entegrasyonlar.
Tasarım ilkesi: ProspectHalo'nun bilgi mimarisinden ilham, görünüm bizim mevcut tasarım dilimizde (kopya değil).

## Durum (11 Ekim 2026)
Tamamlandı ve yayında: çoklu şirket + en fazla 5 aktif temsilci · kampanya ayarları alt menüsü (Genel, Gönderim, Hedefleme, Özerklik, Seçenekler, Öğrenme, Entegrasyon, Tehlikeli alan) · kampanyaya özel gönderim penceresi (planlayıcıya bağlı) · tercihli ölçüt, iş arayanı atlama, kararsız aday politikası (keşif sonuç işleyicisine bağlı) · "yalnızca bul" modu · webhook (imzalı, deneme gönderimi) · hesap sayaçları ve eski davet temizleme anahtarı · genel bakış grafiği · analitik sayfası · gelen kutusu süzgeçleri · kişi arama/sıralama · akış şeması.

Yapılmadı (bilerek): içerik üretimi; e-posta bildirimi (ücretsiz gönderici yok; webhook ile Zapier/Make üzerinden e-postaya bağlanabilir); niyet sinyalleri (iş ilanı, rakip, uzman izleme) — LinkedIn'den güvenilir okunamadığı için; Sales Navigator'a bağlı filtreler (kıdem, işlev, şirket büyüklüğü).
