# usage-band

Claude Code için prompt'un üstünde tek satırlık bir kullanım bandı:

```
⏺ Opus 5.5 high   ctx ◑ 42% +8k ⇣60k   5h ◔ 23% ↻1h12m   7d ◑ 61%▴ ↻3d
```

- **Model ve effort:** ana döngünün gönderdiği son istekten
- **ctx:** context doluluğu, son turun context'e eklediği token (+) ve auto-compact'a kalan token (⇣)
- **5h / 7d:** 5 saatlik ve haftalık kullanım limiti, sıfırlanmaya kalan süre (d = gün, h = saat, m = dakika). Pencere boştayken sıfırlandıysa `sıfırlandı` yazar.
- **Tempo (▴):** kullanım bu hızla sürerse limit sıfırlanmadan dolacaksa yüzdenin yanında sarı ▴ çıkar. Pencerenin ilk %10'unda gösterilmez.
- Renkler: %70'e kadar yeşil, %70–90 sarı, %90 üstü kırmızı
- Her yüzdenin önünde tek karakterlik bir pasta daire (○◔◑◕●)
- Dar terminalde önce daireler, sonra geri sayım düşer

5h/7d bilgisi yalnızca Claude aboneliğiyle gelir; API anahtarıyla bu bölümler görünmez.

## Kurulum

Claude Code'da prompt'a yazın:

```
/plugin install usage-band --marketplace aliyusufergin/claude-usage-band
```

Marketplace'i eklemek için `y`, ardından kapsam olarak **user**'ı seçin.

Güncellemek için:

```
claude plugin update usage-band
```

ardından açık oturumda `/reload-plugins`.

## Uyarılar

5h veya 7d kullanımı uyarı eşiğini (%80) geçince bir toast (tempo öndeyse "bu hızla 54m içinde dolar" eklenir), kritik eşiği (%95) geçince toast ve sistem bildirimi gelir. Her eşik, her limit penceresi için bir kez uyarır; bu bilgi oturumlar arası hatırlanır, pencere sıfırlanınca uyarılar yeniden devreye girer.

## Komutlar

- `/usage-band`: bandı gizle / göster
- `/usage-band kompakt`: daireleri kapat / aç

Bu tercihler oturumlar arası hatırlanır.

## Ayarlar (`/config`)

| Ayar | Varsayılan | Açıklama |
| --- | --- | --- |
| Uyarı eşiği (%) | 80 | Toast |
| Kritik eşik (%) | 95 | Toast ve sistem bildirimi |
| Sistem bildirimi | açık | Kritik eşikte masaüstü bildirimi |
| Sarı / kırmızı renk eşiği (%) | 70 / 90 | Renk geçişleri |
| Daireleri göster | açık | ctx, 5h ve 7d önündeki pasta daireler |
| Modeli / effort'u / tur artışını / compact mesafesini / geri sayımı / tempoyu göster | açık | Bölümleri tek tek aç/kapa |

Eşikler ters girilirse (ör. sarı > kırmızı) küçük olan alt eşik sayılır.

## Geliştirme

```
claude plugin validate .
claude plugin test .
```
