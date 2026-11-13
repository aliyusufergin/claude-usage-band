# usage-band

Claude Code için prompt'un üstünde tek satırlık bir kullanım bandı:

```
⏺ Opus 5.5 high   ctx ⛁⛁⛁⛁⛶⛶⛶⛶⛶⛶ 42% ⇣60k   5h ◔ 23% ↻1s12d   7d ◑ 61% ↻3g   $1.24
```

- **Model ve effort:** ana döngünün gönderdiği son istekten
- **ctx:** `/context`'teki gibi disk hücreleri (⛁ dolu, ⛀ yarım, ⛶ boş) ve auto-compact'a kalan token (⇣)
- **5h / 7d:** 5 saatlik ve haftalık kullanım limiti tek bir pasta daireyle (○◔◑◕●), sıfırlanmaya kalan süre (g = gün, s = saat, d = dakika)
- **Maliyet:** oturumun API maliyeti
- Renkler: %70'e kadar yeşil, %70–90 sarı, %90 üstü kırmızı
- Dar terminalde önce hücreler ve daireler, sonra geri sayım düşer

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

5h veya 7d kullanımı uyarı eşiğini (%80) geçince bir toast, kritik eşiği (%95) geçince toast ve sistem bildirimi gelir. Her eşik, her limit penceresi için bir kez uyarır; bu bilgi oturumlar arası hatırlanır, pencere sıfırlanınca uyarılar yeniden devreye girer.

## Komutlar

- `/usage-band`: bandı gizle / göster
- `/usage-band kompakt`: hücreleri ve daireleri kapat / aç

Bu tercihler oturumlar arası hatırlanır.

## Ayarlar (`/config`)

| Ayar | Varsayılan | Açıklama |
| --- | --- | --- |
| Uyarı eşiği (%) | 80 | Toast |
| Kritik eşik (%) | 95 | Toast ve sistem bildirimi |
| Sistem bildirimi | açık | Kritik eşikte masaüstü bildirimi |
| Sarı / kırmızı renk eşiği (%) | 70 / 90 | Renk geçişleri |
| Çubuk genişliği | 10 | Context hücre sayısı; 0 verilirse hücre ve daire yok |
| Modeli / effort'u / compact mesafesini / geri sayımı / maliyeti göster | açık | Bölümleri tek tek aç/kapa |

## Geliştirme

```
claude plugin validate .
claude plugin test .
```
