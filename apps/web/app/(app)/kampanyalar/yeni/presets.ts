/** Hazır başlangıçlar: sihirbazın alanlarını doldurur; kampanya yine taslak olarak oluşur. */
export interface Preset {
  id: string;
  label: string;
  hint: string;
  values: Record<string, string>;
}

const ORTAK = {
  companyName: "HeAlthFintel",
  senderRole: "kurucusuyum",
  tractionLine: "Kurumlarla pilot anlaşmalarına başladık",
  proofs: "TÜBİTAK 1812 BiGG başvurusu final aşamasında\nTEKNOFEST 2026 Finansal Teknolojiler finalisti\nNVIDIA Inception programı üyesi",
  link: "https://www.healthfintel.com.tr/",
  goal: "pilot",
  tone: "samimi",
  salutation: "ad_soyad",
  bannedPhrases: "öğrenmek isterim\n20 dakika\nBey\nHanım\notonom\nyatırım aldık",
  proofKind: "sektor",
};

export const PRESETS: Preset[] = [
  {
    id: "hastane",
    label: "Özel hastaneler",
    hint: "İstanbul · yönetim, hasta hizmetleri, provizyon ve finans unvanları · kamu, üniversite ve butik klinikler hariç",
    values: {
      ...ORTAK,
      name: "İstanbul Özel Hastaneler",
      share: "40",
      goal: "pilot",
      tone: "samimi",
      productPhrase: "özel hastanelerde hasta kabul ve sigorta doğrulamayı hızlandıran",
      audience: "özel hastaneler",
      problem: "poliçe doğrulama, hasta kabul ve faturalamadaki manuel işlemler ile reddedilen dosyalar",
      benefits:
        "hasta randevudan önce poliçesine göre tahmini cepten ödeme tutarını görüyor\nQR kodla veznesiz kabul, kabul adımını yaklaşık 1 dakikaya indirmeyi hedefliyor\nSGK ve özel sigorta sorguları eşzamanlı yürüyor; manuel veri girişini ve fatura retlerini azaltmayı hedefliyor\nHBYS değişmeden, ara katman olarak mevcut sisteme bağlanıyor",
      figures: "reddedilen dosya başına yaklaşık 118 USD yeniden işleme ve itiraz maliyeti doğuyor",
      excludedCompanies: "Acıbadem\nAcıbadem Sağlık Grubu\nAcibadem Healthcare Group\nAvicenna\nMedicana",
      titles: "Hastane Müdürü\nGenel Müdür\nGeneral Manager\nGenel Müdür Yardımcısı\nCEO\nBaşhekim\nHasta Hizmetleri\nHasta Kabul\nProvizyon\nAnlaşmalı Kurumlar\nSigorta İlişkileri\nMali İşler\nFinans Direktörü\nBilgi İşlem\nİş Geliştirme\nBusiness Development",
      excludedTitles: "Stajyer\nAsistan\nHemşire\nSekreter",
      locations: "İstanbul",
      industries: "Hastaneler ve Sağlık Hizmetleri",
      requiredCompanyKeywords: "özel hastane\nhastanesi\nhospital\nsağlık grubu",
      excludedCompanyKeywords: "devlet hastanesi\neğitim ve araştırma\nşehir hastanesi\nüniversite\npoliklinik\ndiş\nestetik",
      fitRule: "Yalnızca özel hastaneler (yatak kapasiteli, hastane statüsünde); kamu, üniversite ve eğitim-araştırma hastaneleri ile küçük butik klinikler hariç. Acıbadem, Avicenna ve Medicana çalışanlarına yazılmaz.",
    },
  },
  {
    id: "sigorta",
    label: "Özel sağlık sigortası şirketleri",
    hint: "İstanbul · üst yönetim, sağlık sigortası, hasar ve provizyon unvanları · acente ve broker hariç",
    values: {
      ...ORTAK,
      name: "İstanbul Özel Sağlık Sigortası Şirketleri",
      share: "35",
      goal: "pilot",
      tone: "resmi",
      productPhrase: "sağlık sigortalarında poliçe doğrulama ve provizyon süreçlerini hızlandıran",
      audience: "özel sağlık sigortası şirketleri",
      problem: "manuel poliçe doğrulama, provizyon onayı ve tekrar inceleme yükü",
      benefits:
        "poliçe doğrulama ve provizyon onayını hastane kabulüyle eşzamanlı yürütmeyi hedefliyor\nmanuel onay ve tekrar inceleme yükünü azaltmayı hedefliyor\nrutin vakaları poliçe kapsamına uygun kurumlara yönlendirerek hasar maliyetlerini iyileştirmeye yardımcı olmayı hedefliyor\nkarar vermiyor, karar destekliyor: nihai onay sigorta şirketinde kalıyor",
      figures: "işlem başına yaklaşık 8,57 USD manuel onay maliyeti oluşuyor",
      excludedCompanies: "Acıbadem\nAcıbadem Sağlık Grubu",
      titles: "Genel Müdür\nGeneral Manager\nGenel Müdür Yardımcısı\nCEO\nCOO\nCTO\nDirektör\nDirector\nSağlık Sigortaları\nSağlık Operasyon\nHasar ve Tazminat\nProvizyon\nSağlık Ağı\nAnlaşmalı Kurumlar\nÜrün Geliştirme\nDijital Dönüşüm\nİş Geliştirme\nBusiness Development",
      excludedTitles: "Stajyer\nAsistan\nSatış Temsilcisi\nAcente",
      locations: "İstanbul",
      industries: "Sigorta",
      requiredCompanyKeywords: "sigorta\ninsurance\nemeklilik",
      excludedCompanyKeywords: "acente\nbroker\naracı\nbrokerlik\nekspertiz",
      fitRule: "Yalnızca sağlık sigortası (TSS) sunan sigorta şirketinin kendisi; acente, broker, aracı ve ekspertiz firmaları hariç.",
    },
  },
  {
    id: "klinik",
    label: "Butik klinikler",
    hint: "İstanbul · kurucu, klinik müdürü ve operasyon unvanları · hastane, tedarikçi ve kamu hariç",
    values: {
      ...ORTAK,
      name: "İstanbul Butik Klinikler",
      share: "25",
      goal: "demo",
      tone: "samimi",
      productPhrase: "kliniklerde şeffaf fiyat ve sigorta doğrulamalı randevu sağlayan",
      audience: "butik klinikler",
      problem: "sigorta ve fiyat belirsizliği yüzünden kaçan hastalar ile telefonla yürüyen randevu ve kabul işleri",
      benefits:
        "hasta randevudan önce hizmet fiyatını ve poliçesine göre tahmini cepten ödemeyi görüyor\nklinik kendi hekim, hizmet ve fiyat bilgisini bir portaldan kendisi giriyor\ncheck-up paketleri ve tetkikler için talep üzerine randevu alınabiliyor\nQR kodla hızlı kabul; sigorta doğrulaması kabul anında yapılıyor",
      excludedCompanies: "Acıbadem\nAcıbadem Sağlık Grubu",
      titles: "Kurucu\nKurucu Ortak\nFounder\nCo-Founder\nOwner\nKlinik Müdürü\nKlinik Sahibi\nGenel Müdür\nOperasyon Müdürü\nHasta İlişkileri\nMedikal Direktör\nİş Geliştirme",
      excludedTitles: "Stajyer\nAsistan\nHemşire\nSekreter\nResepsiyon",
      locations: "İstanbul",
      industries: "Hastaneler ve Sağlık Hizmetleri\nTıbbi Uygulamalar",
      requiredCompanyKeywords: "klinik\ntıp merkezi\nmedical\nclinic\npolikliniği\nestetik\ndiş\ngöz\ntüp bebek\nfizik tedavi",
      excludedCompanyKeywords: "devlet\neğitim ve araştırma\nşehir hastanesi\nüniversite\nhastanesi\nmalzeme\ndepo\nsigorta\nilaç",
      fitRule: "Yalnızca bağımsız butik klinikler ve tıp merkezleri (estetik, diş, göz, tüp bebek, fizik tedavi, check-up); hastaneler, kamu kurumları, medikal malzeme ve ilaç tedarikçileri ile sigorta firmaları hariç.",
    },
  },
];
