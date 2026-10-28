# sienna-art-studio-admin

Admin panel for the Sienna Art Studio Shopify store. The shop team uploads ONE Excel; the panel creates/updates categories (collections), products and the site menu in Shopify. Next.js (app router, JS), Cloudflare Workers, single admin login.

The user writes in Turkish and wants short, plain answers. Cost must stay 0 TL (no card-required services). Only push/deploy when asked. The user is a first-timer: give ONE small step at a time, say exactly where to click. Run `npm test` AND `npx next build` before pushing (a push to main = production deploy).

## Where things are

- Monorepo, git root `sienna-art-studio/` (remote `atabayraktar/sienna-art-studio`, branch main): `sienna-art-studio-shop` = Shopify theme, `sienna-art-studio-admin` = this panel.
- Live: https://admin.siennaartstudio.shop (Cloudflare Workers via the OpenNext adapter, git-connected build, root dir `sienna-art-studio-admin`; `wrangler.jsonc` has the custom-domain route and the 3 plain env vars). The 3 secrets (`SHOPIFY_CLIENT_SECRET`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`) live only in Cloudflare: Worker > Settings > Runtime variables and secrets. Store `sienna-art-studio-eiknbuj0`, live theme id `193799127403`, site https://siennaartstudio.shop. Shopify Dev Dashboard app `Sienna Admin` is installed (client credentials).
- Code: `lib/parse-workbook.js` Excel -> validated plan (browser). `lib/payload.js` plan -> Shopify inputs (+ `buildMenu`). `lib/import-logic.js` the Shopify calls. `lib/shopify.js` token + GraphQL (API 2026-07). `lib/auth.js` login. `app/importer.js` the UI. Tests: `npm test` (28 checks).
- Excel: `samples/sienna-products-import.xlsx` (README tab explains it, incl. add/change/hide/remove). Tabs `Categories` and `Products`. Same Product Code = variants of one product. `-` = leave as is. `samples/sienna-test-import.xlsx` = same + one test product `SAS-TEST-01` (not for real use).

## How it works / decisions

- Products are found by SKU. A store product with an EMPTY SKU is not found and the import makes a copy: give hand-made products their SKU first. `productSet` DELETES store variants missing from the Excel: dry run first.
- The panel NEVER deletes products (by design). Hide = Status `draft`; real delete = Shopify admin. Removing a Categories row only removes it from the site menu.
- Collection titles are renamed to the Excel name on import; handles stay (table in `lib/payload.js`). Smart (rule based) collections get a warning and no manual products (normal).
- Every import writes the category tree to the shop metafield `sienna.menu` (JSON, Excel order). The theme's `snippets/sienna-nav.liquid` reads it (desktop, mobile, sidebar, title) and uses each top category's wide `headerImage`; it falls back to the old hardcoded list only if the metafield is empty. Theme file pushed with `shopify theme push --only snippets/sienna-nav.liquid --live --allow-live`.
- Collection metafields `sienna.tagline|header_image|parent` and product metafields `sienna.is_custom|customer_fields|dimensions` are written, but nothing in the theme reads them (only the menu JSON is used).
- UI: card "4. Send to the site" has an "I know coding" switch (default off = plain-language results + callout; on = developer log), "Preview only (Dry run)" wording, "Start a new import" button.

## State (2026-10-29)

Done and verified live: deploy, login, Shopify connection, create + update of products, menu from Excel, wide menu images, Excel README, UI polish. All 38 products match the Excel (variants, images, status).

## Not done / open

- **Custom portrait product (`SAS-CUSTOM-01`) fields:** the customer fields on its page (photo upload, names, special requests) come from the third-party Shopify app **Easify Product Options**, configured inside that app (theme has no `properties[]` inputs). The Excel columns `Custom Product` / `Customer Fields` only write product metafields that nothing reads, so a NEW custom product added through the Excel gets no form. Options: (a) keep Easify and attach each new custom product to its option set in the app by hand, (b) build the form in the theme from `customer_fields` (needs file upload handling), (c) drop the two Excel columns. Not decided.
- Shop owner still has to fill product descriptions (`-` in the Excel) and real stock (every Stock Qty is 1, placeholder).
- Decided NOT to do (don't ask again): making the GitHub repo private, moving the menu images (`t/12/assets` links in the Excel) to Shopify Files.
- Optional ideas: Turkish UI text, a delete status with confirmation, trying the panel once from a phone/iPad (never tested on a device).
