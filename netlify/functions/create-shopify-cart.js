const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";

function send(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function toVariantId(id) {
  if (!id) return "";
  const clean = String(id).trim();
  if (clean.startsWith("gid://shopify/ProductVariant/")) return clean;
  return `gid://shopify/ProductVariant/${clean}`;
}

function getSizeKey(size) {
  const value = String(size || "").toLowerCase();
  if (value.includes("small")) return "SMALL";
  if (value.includes("large")) return "LARGE";
  return "MEDIUM";
}

function getVariantForSize(size) {
  const key = getSizeKey(size);
  return toVariantId(process.env[`SHOPIFY_HYPE_CHAIN_${key}_VARIANT_ID`]);
}

function clean(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(" • ");
  return String(value || "").trim();
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return send(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return send(405, { error: "Method not allowed" });
  }

  const shopDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

  if (!shopDomain || !token) {
    return send(500, {
      error: "Missing Shopify store domain or Storefront access token."
    });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return send(400, { error: "Invalid checkout data." });
  }

  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!items.length) {
    return send(400, { error: "No items were sent to checkout." });
  }

  const lines = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const variantId = getVariantForSize(item.size);

    if (!variantId) {
      return send(400, {
        error: `Missing Shopify variant ID for ${item.size || "selected size"}.`
      });
    }

    const quantity = Math.max(1, Number(item.quantity || 1));

    lines.push({
      merchandiseId: variantId,
      quantity,
      attributes: [
        { key: "Builder item", value: clean(item.name || `Hype Chain ${i + 1}`) },
        { key: "Selection type", value: clean(item.selection) },
        { key: "Team text", value: clean(item.teamText) || "None" },
        { key: "Design text", value: clean(item.designText) || "None" },
        { key: "Uploaded file", value: clean(item.uploadFile) || "None" },
        { key: "Chain editor", value: clean(item.editorMode) },
        { key: "Basic chain color", value: clean(item.basicColor) },
        { key: "Pattern", value: clean(item.pattern) || "None" },
        { key: "Size", value: clean(item.size) },
        { key: "Special request", value: clean(item.request) || "None" },
        { key: "How they heard", value: clean(item.heard) || "Not selected" }
      ]
    });

    const usesPatternBuilder = String(item.editorMode || "").toLowerCase() === "advanced";
    const addonVariantId = toVariantId(process.env.SHOPIFY_PATTERN_BUILDER_ADDON_VARIANT_ID);

    if (usesPatternBuilder && addonVariantId) {
      lines.push({
        merchandiseId: addonVariantId,
        quantity,
        attributes: [
          { key: "Add-on for", value: clean(item.name || `Hype Chain ${i + 1}`) },
          { key: "Add-on type", value: "Pattern Builder" }
        ]
      });
    }
  }

  const query = `
    mutation CreateCart($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await fetch(
    `https://${shopDomain}/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": token
      },
      body: JSON.stringify({
        query,
        variables: {
          input: {
            lines,
            attributes: [
              { key: "Builder", value: "4LifeTags Hype Chain Builder" }
            ]
          }
        }
      })
    }
  );

  const result = await response.json();

  if (!response.ok || result.errors) {
    return send(500, {
      error: "Shopify API error.",
      details: result.errors || result
    });
  }

  const userErrors = result.data.cartCreate.userErrors;

  if (userErrors.length) {
    return send(400, {
      error: userErrors.map((error) => error.message).join(" ")
    });
  }

  return send(200, {
    checkoutUrl: result.data.cartCreate.cart.checkoutUrl,
    cartId: result.data.cartCreate.cart.id
  });
};
