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

## Update (2026-10-28, later)

- Repo is now a monorepo: `sienna-art-studio/` has `sienna-art-studio-shop` (theme) and `sienna-art-studio-admin` (this panel). Git root is `sienna-art-studio/` (remote `atabayraktar/sienna-art-studio`, branch main). Commit `9cf5491` is local, NOT pushed yet. User will make the GitHub repo private LAST (after deploy works).
- Shopify Dev Dashboard app `Sienna Admin` is created, released (`sienna-admin-1`) and installed on the store. `.env.local` is filled (user `sabo`, generated password, client id/secret, session secret). Nothing has been run yet.
- Deploy plan: Cloudflare (the user already has the site on Cloudflare and is logged in), test directly on the deployed site, no local test. Env vars must be entered in Cloudflare by hand (same 6 names as `.env.example`).
- The user is a first-timer here: give ONE small step at a time, say exactly where to click.
- Old copy `personal-projects/sienna-art-studio-admin` can be deleted.

## Update (2026-10-28, night)

- DEPLOYED: Cloudflare Workers (OpenNext adapter, `wrangler.jsonc`, git-connected build from this repo, root dir `sienna-art-studio-admin`) at https://admin.siennaartstudio.shop (custom domain set via `routes` in wrangler.jsonc; zone is on the user's Cloudflare account). Login works, Shopify shows "Connected". The 3 secrets live only in Cloudflare (Settings > Runtime variables and secrets); the 3 plain vars are also in wrangler.jsonc so deploys do not drop them. A push to main = production deploy.
- NEW: every import writes the whole category tree to the SHOP metafield `sienna.menu` (JSON, Excel order: top categories with `children`). `lib/payload.js buildMenu`, `lib/import-logic.js writeMenu`, route `/api/import/menu`. Not yet run live: if it fails with an access error, the app may need an extra scope (check the error text).
- Theme (`../sienna-art-studio-shop/snippets/sienna-nav.liquid`) now reads that metafield for desktop, mobile, sidebar and title; falls back to the old hardcoded list while the metafield is empty. Theme change is committed but NOT pushed to Shopify yet (push after the first import wrote the metafield).
- Test file: `samples/sienna-test-import.xlsx` = real Excel + one draft product `SAS-TEST-01` (not in the real Excel on purpose). Plan: create -> change price and re-import (update) -> delete by hand in Shopify admin (the panel never deletes).
- Menu text now comes from Excel: sub-category taglines are `-` in the Excel so they show blank; theme extras not in Excel (Photo to Cartoon Portraits, Personalized Gifts sub) disappear from the menu.

## Update (2026-10-29)

- Live tests done and passed: create, update, and manual delete (panel never deletes; hide = Status draft). 37 existing products matched by SKU; the portrait product had an empty SKU on the store, so the first import made a copy (`-1`); user deleted the copy and the original now has SKU `SAS-CUSTOM-01`. Test product is gone.
- Theme nav (`snippets/sienna-nav.liquid`) is LIVE on theme 193799127403 and reads `sienna.menu`; verified on siennaartstudio.shop (extra subcategories gone). Pushed with `shopify theme push --only snippets/sienna-nav.liquid --live --allow-live`.
- Excel README tab has a new section "Adding, changing, hiding and removing products". Next: small UI tweaks in the admin panel; GitHub repo made private LAST.
- UI (2026-10-29): importer card "4. Send to the site" has an "I know coding" switch (default off = plain results + callout, on = old terminal log), "Preview only (Dry run)" wording, "Start a new import" button. Decided NOT to do: private repo, moving menu images (`t/12/assets` links in the Excel) to Shopify Files. Optional later: Turkish UI text, delete status.
