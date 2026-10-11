# HeAlthFintel Outreach

LinkedIn için kendi iletişim platformumuz. Panelden kampanya kurulur, davetler seçilen gün ve saatlere yayılır, bağlantı kabul edildiği anda onaylı detay mesajı gider; cevaplar gelen kutusunda etiketlenir.

Hiçbir ücretli servis kullanılmaz (Vercel Hobby, Supabase ücretsiz katman, isteğe bağlı Gemini ücretsiz katman). Kurulum: **[KURULUM.md](KURULUM.md)**.

## Yapı

| Klasör | Ne |
| --- | --- |
| `apps/web` | Panel (Next.js): kampanyalar, mesaj düzenleyici, kişiler, onay kuyruğu, gelen kutusu, fırsatlar, belgeler, hesaplar, ayarlar; yerel çalışanın API'si ve planlayıcı |
| `apps/runner` | Yerel çalışan: kullanıcının bilgisayarında LinkedIn işlemlerini Chrome ile yapar (Windows ve Mac) |
| `packages/core` | Motor (yapay zekâsız): akış, zamanlama, bütçeler, kişi puanlama, şablon üretimi ve kural denetimi, kişiselleştirme, cevap etiketleme, A/B, öğrenme; panel–çalışan sözleşmesi |
| `packages/db` | Veritabanı şeması ve göçler (Prisma, Supabase PostgreSQL) |
| `apps/web/prototype` | Tıklanabilir tasarım prototipi |
| `docs/kvkk-aydinlatma.md` | KVKK aydınlatma metni (yayınlamadan önce köşeli parantezli alanlar doldurulur) |

## Nasıl çalışır

1. Yerel çalışan dakikada bir panele "sıradaki iş ne?" diye sorar. Panel o an planlama yapar (zamanlanmış görev gerekmez) ve zamanı gelmiş en öncelikli işi verir.
2. Planlama motorda yapılır: haftalık/günlük davet bütçesi, kampanya payları, gönderim saatleri ve tatiller, kurum başına sınır, akış adımları ve seçenekler.
3. Çalışan işi Chrome'da yapar ve sonucu bildirir. Kabul edilen bağlantılar 10 dakikada bir kontrol edilir; kabul edene detay mesajı 1–5 dakika içinde (gece ise ertesi sabah) gider.
4. Her mesaj gönderilmeden önce kural denetiminden geçer (yasak ifade, hariç kurum, süre vaadi, karakter sınırı, zorunlu link). Geçmeyen mesaj gönderilmez, onaya düşer.

## Güvenlik ve KVKK

- LinkedIn şifresi hiçbir yerde saklanmaz; oturum yalnızca kullanıcının bilgisayarındaki ayrı Chrome profilindedir.
- Çalışan veritabanına bağlanmaz; yalnızca kendi bağlantı anahtarıyla paneldeki sınırlı uçlara erişir (anahtarın yalnızca özeti saklanır).
- Tüm tablolarda Row Level Security açıktır; Supabase'in herkese açık API'si verilere erişemez.
- Panele yalnızca `ALLOWED_EMAILS` listesindekiler ve ekibe davet edilenler kayıt olabilir.
- Cevap vermeyenlerin verisi ayarlanan süre sonunda otomatik silinir; "bir daha yazma" ve KVKK silme taleplerinde yalnızca profil linkinin özeti tutulur.
- `.env` ve tarayıcı profilleri repoya girmez.

## Geliştirme

```
pnpm install
pnpm --filter @hfo/core test      # motor testleri
pnpm --filter @hfo/web typecheck
pnpm dev                          # panel (POSTGRES_* ve Supabase değişkenleri gerekir)
pnpm runner                       # yerel çalışan
```
