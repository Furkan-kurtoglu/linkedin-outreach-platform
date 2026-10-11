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
  proofs: "TÜBİTAK 1812 BiGG başvurusu final aşamasında\nTEKNOFEST 2026 Finansal Teknolojiler finalisti",
  link: "https://www.healthfintel.com.tr/",
  goal: "pilot",
  tone: "samimi",
  salutation: "ad_soyad",
  bannedPhrases: "öğrenmek isterim\n20 dakika\nBey\nHanım",
  share: "50",
};

export const PRESETS: Preset[] = [
  {
    id: "hastane",
    label: "Özel hastaneler ve klinikler",
    hint: "İstanbul · yönetici ve hasta hizmetleri unvanları · kamu hariç",
    values: {
      ...ORTAK,
      name: "İstanbul Özel Hastaneler ve Klinikler",
      productPhrase: "özel hastanelerde hasta kabul ve sigorta doğrulamayı hızlandıran",
      audience: "özel hastaneler ve klinikler",
      problem: "poliçe doğrulama, hasta kabul ve faturalamadaki manuel işlemler",
      benefits:
        "hasta randevudan önce poliçesine göre tahmini cepten ödeme tutarını görüyor\nQR kodla veznesiz kabul, kabul adımını yaklaşık 1 dakikaya indirmeyi hedefliyor\nSGK ve özel sigorta sorguları eşzamanlı yürüyor; manuel veri girişini ve fatura retlerini azaltmayı hedefliyor",
      excludedCompanies: "Acıbadem\nAcıbadem Sağlık Grubu\nAcibadem Healthcare Group",
      titles: "Hastane Müdürü\nGenel Müdür\nGeneral Manager\nCEO\nHasta Hizmetleri\nBaşhekim\nKlinik Müdürü\nAnlaşmalı Kurumlar\nİş Geliştirme\nBusiness Development",
      excludedTitles: "Stajyer\nAsistan",
      locations: "İstanbul",
      industries: "Hastaneler ve Sağlık Hizmetleri",
      requiredCompanyKeywords: "özel hastane\nözel klinik\nhospital\nklinik\ntıp merkezi",
      excludedCompanyKeywords: "devlet hastanesi\neğitim ve araştırma\nşehir hastanesi\nüniversite hastanesi",
      fitRule: "Yalnızca özel hastaneler ve özel klinikler; kamu ve eğitim-araştırma hastaneleri hariç. Acıbadem çalışanlarına yazılmaz.",
    },
  },
  {
    id: "sigorta",
    label: "Sağlık sigortacıları",
    hint: "İstanbul · üst yönetim ve sağlık sigortası unvanları · acente/broker hariç",
    values: {
      ...ORTAK,
      name: "İstanbul Sağlık Sigortacıları",
      productPhrase: "sağlık sigortalarında poliçe doğrulama ve talep süreçlerini hızlandıran",
      audience: "sağlık sigorta şirketleri",
      problem: "manuel poliçe doğrulama, belge kontrolü ve tekrar inceleme yükü",
      benefits:
        "poliçe doğrulama, talep yönetimi ve belge kontrolünü hızlandırmayı hedefliyor\nmanuel doğrulama ve tekrar inceleme yükünü azaltmayı hedefliyor\nrutin vakaları uygun kliniklere yönlendirerek hasar maliyetlerini iyileştirmeye yardımcı olmayı hedefliyor; nihai onay sigorta şirketinde kalıyor",
      excludedCompanies: "Acıbadem\nAcıbadem Sağlık Grubu",
      titles: "CEO\nGenel Müdür\nGeneral Manager\nCTO\nCOO\nDirektör\nDirector\nSağlık Sigortaları\nİş Geliştirme\nBusiness Development",
      excludedTitles: "Stajyer\nAsistan",
      locations: "İstanbul",
      industries: "Sigorta",
      requiredCompanyKeywords: "sigorta\nsağlık\ninsurance",
      excludedCompanyKeywords: "acente\nbroker\naracı\nbrokerlik",
      fitRule: "Yalnızca sağlık sigortası satan sigorta şirketinin kendisi; acente, broker ve aracılar hariç.",
    },
  },
];
