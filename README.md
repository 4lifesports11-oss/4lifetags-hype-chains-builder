# 4LifeTags Hype Chain Builder

This is the standalone Hype Chain builder project for Netlify + Shopify checkout.

## Live URL options

Best clean setup for a new Netlify project:
- `https://hype-chains.4lifetags.com`

If you want the exact path:
- `https://4lifetags.com/Hype-Chains/`

then your existing main 4LifeTags Netlify site needs a proxy/rewrite rule to this new Netlify project, or the Hype-Chains folder must live inside the main site project.

## Netlify environment variables

Set these in Netlify:

```txt
SHOPIFY_STORE_DOMAIN=4life-10913012.myshopify.com
SHOPIFY_STOREFRONT_ACCESS_TOKEN=your_storefront_access_token
SHOPIFY_API_VERSION=2026-04

SHOPIFY_HYPE_CHAIN_SMALL_VARIANT_ID=your_small_variant_id
SHOPIFY_HYPE_CHAIN_MEDIUM_VARIANT_ID=your_medium_variant_id
SHOPIFY_HYPE_CHAIN_LARGE_VARIANT_ID=your_large_variant_id

SHOPIFY_PATTERN_BUILDER_ADDON_VARIANT_ID=your_pattern_builder_addon_variant_id
```

The pattern builder add-on variable is optional, but if you charge +$5 for Pattern Builder in the builder, you should create a Shopify add-on product/variant for that $5 and put the variant ID here.

## Shopify setup

Create one Shopify product called `Hype Chain` with variants:
- Small (5in) - $30
- Medium (7in) - $40
- Large (10in) - $50

Create another Shopify product or variant:
- Pattern Builder Add-On - $5

Copy each Product Variant ID into Netlify.

## GitHub to Netlify

1. Create a new GitHub repo.
2. Upload all files in this folder.
3. In Netlify, create a new project from GitHub.
4. Build command: leave blank or use `npm run build`.
5. Publish directory: `.`
6. Functions directory is already set in `netlify.toml`.

## Main site button links

If using a subdomain:
```html
<a href="https://hype-chains.4lifetags.com">Customize Hype Chain</a>
```

If using exact path on the main domain:
```html
<a href="/Hype-Chains/">Customize Hype Chain</a>
```


## Exact URL setup: 4lifetags.com/Hype-Chains/

A separate Netlify project cannot own only a path by DNS. DNS can point domains/subdomains, not URL paths.

To use this exact URL:

```txt
https://4lifetags.com/Hype-Chains/
```

do this:

1. Deploy this folder as a NEW Netlify project from GitHub.
2. Copy the new Netlify project URL, for example:
   `https://your-hype-chains-project.netlify.app`
3. Open your MAIN 4lifetags.com site repo.
4. Add the lines from `MAIN_SITE_REDIRECTS_TO_ADD.txt` to the MAIN site's `_redirects` file.
5. Replace `YOUR-HYPE-CHAINS-NETLIFY-SITE.netlify.app` with your real new Netlify project URL.
6. Redeploy the MAIN 4lifetags.com site.

The first redirect line proxies Shopify function calls through the same path, so checkout still works from:

```txt
4lifetags.com/Hype-Chains/
```
