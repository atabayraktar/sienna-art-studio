# sienna-art-studio-admin

Admin panel for the Sienna Art Studio Shopify store. The shop team uploads ONE Excel; the panel creates/updates categories (collections) and products in Shopify. Next.js (app router, JS), free hosting, single admin login.

The user writes in Turkish and wants short, plain answers. Cost must stay 0 TL (no card-required services). Only push/deploy when asked.

## Where things are

- Setup + first run: `SETUP.md` (Turkish). Tests: `npm test` (26 checks, includes known-bad Excel inputs that must be rejected).
- `lib/parse-workbook.js`: Excel -> validated plan (runs in the browser). `lib/payload.js`: plan -> Shopify `productSet` / collection inputs (pure). `lib/import-logic.js`: the Shopify calls. `lib/shopify.js`: client-credentials token + GraphQL (API 2026-07). `lib/auth.js`: login (scrypt hash + signed cookie). `app/importer.js`: the UI.
- The Excel format is in `samples/sienna-products-import.xlsx` (README tab explains it). Two tabs of data: `Categories` and `Products`. Rows with the same Product Code are variants of one product. `-` means "leave as is".
- Related repo (the Shopify theme): `../sienna-art-studio`. Store: `sienna-art-studio-eiknbuj0`, live theme id `193799127403`, site https://siennaartstudio.shop.

## State (2026-10-28)

- Code is done and committed locally. **It has never been run against the real store.** Verified so far: unit tests with a fake Shopify, all GraphQL validated against the 2026-07 schema, login/CSRF smoke test.
- Not done yet by the user: create the Shopify Dev Dashboard app (scopes in SETUP.md), put the Client ID/secret in `.env.local`, run a Dry run, then import ONE product (`SAS-TOY-01`) live before importing all 38.
- Not pushed to GitHub (no remote yet). Hosting not chosen: Vercel Hobby is "non-commercial" by its terms; Netlify/Cloudflare free allow commercial use.

## Decisions and gotchas

- `productSet` DELETES store variants that are missing from the Excel. Always dry run first.
- Existing store collections are matched by handle through the table in `lib/payload.js` (Excel names differ from store titles, e.g. "Home & Lighting" = `all-lamps`). Titles get renamed to the Excel name on import.
- Smart (rule based) collections cannot take products by the panel; it warns.
- Products are found by SKU. Image URLs of existing products are reused by media id to avoid duplicate uploads (never seen live yet: check this on the first real import).
- Panel writes category tagline / wide header image / parent into collection metafields `sienna.tagline|header_image|parent`, and custom-product fields into product metafields `sienna.is_custom|customer_fields` (+ `sienna.dimensions`). **The theme does not read them yet**: the header menu is hardcoded in the theme's `snippets/sienna-nav.liquid`. Wiring the theme to these metafields is a separate task.
- The custom portrait product (`SAS-CUSTOM-01`) has no customer form on the site yet (photo upload, names, special requests).
- Excel stock is 1 on every row (placeholder), descriptions are mostly `-` on purpose (the shop owner fills them).

## Next steps

1. User does SETUP.md steps 1-2, runs the dry run and the one-product import; fix whatever the first real run shows.
2. Pick free hosting, create a PRIVATE GitHub repo, deploy, set the 5 env vars there.
3. Theme work in `../sienna-art-studio`: read the metafields for the menu, add the custom-product form.
