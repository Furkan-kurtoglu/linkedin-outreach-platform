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
      excludedCompanies: "Acıbadem -Bupa\nAcıbadem Sağlık Grubu\nAcibadem Healthcare Group\nAvicenna\nMedicana",
      titles: "Hastane Müdürü\nHospital Director\nHospital Manager\nGenel Müdür\nGeneral Manager\nGenel Müdür Yardımcısı\nDeputy General Manager\nCEO\nManaging Director\nBaşhekim\nChief Medical Officer\nMedical Director\nTıbbi Hizmetler Müdürü\nHasta Hizmetleri\nPatient Services\nPatient Experience\nHasta Kabul\nPatient Admissions\nProvizyon\nAnlaşmalı Kurumlar\nSigorta İlişkileri\nInsurance Relations\nProvider Relations\nContracting\nMali İşler\nFinans Direktörü\nChief Financial Officer\nGelir Yönetimi\nRevenue Cycle\nFaturalama\nBilgi İşlem\nChief Information Officer\nHead of Digital\nDijital Dönüşüm\nDigital Transformation\nİş Geliştirme\nBusiness Development\nStrateji\nOperasyon Direktörü\nChief Operating Officer",
      targetAccounts: "Memorial Sağlık Grubu\nMemorial Şişli Hastanesi\nMemorial Bahçelievler Hastanesi\nMemorial Ataşehir Hastanesi\nMedipol Mega Hastanesi\nMedicana Health Group\nLiv Hospital\nAmerikan Hastanesi\nFlorence Nightingale Hastaneleri\nMedical Park Hastaneleri\nVM Medical Park\nHisar Intercontinental Hospital\nKolan International Hospital\nKolan British Hospital\nMedistate Kavacık Hastanesi\nTema Hastanesi\nEmsey Hospital\nTaksim Alman Hastanesi\nSurp Agop Hastanesi\nBatı Bahat Hastanesi\nDünya Göz Hastaneleri\nEthica Hospital",
      mode: "FIND_ONLY",
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
      excludedCompanies: "Acıbadem -Bupa\nAcıbadem Sağlık Grubu",
      titles: "Genel Müdür\nGeneral Manager\nGenel Müdür Yardımcısı\nDeputy General Manager\nCEO\nChief Executive Officer\nCOO\nChief Operating Officer\nCTO\nChief Technology Officer\nCIO\nChief Medical Officer\nTıbbi Danışman\nMedical Advisor\nDirektör\nDirector\nHead of Health\nSağlık Sigortaları\nHealth Insurance\nSağlık Operasyon\nHealth Operations\nHasar ve Tazminat\nClaims\nProvizyon\nSağlık Ağı\nProvider Network\nProvider Management\nAnlaşmalı Kurumlar\nUnderwriting\nÜrün Geliştirme\nProduct Development\nProduct Manager\nDijital Dönüşüm\nDigital Transformation\nİnovasyon\nInnovation\nİş Geliştirme\nBusiness Development\nStrateji\nPartnerships",
      targetAccounts: "Allianz Sigorta\nBupa Acıbadem Sigorta\nAnadolu Sigorta\nAxa Sigorta\nTürkiye Sigorta\nMapfre Sigorta\nAksigorta\nHDI Sigorta\nGenerali Sigorta\nSompo Sigorta\nNeova Sigorta\nAnkara Sigorta\nDoğa Sigorta\nRay Sigorta\nGulf Sigorta\nHalk Sigorta\nQNB Sigorta\nAnadolu Hayat Emeklilik\nAllianz Yaşam ve Emeklilik\nAxa Hayat ve Emeklilik",
      mode: "FIND_ONLY",
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
      excludedCompanies: "Acıbadem -Bupa\nAcıbadem Sağlık Grubu",
      titles: "Kurucu\nKurucu Ortak\nFounder\nCo-Founder\nOwner\nOrtak\nPartner\nKlinik Müdürü\nClinic Manager\nClinic Director\nKlinik Sahibi\nGenel Müdür\nGeneral Manager\nManaging Director\nCEO\nOperasyon Müdürü\nOperations Manager\nHasta İlişkileri\nPatient Relations\nPatient Coordinator\nMedikal Direktör\nMedical Director\nBaşhekim\nPractice Manager\nİş Geliştirme\nBusiness Development\nPazarlama Müdürü\nMarketing Manager",
      targetAccounts: "Estethica\nEstetik International\nDüzey Göz Merkezi\nSuperplast Estetik Cerrahi Merkezi\nMetropolDoctors",
      mode: "FIND_ONLY",
      excludedTitles: "Stajyer\nAsistan\nHemşire\nSekreter\nResepsiyon",
      locations: "İstanbul",
      industries: "Hastaneler ve Sağlık Hizmetleri\nTıbbi Uygulamalar",
      requiredCompanyKeywords: "klinik\ntıp merkezi\nmedical\nclinic\npolikliniği\nestetik\ndiş\ngöz\ntüp bebek\nfizik tedavi",
      excludedCompanyKeywords: "devlet\neğitim ve araştırma\nşehir hastanesi\nüniversite\nhastanesi\nmalzeme\ndepo\nsigorta\nilaç",
      fitRule: "Yalnızca bağımsız butik klinikler ve tıp merkezleri (estetik, diş, göz, tüp bebek, fizik tedavi, check-up); hastaneler, kamu kurumları, medikal malzeme ve ilaç tedarikçileri ile sigorta firmaları hariç.",
    },
  },
];
