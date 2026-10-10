# HeAlthFintel Outreach

LinkedIn için kendi outreach platformumuz: panelden temsilci kurulur, haftalık 180 davet 7 güne yayılarak gönderilir, bağlantı kabul edildiği anda onaylı şablondaki detay mesajı gider.

Hiçbir ücretli servis kullanılmaz. Kodun tamamı Claude tarafından yazılır. Ayrıntılı teknik plan proje dokümanındadır.

## Yapı

| Klasör | Ne |
| --- | --- |
| `apps/web` | Panel (Next.js): temsilciler, şablon stüdyosu, onay kuyruğu, gelen kutusu |
| `apps/runner` | Yerel çalışan: kullanıcının bilgisayarında LinkedIn'i Playwright ile kullanır (Windows ve Mac) |
| `packages/core` | Mesaj motoru (yapay zekâsız): sihirbaz soruları, şablon üretimi, kural denetimi, kişi puanlama, cevap etiketleme, A/B karşılaştırma, davet planlama; isteğe bağlı Gemini yardımcısı |
| `packages/db` | Veritabanı şeması (Prisma, Supabase PostgreSQL) |

## Durum

- [x] Faz 0: proje iskeleti, mesaj motoru (35 test), veri modeli, tıklanabilir prototip (`apps/web/prototype`)
- [ ] Faz 0: yerel çalışan prototipi, KVKK aydınlatma metni
- [ ] Faz 1: kayıt + hesap bağlama, temsilci ve şablonlar, gönderim motoru, kabulde anında mesaj
- [ ] Faz 2: kişi bulma, değerlendirme, şablon stüdyosu + yapay zekâ, gelen kutusu
- [ ] Faz 3: çoklu hesap, takip mesajları, raporlar, KVKK silme akışı

## Güvenlik

- LinkedIn şifresi hiçbir yerde saklanmaz; oturum yalnızca kullanıcının bilgisayarındaki tarayıcı profilinde kalır.
- `.env` dosyası ve tarayıcı profilleri `.gitignore` ile repoya girmez.
