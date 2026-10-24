# Kurulum

İki parça var: **panel** (internette, herkes kendi hesabıyla girer) ve **yerel çalışan** (LinkedIn işlemlerini sizin bilgisayarınızdaki Chrome ile yapan küçük program). Hiçbiri ücretli değildir.

## 1. Panel (bir kez, Furkan)

Hesaplara girişleri ve gizli anahtar gerektiren adımları siz yaparsınız; gizli anahtarlar hiçbir yere elle kopyalanmaz.

1. **Vercel** (vercel.com, ücretsiz Hobby): GitHub ile giriş → **Add New → Project** → `linkedin-outreach-platform` deposunu içe aktar.
   - **Root Directory:** `apps/web` · Framework: Next.js (otomatik).
   - **Environment Variables:** yalnızca `ALLOWED_EMAILS` = panele girecek e-postalar (virgülle). İsteğe bağlı `GEMINI_API_KEY`.
   - Henüz **Deploy etmeyin** (ya da ilk yayın veritabanı olmadığı için hata verirse sorun değil).
2. **Supabase** (veritabanı, giriş ve belge deposu, ücretsiz): Vercel projesinde **Storage → Create Database → Supabase** → bölge **Frankfurt** → oluştur → projeye bağla.
   - Veritabanı ve Supabase anahtarları Vercel'e **otomatik** eklenir.
3. **Deployments → Redeploy.** Yayın sırasında tablolar, güvenlik kuralları (RLS) ve özel `belgeler` deposu otomatik kurulur.
4. Supabase panelinde **Authentication → URL Configuration → Site URL** = Vercel adresi (ör. `https://linkedin-outreach-platform.vercel.app`).
   - İsteğe bağlı: **Authentication → Providers → Email → Confirm email** kapatılırsa kayıt sonrası e-posta doğrulaması beklenmez (ücretsiz katmanda doğrulama e-postası saatte birkaç adetle sınırlıdır).
5. Panelde kayıt olun → **LinkedIn hesapları** → hesabı ekleyin → **bağlantı anahtarı** oluşturun.

Şema değiştiğinde: GitHub → Actions → **Veritabanı göçü üret** → Run workflow. Bir sonraki yayında Vercel değişikliği uygular.

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
