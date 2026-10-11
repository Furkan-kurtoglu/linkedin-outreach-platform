# Kurulum

İki parça var: **panel** (internette, herkes kendi hesabıyla girer) ve **yerel çalışan** (LinkedIn işlemlerini sizin bilgisayarınızdaki Chrome ile yapan küçük program). Hiçbiri ücretli değildir.

## 1. Panel (bir kez, Furkan)

Bu adımlar Claude ile birlikte yapılır; hesaplara girişleri siz yaparsınız.

1. **Supabase** (veritabanı ve giriş, ücretsiz): supabase.com → New project → bölge **Frankfurt (eu-central-1)**.
   - Project Settings → API: `Project URL`, `anon public` ve `service_role` anahtarları.
   - Project Settings → Database → Connection string: **Transaction pooler** (6543) ve **Session pooler / Direct** (5432) adresleri.
   - Storage → New bucket → adı `belgeler`, **Public kapalı**.
   - Authentication → URL Configuration → Site URL: panelin Vercel adresi.
2. **Tabloları oluştur**: `.env` dosyasını doldurup `pnpm db:push`.
3. **Vercel** (panel barındırma, ücretsiz): vercel.com → GitHub deposunu içe aktar → Root Directory `apps/web` → `.env.example`'daki değişkenleri ekle → Deploy.
4. Panelde kayıt olun, **LinkedIn hesapları** sayfasından hesabı ekleyin ve **bağlantı anahtarı** oluşturun.

## 2. Yerel çalışan (her LinkedIn hesabı sahibi kendi bilgisayarında)

Gerekenler: **Google Chrome** ve **Node.js LTS** (nodejs.org → LTS → kur, varsayılan ayarlarla).

### Windows
1. GitHub'da depo sayfası → **Code → Download ZIP** → bir klasöre çıkarın (ör. Belgeler).
2. `apps\runner\baslat.bat` dosyasına çift tıklayın.
3. İlk açılışta panel adresini ve bağlantı anahtarını sorar; yapıştırın.
4. Açılan Chrome penceresinde LinkedIn'e **kendiniz** giriş yapın. Şifreniz program tarafından okunmaz ve saklanmaz.

### Mac
1. GitHub'da **Code → Download ZIP** → İndirilenler'den bir klasöre taşıyın.
2. `apps/runner/baslat.command` dosyasına **sağ tıklayıp Aç** deyin (ilk seferde macOS "tanımlanamayan geliştirici" uyarısı verir; sağ tık → Aç ile geçilir).
   - Açılmazsa: Terminal'i açın, `cd ` yazıp klasörü Terminal'e sürükleyin, Enter; sonra `bash apps/runner/baslat.command`.
3. Panel adresi ve bağlantı anahtarını yapıştırın, açılan Chrome'da LinkedIn'e giriş yapın.

### Günlük kullanım
- Çalışan penceresi ve açtığı Chrome açık kaldığı sürece gönderimler zamanlamaya göre yapılır. Bu Chrome penceresini LinkedIn dışında kullanmayın.
- Bilgisayar kapalıyken hiçbir şey gönderilmez; açınca `baslat` dosyasını yeniden çalıştırın, kaldığı yerden devam eder.
- Kendi Chrome'unuzdan LinkedIn'i normal kullanmaya devam edebilirsiniz; elle gönderdiğiniz davetler haftalık bütçeden düşülür.
- Anahtarı değiştirmek için: `baslat` dosyasını `--sifirla` ile çalıştırın (Windows: komut isteminde `apps\runner\baslat.bat --sifirla`).
- Kurulumu denemek için: `--kontrol` ile çalıştırın; yalnızca kendi profilinizi okur, hiçbir şey göndermez.

### Bir şey ters giderse
- Panelin üstünde uyarı çıkar (çalışan kapalı, LinkedIn oturumu kapandı, LinkedIn uyarı gösterdi).
- LinkedIn bir doğrulama ya da uyarı gösterirse gönderim **24 saat kendiliğinden durur**. LinkedIn'i tarayıcıdan kontrol edin.
- Beklenmeyen ekranlar `Kullanıcı klasörü/.hfo-runner/kayitlar` altına ekran görüntüsü olarak kaydedilir; düzeltme için bu görüntüleri paylaşabilirsiniz.

## Önemli not

LinkedIn kullanıcı sözleşmesi otomasyon araçlarının kullanımını kısıtlar. Hesabı korumak için sistem; haftalık ~200 sınırının altında kalır, ilk iki hafta düşük hızla ısınır, insan hızında ve yalnızca belirlediğiniz saatlerde çalışır, LinkedIn uyarısında kendiliğinden durur. Yine de hesap kısıtlaması riski tamamen sıfır değildir.
