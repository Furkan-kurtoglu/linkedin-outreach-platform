# HeAlthFintel Outreach

**LinkedIn'de sağlık ve finans alanındaki karar vericilere ulaşmak için ekibin kendi kurduğu, ücretsiz ve çok kullanıcılı iletişim platformu.**

Panelden şirket ve kampanya tanımlarsınız; platform doğru kişileri bulur, davetleri haftalık güvenli sınırın içinde gün ve saatlere yayar, bağlantı kabul edildiği anda onayladığınız mesajı gönderir, gelen cevapları etiketler ve sıcak fırsatları ayrı bir panoda toplar. LinkedIn işlemleri hesabın sahibinin kendi bilgisayarında, kendi Chrome oturumuyla yapılır; LinkedIn şifresi hiçbir yerde saklanmaz.

Canlı panel: <https://healthfintel-outreach.vercel.app> (yalnızca izinli e-postalar girebilir)

## Ne işe yarar

| Alan | Yapabildikleriniz |
| --- | --- |
| **Şirketler** | Birden fazla şirket ekleyin; her şirkete ayrı temsilci (kampanya) atayın. Aynı anda en fazla **5 aktif temsilci** çalışır. |
| **Kampanyalar** | Sihirbazla veya hazır şablonla kurun. Akış (ziyaret → davet → mesaj → takip), hedefleme, gönderim saatleri, otomatik geri çekme, A/B, öğrenme ve webhook ayarları kampanya bazında açılıp kapanır. |
| **Kişi bulma** | Arama kriterlerinden aday toplar; unvan, sektör, kurum ve hariç tutma kurallarıyla puanlar; belirsiz adaylar için "sor / ele / güçlü olanı kabul et" seçeneği sunar. |
| **Onay kuyruğu** | Kural denetimine takılan veya sizin onay istediğiniz mesajlar gitmeden önce burada bekler. |
| **Gelen kutusu** | Cevaplar etiketlenir (ilgili, ertele, ilgisiz, toplantı…), filtrelenir ve buradan yanıtlanır. |
| **Fırsatlar** | Sıcak görüşmeler süreç panosunda aşama aşama izlenir. |
| **Analitik** | Davet, kabul, cevap ve toplantı oranları; günlük grafikler; kampanya ve şablon karşılaştırması. |
| **Hesaplar** | LinkedIn hesabının bağlantı durumu, haftalık davet sayacı, yerel çalışan anahtarı. |
| **Belgeler** | Mesajlara eklenecek PDF vb. dosyalar. |

Kapsam dışı (bilerek): içerik/paylaşım üretimi, ücretli e-posta bildirimi (bunun yerine imzalı webhook ile Zapier/Make bağlanır), LinkedIn'den güvenilir okunamayan niyet sinyalleri.

## Mimari

```
Tarayıcı ──► Panel (Next.js, Vercel) ──► Supabase PostgreSQL
                    ▲
                    │ HTTPS + bağlantı anahtarı (hfo_…)
                    │
        Yerel çalışan (Playwright + Chrome)  ◄── kullanıcının kendi bilgisayarı, kendi LinkedIn oturumu
```

| Klasör | Ne |
| --- | --- |
| `apps/web` | Panel (Next.js 15, React 19, Supabase Auth, Prisma). Planlayıcı ve yerel çalışanın API'si de burada. |
| `apps/runner` | Yerel çalışan. Panelden sıradaki işi ister, Chrome'da yapar, sonucu bildirir. Windows ve Mac. |
| `packages/core` | Yapay zekâsız motor: akış, zamanlama, bütçeler, puanlama, mesaj kuralları, cevap etiketleme, öğrenme. Vitest ile test edilir. |
| `packages/db` | Prisma şeması ve elle yazılmış SQL göçleri. |
| `docs` | KVKK aydınlatma metni, arayüz planı, tasarım notları. |

### Nasıl çalışır

1. Çalışan dakikada bir "sıradaki iş ne?" diye sorar. Panel o an planlama yapar (zamanlanmış görev gerekmez) ve zamanı gelmiş en öncelikli işi verir.
2. Planlama; haftalık 180 davet sınırı, günlük bütçe, kampanya payları, gönderim pencereleri, tatiller, kurum başına sınır ve akış adımlarına göre yapılır. Son kontrol işi verirken tekrar yapılır.
3. Çalışan işi Chrome'da insan gibi aralıklarla yapar. İki gönderim arasında en az 45 sn bekler; LinkedIn uyarısında gönderim 24 saat duraklar.
4. Kabul edilen bağlantılar düzenli taranır; kabul edene detay mesajı kısa süre içinde (gece ise sabah) gider.
5. Her mesaj gönderilmeden önce kural denetiminden geçer: yasak ifade, hariç kurum, karakter sınırı, zorunlu link. Geçmeyen mesaj onaya düşer.

## Güvenlik ve KVKK

- LinkedIn şifresi istenmez ve saklanmaz; oturum yalnızca kullanıcının bilgisayarındaki ayrı Chrome profilinde durur.
- Çalışan veritabanına bağlanmaz; yalnızca kendi anahtarıyla sınırlı uçlara erişir (anahtarın yalnızca özeti saklanır).
- Tüm tablolarda Row Level Security açıktır. Panele yalnızca `ALLOWED_EMAILS` listesindekiler ve davet edilenler girer.
- Webhook'lar HMAC-SHA256 ile imzalanır (`X-HFO-Signature`), yalnızca https kabul eder, iç ağ adreslerine karşı korumalıdır.
- Cevap vermeyenlerin verisi ayarlanan süre sonunda silinir; "bir daha yazma" ve silme taleplerinde yalnızca profil linkinin özeti tutulur.
- Kişi verisi hiçbir yapay zekâ servisine gönderilmez. `.env` ve tarayıcı profilleri repoya girmez.
- `docs/kvkk-aydinlatma.md` yayınlanmadan önce köşeli parantezli alanlar doldurulmalı ve hukuki incelemeden geçmelidir.

## Maliyet

Hiçbir ücretli servis gerekmez: Vercel Hobby, Supabase ücretsiz katman, GitHub Actions.

## Kurulum

Panel ve çalışan kurulumu adım adım **[KURULUM.md](KURULUM.md)** içindedir. Çalışanı ilk kez kullanırken `pnpm runner --kontrol` ile yalnızca kendi profilinizi okutup seçicileri deneyin, sonra normal çalıştırın.

## Geliştirme

```
pnpm install
pnpm --filter @hfo/core test        # motor testleri
pnpm --filter @hfo/web exec tsc --noEmit
pnpm dev                            # panel (POSTGRES_* ve Supabase değişkenleri gerekir)
```

CI her gönderimde testleri, tip kontrolünü, derlemeyi ve göçlerin şemayla birebir uyduğunu denetler. Vercel derlemesi `prisma migrate deploy` çalıştırıp ardından `next build` yapar.

## Mobil ve ekran uyumu

Panel telefondan geniş ekrana kadar çalışır: ≤900 px'te sol menü çekmeceye dönüşür (üstte menü düğmesi), tablolar yatay kayar, kampanya alt menüsü kaydırılabilir şerit olur; 380 px'e kadar ve kısa (yatay telefon) ekranlar için ayrı kurallar vardır.
