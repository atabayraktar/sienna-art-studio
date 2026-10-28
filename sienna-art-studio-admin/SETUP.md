# Sienna Admin: kurulum

Excel'i yükleyip kategorileri ve ürünleri Shopify'a toplu aktaran panel. Next.js, ücretsiz barındırma, kullanıcı adı + şifre girişi.

Kod hazır ve test edildi (`npm test`: 26 kontrol). Senin yapacağın tek şey Shopify tarafında bir uygulama oluşturup 2 anahtar almak.

## 1. Shopify uygulaması (bir kez, ~5 dakika)

1. https://dev.shopify.com/dashboard adresine mağazanın sahibi hesapla gir.
2. **Create app** > **Start from Dev Dashboard**. Ad: `Sienna Admin`.
3. Yeni sürümde (version) **Access scopes** alanına şunu yapıştır:

   ```
   read_products,write_products,read_files,write_files,read_inventory,write_inventory,read_locations,read_publications,write_publications
   ```

   App URL kısmına `https://shopify.dev/apps/default-app-home` yaz, "Embed app in Shopify admin" kapalı olsun. **Release** et.
4. Uygulamanın **Home** sayfasından **Install app** > mağazanı seç (`sienna-art-studio-eiknbuj0`) > onayla.
5. **Settings** sayfasından **Client ID** ve **Client secret** değerlerini kopyala.

Not: Bu yöntem sadece uygulama ile mağaza **aynı organizasyondaysa** çalışır. Mağaza başka bir hesapta ise Install adımında mağaza listede görünmez, o zaman söyle.

## 2. Bilgisayarında dene

```
cd sienna-art-studio-admin
copy .env.example .env.local
```

`.env.local` dosyasını doldur:

- `SHOPIFY_CLIENT_ID` ve `SHOPIFY_CLIENT_SECRET`: 1. adımdan.
- `ADMIN_PASSWORD_HASH`: `npm run hash -- "senin şifren"` çıktısı (en az 10 karakter).
- `SESSION_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` çıktısı.

Sonra `npm run dev` ve http://localhost:3000 adresini aç. Giriş yap.

**İlk deneme sırası (önemli):**

1. Excel'i yükle (`samples/sienna-products-import.xlsx`). Hata yoksa yeşil görürsün.
2. **Dry run** işaretliyken çalıştır. Hiçbir şey yazılmaz, sadece "oluşturulacak / güncellenecek" listesi çıkar.
3. Dry run'ı kapat, "Only these product codes" kutusuna `SAS-TOY-01` yaz, **Import**. Shopify admin'de o ürüne bak.
4. Sorun yoksa kutuyu boşalt, hepsini aktar.

## 3. Ücretsiz yayına al

Panel kod olarak hangi ücretsiz barındırmada çalışır:

- **Vercel (Hobby)**: en kolay. Not: Hobby planın şartları "ticari olmayan kullanım". Mağaza işi için bu gri alan. Pratikte sorun çıkması düşük, ama kuralı bilmen lazım.
- **Netlify veya Cloudflare**: ücretsiz planları ticari kullanıma izin veriyor, Next.js destekliyorlar.

Hangisi olursa: projeyi **özel (private)** bir GitHub deposuna at, barındırmada import et, `.env.example` içindeki 5 değişkeni barındırmanın ortam değişkenleri ekranına gir. `.env.local` dosyasını asla GitHub'a gönderme (`.gitignore` zaten engelliyor).

## Bilmen gerekenler

- **Güncelleme mantığı:** Ürünler SKU ile bulunur. SKU zaten mağazada varsa ürün güncellenir, yoksa yeni oluşur ve Online Store'da yayınlanır.
- **Varyasyon silme:** Mağazadaki bir ürünün Excel'de olmayan varyasyonu **silinir** (Shopify `productSet` böyle çalışıyor). Önce Dry run.
- **`-` işareti:** Açıklama, etiket vb. için "dokunma" demek. Excel'de `-` olan alanı panel mağazada silmez.
- **Stok:** Excel'deki sayı mağazadaki stoğun yerine yazılır (Stock Qty boşsa dokunulmaz).
- **Kategori adları:** Mağazadaki mevcut koleksiyonlar handle ile eşleşir (`lib/payload.js` içindeki tablo), başlıkları Excel'deki ada çevrilir. Yeni bir kategori eklersen otomatik oluşturulur.
- **Otomatik (kurallı) koleksiyonlar:** Panel bunlara ürün ekleyemez. Varsa uyarı verir.
- **Tema:** Panel kategori açıklamasını, yatay header görselini ve üst kategoriyi koleksiyon metafield'larına (`sienna.tagline`, `sienna.header_image`, `sienna.parent`) yazar, özel ürünün müşteri alanlarını ürün metafield'larına (`sienna.is_custom`, `sienna.customer_fields`) yazar. Temanın bunları okuması ayrı bir iştir: şu an menü `sienna-nav.liquid` içinde sabit.
