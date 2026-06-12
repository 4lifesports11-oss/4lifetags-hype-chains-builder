const FUNCTION_VERSION = "hype-chain-combined-upload-v3";
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || "10");

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

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Server is missing required configuration: ${name}`);
  return value;
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

function safeFilename(filename) {
  return String(filename || "hype-chain-upload")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

function isAllowedMime(mimeType) {
  return /^image\/(png|jpe?g|webp|svg\+xml)$/i.test(mimeType || "");
}

function parseDataUrl(dataUrl, fallbackMime) {
  const text = String(dataUrl || "");
  const match = text.match(/^data:([^;,]+)?;base64,(.+)$/);
  const mimeType = match && match[1] ? match[1] : fallbackMime;
  const base64 = match ? match[2] : text;
  return { mimeType, buffer: Buffer.from(base64, "base64") };
}

let cachedAdminToken = null;
let cachedAdminTokenExpiresAt = 0;

async function getAdminAccessToken() {
  if (process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET) {
    const now = Date.now();

    if (cachedAdminToken && now < cachedAdminTokenExpiresAt - 5 * 60 * 1000) {
      return cachedAdminToken;
    }

    const storeDomain = requireEnv("SHOPIFY_STORE_DOMAIN").replace(/^https?:\/\//, "");

    const body = new URLSearchParams();
    body.set("grant_type", "client_credentials");
    body.set("client_id", requireEnv("SHOPIFY_CLIENT_ID"));
    body.set("client_secret", requireEnv("SHOPIFY_CLIENT_SECRET"));

    const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
      console.error("Shopify token request failed:", JSON.stringify(data, null, 2));
      throw new Error("Shopify Admin access could not be created.");
    }

    cachedAdminToken = data.access_token;
    cachedAdminTokenExpiresAt = Date.now() + Number(data.expires_in || 86399) * 1000;
    return cachedAdminToken;
  }

  return requireEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
}

async function shopifyAdmin(query, variables) {
  const storeDomain = requireEnv("SHOPIFY_STORE_DOMAIN").replace(/^https?:\/\//, "");
  const token = await getAdminAccessToken();

  const response = await fetch(`https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token
    },
    body: JSON.stringify({ query, variables })
  });

  const data = await response.json();

  if (!response.ok || data.errors) {
    console.error("Shopify Admin error:", JSON.stringify(data, null, 2));
    throw new Error("Shopify API error.");
  }

  return data;
}

