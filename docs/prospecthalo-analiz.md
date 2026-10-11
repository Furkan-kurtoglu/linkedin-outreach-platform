# ProspectHalo analizi ve bizdeki karşılığı

Kaynak: ekran görüntüleri + iki temsilcinin canlı ayarları. Amaç kopyalamak değil, ihtiyaç listesini çıkarmak.

## ProspectHalo yapısı
- **Temsilci (agent)**: ad, hedef, teklif metni, ton, kanal, durum; çalışma modu (yalnız bul / bul ve ulaş), inceleme modu (otomatik / ilk adım / her adım).
- **Akış**: davet → kabul bekle (en çok 14 gün) → koşul "kabul edildi mi" → mesaj; hayır dalı biter. Davet notu stratejisi: notsuz / notlu / sinyale göre kişiselleştirilmiş.
- **Hedefleme**: unvanlar, sektör, konum, anahtar kelime, şirket büyüklüğü, "açık çalışmaya hazır" hariç, zorunlu/tercihli ek kriterler; emin olunamayan adaylar için ekle/at/bekle.
- **Sinyaller**: bağlantı kabulü, profil görüntüleme, gönderi beğeni/yorum, iş değişikliği, yakın LinkedIn etkinliği, işe alım, rakip ve uzman izleme.
- **Hesap limitleri**: 24 saatte davet/mesaj sayacı, haftalık 200 davet, gönderim penceresi (aralık güvenli değilse uyarı), eski bekleyen davetleri temizleme.
- **Öğrenme**: not deneyi (notsuz/notlu/sıcak not), olumlu sonuçlar, reddedilen profil örnekleri, sorgu verimi.
- **Gelen kutusu**: niyet süzgeçleri (ilgili, toplantı, soru, itiraz, ilgisiz, belirsiz), otomatik yanıt (autopilot), bildirimler, webhook/CRM.
- **Kişiler**: niyet puanı, sinyaller, kanal, durum, dışa aktarma, sütun/süzgeç; **Analitik**: 30 günlük olay grafiği.
- İçerik üretimi bölümü: bilerek kapsam dışı.

## Karşılaştırma
| İhtiyaç | Bizde | Durum |
|---|---|---|
| Akış, bekleme, kabul dalı, geri çekme | Akış sekmesi, 21 gün geri çekme | Var |
| Gönderim penceresi, hafta içi/sonu | Hesaplar → takvim + uyarı | Var |
| Onay modları | Her şey / ilk adım / otomatik | Var |
| Şablon sürümleme, A/B | Var | Var |
| Belirsiz aday incelemesi | Kişi bulma → inceleme | Var |
| Yasaklı ifade, kurum hariç tutma | Var | Var |
| Randevu linki, açık profil, InMail, İngilizce | Seçenek olarak | Var |
| 24 saatlik sayaç paneli | Yalnız planlayıcı içinde | Eksik |
| Gelen kutusu niyet süzgeci | Yanıt sınıflandırma var, süzgeç yok | Eksik |
| Bildirim / webhook | Uyarılar panelde | Eksik |
| Not deneyi içgörüleri | A/B var, özet ekranı yok | Eksik |
| Analitik grafiği | Sayı var, grafik yok | Eksik |
| Hazır kampanya başlangıçları | Bu sürümle eklendi | Yeni |
