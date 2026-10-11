# Bulut çalışan: bilgisayar kapalıyken arama

> **Durum (11.10.2026):** İlk denemede LinkedIn, GitHub sunucusundan gelen oturum çerezini kabul etmedi ("LinkedIn oturumu kapandı"). Zamanlı çalışma bu yüzden kapatıldı; yalnızca elle başlatılabilir. Güvenilir yol bilgisayardaki çalışandır (`baslat.bat`).

Bulut çalışan, GitHub'ın ücretsiz sunucusunda ekransız bir Chrome açıp LinkedIn'de **yalnızca arama** işlerini yapar:
şirket bulma, şirket ayrıntılarını okuma, hedef şirketlerdeki kişileri bulma. Davet ve mesaj gönderimi
bulutta **yapılmaz**; onlar bilgisayarınızdaki çalışanda kalır.

Her gün 03:00, 06:00 ve 09:00'da (Türkiye saati) en çok 20 dakika çalışır. İş yoksa erken kapanır.
Özel depoda GitHub ayda 2000 ücretsiz dakika verir; bu program yaklaşık 1800 dakikaya sığar.
İstediğiniz an Actions sekmesinden "Bulut çalışan" → "Run workflow" ile elle de başlatabilirsiniz.

## Tek seferlik kurulum (3 gizli değişken)

GitHub'da depoya girin: **Settings → Secrets and variables → Actions → New repository secret**. İki tane ekleyin (HFO_TOKEN, LI_AT):

| Ad | Değer |
| --- | --- |
| `HFO_PANEL` | (isteğe bağlı) Boş bırakılırsa `https://healthfintel-outreach.vercel.app` kullanılır. |
| `HFO_TOKEN` | Panelde **LinkedIn hesapları → Yerel çalışan → Anahtarı yenile** ile çıkan `hfo_…` anahtarı. Yenileyince bilgisayardaki çalışanın anahtarı da değişir; onu da `baslat.bat --sifirla` ile yeniden girmeniz gerekir. |
| `LI_AT` | LinkedIn oturum çerezi (aşağıya bakın) |

### LI_AT çerezini bulma

1. Chrome'da LinkedIn'e giriş yapmışken `F12` → **Application** (Uygulama) → **Cookies** → `https://www.linkedin.com`.
2. `li_at` satırının **Value** hücresini kopyalayın ve GitHub'a yapıştırın.

Bu çerez LinkedIn şifrenizin yerine geçer: kimseyle paylaşmayın, sohbete yapıştırmayın. LinkedIn'den çıkış yaparsanız
ya da şifre değiştirirseniz çerez geçersiz olur; bulut çalışan kendini durdurur ve yenisini istersiniz.

## Riskler (bilerek seçin)

- Aramalar LinkedIn'e normalde kullandığınız ev/ofis bağlantısı yerine bir veri merkezi adresinden gelir. LinkedIn bunu
  olağandışı görüp doğrulama isteyebilir ya da hesabı kısıtlayabilir. Bu yüzden bulutta yalnızca okuma/arama yapılır ve
  süre sınırlıdır; yine de risk sıfır değildir.
- Doğrulama uyarısı görürseniz bulut çalışanı kapatın (aşağıda) ve çerezi yenileyin.

Kapatmak için: `.github/workflows/bulut-calisan.yml` dosyasını silin ya da GitHub'da Actions → Bulut çalışan → "Disable workflow".
