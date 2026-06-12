IMPORTANT

Upload the CONTENTS of this folder to your GitHub repo root.

Correct file locations:

index.html
  - This must start with: <!doctype html>
  - This is the website/builder page.

netlify.toml
  - This must start with: [build]
  - This is Netlify config.

package.json
  - This must start with: {
  - This is package config.

netlify/functions/create-shopify-cart.js
  - This must start with JavaScript code like: const SHOPIFY_API_VERSION...
  - This is the Shopify checkout function.

Do NOT paste the function code into index.html.
Do NOT paste the redirect instructions into package.json.
Do NOT paste HTML into netlify.toml.
