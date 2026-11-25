# Sienna Art Studio

Online store for Sienna Art Studio: handmade art, custom pieces and personalized gifts, sold on Shopify.

The repository has two parts:

| Folder | What it is |
| --- | --- |
| [`sienna-art-studio-shop/`](sienna-art-studio-shop) | The Shopify theme (storefront) |
| [`sienna-art-studio-admin/`](sienna-art-studio-admin) | A small admin panel that imports the catalog from an Excel file into Shopify |

## Shopify theme (`sienna-art-studio-shop`)

A custom redesign built on Shopify's Dawn theme (Online Store 2.0, Liquid).

- Custom `sienna-*` sections: hero, category grid and category hub, product lists, gallery, marquee, reviews, promises, feature and contact blocks.
- Own styling and scripts in `assets/sienna.css` and `assets/sienna.js`, on top of Dawn's base.
- Everything is editable from the Shopify theme editor; hero texts and pictures can also be filled from the Excel import.

Local development uses the Shopify CLI:

```
cd sienna-art-studio-shop
shopify theme dev     # live preview at 127.0.0.1:9292
shopify theme push --unpublished   # upload as a new, unpublished theme
```

## Admin panel (`sienna-art-studio-admin`)

A password-protected Next.js app that turns one Excel workbook into the store's catalog, so products don't have to be entered one by one in the Shopify admin.

- Upload the workbook, check it for errors, then import in one go.
- Creates or updates collections (categories), products with images, prices, dimensions and inventory, the navigation menu, featured / best-seller lists and the homepage hero.
- Talks to Shopify through the Admin GraphQL API; runs again safely without creating duplicates.
- Deployed to Cloudflare Workers via OpenNext.

Stack: Next.js 16, React 19, ExcelJS, jose (session cookies), Cloudflare Workers.

```
cd sienna-art-studio-admin
npm install
npm run dev      # http://localhost:3000
npm test         # import checks
npm run deploy   # build and deploy to Cloudflare
```

Setup (Shopify app keys, environment variables, first import): [`sienna-art-studio-admin/SETUP.md`](sienna-art-studio-admin/SETUP.md).
The Excel format is described in the README tab of [`samples/sienna-products-import.xlsx`](sienna-art-studio-admin/samples/sienna-products-import.xlsx).