async function shopifyStorefront(query, variables) {
  const shopDomain = requireEnv("SHOPIFY_STORE_DOMAIN");
  const token = requireEnv("SHOPIFY_STOREFRONT_ACCESS_TOKEN");

  const response = await fetch(`https://${shopDomain}/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": token
    },
    body: JSON.stringify({ query, variables })
  });

  const result = await response.json();

  if (!response.ok || result.errors) {
    return { ok: false, statusCode: 500, body: { error: "Shopify API error.", details: result.errors || result } };
  }

  return { ok: true, result };
}

async function createStagedTarget(file) {
  const mutation = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
  `;

  const data = await shopifyAdmin(mutation, {
    input: [
      {
        filename: file.filename,
        mimeType: file.mimeType,
        httpMethod: "POST",
        resource: "PRODUCT_IMAGE"
      }
    ]
  });

  const payload = data.data.stagedUploadsCreate;

  if (payload.userErrors && payload.userErrors.length) {
    throw new Error(payload.userErrors.map((error) => error.message).join(", "));
  }

  return payload.stagedTargets[0];
}

async function uploadToStagedTarget(target, file) {
  const form = new FormData();

  target.parameters.forEach((param) => {
    form.append(param.name, param.value);
  });

  form.append("file", new Blob([file.buffer], { type: file.mimeType }), file.filename);

  const response = await fetch(target.url, { method: "POST", body: form });

  if (!response.ok) {
    const text = await response.text();
    console.error("Staged upload failed:", response.status, text);
    throw new Error("Could not upload image to Shopify storage.");
  }
}

async function createShopifyFile(target, file) {
  const mutation = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          alt
          createdAt
          ... on MediaImage { image { url } }
        }
        userErrors { field message }
      }
    }
  `;

  const data = await shopifyAdmin(mutation, {
    files: [
      {
        alt: file.filename,
        contentType: "IMAGE",
        originalSource: target.resourceUrl
      }
    ]
  });

  const payload = data.data.fileCreate;

  if (payload.userErrors && payload.userErrors.length) {
    throw new Error(payload.userErrors.map((error) => error.message).join(", "));
  }

  return payload.files[0];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getShopifyFilePublicUrl(fileId) {
  const query = `
    query getFile($id: ID!) {
      node(id: $id) {
        ... on MediaImage {
          id
          fileStatus
          image { url }
        }
      }
    }
  `;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const data = await shopifyAdmin(query, { id: fileId });
    const node = data.data && data.data.node ? data.data.node : null;
    const url = node && node.image && node.image.url ? node.image.url : "";
    if (url) return url;
    await sleep(1000);
  }

  return "";
}

async function handleUploadImage(payload) {
  const parsed = parseDataUrl(payload.dataUrl, payload.mimeType);
  const file = {
    filename: safeFilename(payload.filename),
    mimeType: parsed.mimeType,
    buffer: parsed.buffer
  };

  if (!isAllowedMime(file.mimeType)) {
    return send(400, { error: "Please upload a PNG, JPG, WEBP, or SVG image file." });
  }

  if (!file.buffer.length) {
    return send(400, { error: "No image data was uploaded." });
  }

  const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
  if (file.buffer.length > maxBytes) {
    return send(400, { error: `Image file is too large. Max size is ${MAX_UPLOAD_MB}MB.` });
  }

  const target = await createStagedTarget(file);
  await uploadToStagedTarget(target, file);

  const createdFile = await createShopifyFile(target, file);
  const publicUrl = await getShopifyFilePublicUrl(createdFile.id);

  return send(200, {
    version: FUNCTION_VERSION,
    action: "uploadImage",
    fileId: createdFile.id,
    status: createdFile.fileStatus,
    url: publicUrl || "",
    filename: file.filename,
    message: publicUrl
      ? "Image uploaded and public image URL is ready."
      : "Image uploaded, but Shopify is still processing the image link."
  });
}

async function handleCheckout(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return send(400, { error: "No items were sent to checkout. If you were uploading an image, the deployed function is not receiving the uploadImage action.", version: FUNCTION_VERSION });

  const lines = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const variantId = getVariantForSize(item.size);

    if (!variantId) {
      return send(400, { error: `Missing Shopify variant ID for ${item.size || "selected size"}.` });
    }

    const quantity = Math.max(1, Number(item.quantity || 1));
    const uploadLink = clean(item.uploadFileUrl || item.uploadFile || "");

    lines.push({
      merchandiseId: variantId,
      quantity,
      attributes: [
        { key: "Builder item", value: clean(item.name || `Hype Chain ${i + 1}`) },
        { key: "Selection type", value: clean(item.selection) },
        { key: "Team text", value: clean(item.teamText) || "None" },
        { key: "Design text", value: clean(item.designText) || "None" },
        { key: "Uploaded image URL", value: uploadLink || "None" },
        { key: "Open uploaded image", value: uploadLink || "No uploaded image" },
        { key: "Uploaded filename", value: clean(item.uploadFileName || item.uploadFile) || "None" },
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
        cart { id checkoutUrl }
        userErrors { field message }
      }
    }
  `;

  const store = await shopifyStorefront(query, {
    input: {
      lines,
      attributes: [
        { key: "Builder", value: "4LifeTags Hype Chain Builder" }
      ]
    }
  });

  if (!store.ok) return send(store.statusCode, store.body);

  const userErrors = store.result.data.cartCreate.userErrors;
  if (userErrors.length) {
    return send(400, { error: userErrors.map((error) => error.message).join(" ") });
  }

  return send(200, {
    version: FUNCTION_VERSION,
    action: "checkout",
    checkoutUrl: store.result.data.cartCreate.cart.checkoutUrl,
    cartId: store.result.data.cartCreate.cart.id
  });
}

exports.handler = async function (event) {
  try {
    if (event.httpMethod === "OPTIONS") return send(200, { ok: true, version: FUNCTION_VERSION });
    if (event.httpMethod === "GET") {
      return send(200, {
        ok: true,
        version: FUNCTION_VERSION,
        message: "Combined Hype Chain function is installed.",
        supports: ["uploadImage", "checkout"]
      });
    }
    if (event.httpMethod !== "POST") return send(405, { error: "Method not allowed", version: FUNCTION_VERSION });

    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return send(400, { error: "Invalid request data." });
    }

    if (payload.action === "uploadImage") {
      return await handleUploadImage(payload);
    }

    return await handleCheckout(payload);
  } catch (error) {
    console.error(error);
    const message = String(error.message || "").startsWith("Server is missing")
      ? error.message
      : (error.message || "Something went wrong.");
    return send(500, { error: message });
  }
};
