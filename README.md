# usage-band

Claude Code için prompt'un üstünde tek satırlık bir kullanım bandı:

```
⏺ Opus 5.5 high   ctx ◑ 42%   5h ◔ 23% ↻1h12m   7d ◑ 61% ↻3d
```

- **Model ve effort:** ana döngünün gönderdiği son istekten
- **ctx:** context doluluğu
- **5h / 7d:** 5 saatlik ve haftalık kullanım limiti, sıfırlanmaya kalan süre (d = gün, h = saat, m = dakika). Pencere boştayken sıfırlandıysa `sıfırlandı` yazar.
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

5h veya 7d kullanımı %80'i geçince bir toast, %95'i geçince toast ve sistem bildirimi gelir. Her eşik, her limit penceresi için bir kez uyarır; bu bilgi oturumlar arası hatırlanır, pencere sıfırlanınca uyarılar yeniden devreye girer. Sistem bildirimi `/config` içinden kapatılabilir.

`/usage-band` bandı gizler / gösterir; tercih oturumlar arası hatırlanır.

## Geliştirme

```
claude plugin validate .
claude plugin test .
```
