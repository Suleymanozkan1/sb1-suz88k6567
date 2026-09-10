/**
 * Salon kiralama sözleşmesinin şartları.
 *
 * Metin işletmenin kendi basılı sözleşmesinden alınmıştır. Yalnızca
 * mekanik düzeltmeler yapıldı: PDF'ten kopyalanırken metne karışan
 * "&nbsp;" işaretleri temizlendi ve açık yazım yanlışları düzeltildi
 * ("sanaçtı" → "sanatçı", "muafakat" → "muvafakat", "feraget" → "feragat").
 * Hükümlerin kapsamına dokunulmadı.
 *
 * Yetkili mahkeme maddesi işletmenin şehrinden gelir; metne sabit bir il
 * yazmak, başka ilde çalışan bir işletmede yanlış olurdu.
 *
 * Bu metin hukuki inceleme yerine geçmez; yürürlüğe almadan önce
 * avukatınıza okutunuz.
 */
export function sozlesmeSartlari(city: string): string[] {
  const il = city.trim() || 'yetkili';
  return [
    'İş bu sözleşme bedelinin en az 1/3’ü CAYMA TAZMİNATI olarak nakit alınır.',
    'Kalan bakiye tören günü merasim başlamadan nakden veya defaten alınmaktadır.',
    'Alınan CAYMA akçesi Borçlar Kanunu’nun 156/2 maddesine göre tören sahibinin sözleşmeyi iptal etmesi durumunda iade edilmez.',
    'Organizasyon sahibi herhangi bir sebeple törenini iptal veya ileri bir tarihe ertelemek isterse 60 gün önceden yazılı olarak bildirmezse sözleşme tutarının tamamını ödemeyi kabul eder ve iade alma hakkından iş bu sözleşme tarihinde feragat eder.',
    'Organizasyon sırasında fotoğraf ve video çekimi hakkı salon müdüriyetinde ve yetkisindedir. Dışarıdan fotoğraf ve video kamerası getirilip çekim yapılamaz.',
    'Organizasyon anında salon müdüriyetinin idaresine müdahale edilemez. Organizasyon sahibi özel program ve sanatçı getirmek istediğinde salon müdüriyetine 1 gün önceden muvafakat alarak haber vermek zorundadır. Sanatçı ve gruplar kendi ses tesisatlarını getireceklerdir.',
    'Menülerde %10 opsiyon ücretli olarak kullandırılır.',
    'Sözleşmede belirtilen davetli sayısından az kişi gelmesi durumunda sözleşmede yazan davetli sayısı üzerinden ücret alınır. Set menülerde servis akışına riayet edilir, menü servisinin dışına çıkılmaz.',
    'Davet saatinden önce salon alanına misafir alınmaz ve müdüriyete teslim edilmeyen özel eşyaların kayıp ve çalıntısından işletmemiz sorumlu değildir.',
    'Salonu gezip görerek tutan organizasyon sahibi veya temsilcisi organizasyon sırasındaki zarar ve ziyan ile davetlilerin yaralanma vb. olaylar sonucundaki maddi ve manevi tazminatlardan da mesuldür. Organizasyon sahibi kendisi ve davetlilerin sigortasını yatırmakla yükümlüdür. 6. madde uyarınca getirilen ekipmanlara ilişkin hukuki sorumluluk organizasyon sahibine aittir. Organizasyon sahibi, işletme sahibinin uğrayacağı her türlü zarar ve ziyan ile organizasyon nedeniyle açılacak her türlü davadan dolayı ödemek zorunda kaldığı meblağı karşılamak zorundadır. Organizatör bu nedenlerle ödemek zorunda kalacağı her türlü bedeli tören sahibine rücu edecek olup organizasyon sahibi rücu bedelini ödemeyi şimdiden kabul, beyan ve taahhüt eder.',
    'Sözleşmede belirtilen kişi sayısından fazla kişi gelir ise gelen kişiye servis açılır ve ikram yapılır. Organizasyon sonunda organizasyon sahibinden doğacak fark tahsil edilir.',
    'Bakiyeden sorumlu organizasyon sahibi doğabilecek bir ihtilaftan dolayı her ay için TL bazında %15 gecikme faizi ödemeyi taahhüt eder.',
    'Taraflar iş bu sözleşmede yazılı adreslerin geçerli tebligat adresi olduğunu, bu adreslerde meydana gelen değişikliği karşı tarafa yazılı olarak bildirmediği takdirde bu adreslere yönlendirilecek tebligatların diğer tarafça tebliğ edilsin ya da edilmesin geçerli olacağı hususunda mutabıktırlar.',
    'İş bu sözleşme tarafların imzasıyla yürürlüğe girer.',
    `İş bu anlaşmadan doğacak ihtilaflarda ${il} Mahkemeleri ve İcra Daireleri yetkilidir. İş bu sözleşme iki nüsha olup iki tarafın rızası ile yukarıdaki bilgi ve sözleşme şartları okunarak imza altına alınmıştır.`,
    'Kredi kartı ödemelerinde +%20 KDV uygulanır.',
  ];
}
