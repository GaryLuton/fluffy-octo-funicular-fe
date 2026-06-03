const express = require('express');
const fetch = require('node-fetch');
const config = require('../config');
const { all, get, run } = require('../../db');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

const PRINTIFY_BASE = 'https://api.printify.com/v1';

let stripe = null;
function getStripe() {
  if (!stripe && config.STRIPE_SECRET_KEY) {
    try { stripe = require('stripe')(config.STRIPE_SECRET_KEY); }
    catch (e) { console.error('Stripe SDK not installed:', e.message); }
  }
  return stripe;
}

function printifyConfigured() {
  return !!(config.PRINTIFY_API_TOKEN && config.PRINTIFY_SHOP_ID);
}

async function printifyGet(path) {
  const res = await fetch(`${PRINTIFY_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${config.PRINTIFY_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Printify ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Generic Printify call that accepts an explicit token (for setup routes that
// take ?token=) and any HTTP method. Returns parsed JSON or {} for empty bodies.
async function callPrintify(method, path, opts) {
  opts = opts || {};
  const token = opts.token || config.PRINTIFY_API_TOKEN;
  const init = { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const res = await fetch(`${PRINTIFY_BASE}${path}`, init);
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    const err = new Error(`Printify ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Map Printify's product shape to the lean shape the storefront needs.
function normalizeProduct(p) {
  const all = Array.isArray(p.variants) ? p.variants : [];
  const enabled = all.filter((v) => v.is_enabled);
  const useVariants = enabled.length ? enabled : all;
  const variants = useVariants.map((v) => ({
    id: String(v.id),
    title: v.title || 'Default',
    priceCents: Number(v.price) || 0,
    // Printify's per-variant availability at the print provider. Absent on some
    // payloads — treat unknown as available so we never hide a sellable item.
    available: v.is_available !== false,
  }));
  const inStockVariants = variants.filter((v) => v.available && v.priceCents > 0);
  const pricedAll = variants.map((v) => v.priceCents).filter((n) => n > 0);
  const minPrice = inStockVariants.length
    ? Math.min(...inStockVariants.map((v) => v.priceCents))
    : (pricedAll.length ? Math.min(...pricedAll) : 0);
  const imgs = (Array.isArray(p.images) ? p.images : []).map((i) => i.src).filter(Boolean);
  const def = (Array.isArray(p.images) ? p.images : []).find((i) => i.is_default);
  return {
    id: String(p.id),
    title: p.title || 'Untitled',
    description: stripHtml(p.description).slice(0, 2000),
    image: (def && def.src) || imgs[0] || '',
    images: imgs.slice(0, 8),
    priceCents: minPrice,
    inStock: inStockVariants.length > 0,
    currency: config.STORE_CURRENCY,
    variants,
  };
}

// ─── Demo catalog ─────────────────────────────────────────
// Served when Printify credentials are not configured so the storefront is
// usable in preview/dev. Images are inline SVG data URIs (no network needed).
function svgImage(label, bg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
    <rect width="600" height="600" fill="${bg}"/>
    <text x="50%" y="50%" font-family="sans-serif" font-size="42" font-weight="bold"
      fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${label}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const DEMO_PRODUCTS = [
  {
    id: 'demo-tee',
    title: 'Stuflover Classic Tee',
    description: 'Soft, breathable cotton tee with the Stuflover mark. Print-on-demand by Printify.',
    image: svgImage('Tee', '#c87860'),
    images: [svgImage('Tee', '#c87860')],
    priceCents: 2400,
    variants: [
      { id: 'demo-tee-s', title: 'Small', priceCents: 2400 },
      { id: 'demo-tee-m', title: 'Medium', priceCents: 2400 },
      { id: 'demo-tee-l', title: 'Large', priceCents: 2600 },
    ],
  },
  {
    id: 'demo-hoodie',
    title: 'Cozy Pullover Hoodie',
    description: 'Heavyweight fleece hoodie. Cozy enough to live in.',
    image: svgImage('Hoodie', '#a86050'),
    images: [svgImage('Hoodie', '#a86050')],
    priceCents: 4800,
    variants: [
      { id: 'demo-hoodie-m', title: 'Medium', priceCents: 4800 },
      { id: 'demo-hoodie-l', title: 'Large', priceCents: 4800 },
    ],
  },
  {
    id: 'demo-mug',
    title: 'Morning Person Mug',
    description: '11oz ceramic mug. Dishwasher and microwave safe.',
    image: svgImage('Mug', '#e8a060'),
    images: [svgImage('Mug', '#e8a060')],
    priceCents: 1500,
    variants: [{ id: 'demo-mug-1', title: 'One size', priceCents: 1500 }],
  },
  {
    id: 'demo-tote',
    title: 'Everyday Canvas Tote',
    description: 'Sturdy cotton canvas tote for groceries, books, and beach days.',
    image: svgImage('Tote', '#8a6a90'),
    images: [svgImage('Tote', '#8a6a90')],
    priceCents: 1900,
    variants: [{ id: 'demo-tote-1', title: 'One size', priceCents: 1900 }],
  },
];

// ─── Cache ────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
let listCache = { at: 0, data: null };

// Demo products are static, so they don't carry the configured store currency
// the way normalizeProduct'd ones do — stamp it on at read time.
function withCurrency(p) {
  return p ? Object.assign({}, p, { currency: p.currency || config.STORE_CURRENCY }) : p;
}

async function loadProducts() {
  if (!printifyConfigured()) return DEMO_PRODUCTS.map(withCurrency);
  if (listCache.data && Date.now() - listCache.at < CACHE_TTL_MS) return listCache.data;
  const json = await printifyGet(`/shops/${config.PRINTIFY_SHOP_ID}/products.json?limit=50`);
  // Respect Printify's visibility toggle ("hide from API" sets visible:false),
  // and only show products that have a priced variant.
  const data = (Array.isArray(json.data) ? json.data : [])
    .filter((p) => p.visible !== false)
    .map(normalizeProduct)
    .filter((p) => p.priceCents > 0);
  listCache = { at: Date.now(), data };
  return data;
}

async function loadProduct(id) {
  if (!printifyConfigured()) {
    return withCurrency(DEMO_PRODUCTS.find((p) => p.id === String(id)) || null);
  }
  const json = await printifyGet(`/shops/${config.PRINTIFY_SHOP_ID}/products/${encodeURIComponent(id)}.json`);
  return normalizeProduct(json);
}

// ─── Routes ───────────────────────────────────────────────
// Setup helper: list the shops a token can access, so you can read off the
// numeric PRINTIFY_SHOP_ID. Pass ?token=... for one-time setup, or rely on
// PRINTIFY_API_TOKEN once it's configured. Returns nothing without a valid token.
router.get('/shops', async (req, res) => {
  const token = (req.query.token || config.PRINTIFY_API_TOKEN || '').toString().trim();
  if (!token) return res.status(400).json({ error: 'Provide ?token=YOUR_PRINTIFY_API_TOKEN' });
  try {
    const r = await fetch(`${PRINTIFY_BASE}/shops.json`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return res.status(r.status === 401 ? 401 : 502).json({ error: `Printify ${r.status}: ${text.slice(0, 200)}` });
    }
    const shops = await r.json();
    const list = (Array.isArray(shops) ? shops : []).map((s) => ({
      id: s.id, title: s.title, sales_channel: s.sales_channel,
    }));
    res.json({ shops: list, hint: 'Use the numeric "id" value as PRINTIFY_SHOP_ID' });
  } catch (e) {
    console.error('Printify shops error:', e.message);
    res.status(502).json({ error: 'Could not reach Printify' });
  }
});

router.get('/products', async (req, res) => {
  try {
    const products = await loadProducts();
    res.json({ products, demo: !printifyConfigured() });
  } catch (e) {
    console.error('Printify list error:', e.message);
    res.status(502).json({ error: 'Could not load products', detail: e.message });
  }
});

router.get('/products/:id', async (req, res) => {
  try {
    const product = await loadProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json({ product, demo: !printifyConfigured() });
  } catch (e) {
    console.error('Printify product error:', e.message);
    res.status(502).json({ error: 'Could not load product', detail: e.message });
  }
});

// ─── Publish acknowledgement ──────────────────────────────
// Custom-integration stores leave products stuck on "Publishing" until the
// connected app confirms the publish. We don't host per-product pages, so the
// handle just points at the storefront.
function publishExternal(productId) {
  return { id: String(productId), handle: `${config.PUBLIC_BASE_URL}/shopp` };
}

// One-shot helper: acknowledge publishing for every product in the shop so they
// flip from "Publishing" to "Published". Safe to re-run. Open it in a browser.
router.get('/publish/resolve', async (req, res) => {
  const token = (req.query.token || config.PRINTIFY_API_TOKEN || '').toString().trim();
  const shopId = (req.query.shop_id || config.PRINTIFY_SHOP_ID || '').toString().trim();
  if (!token || !shopId) return res.status(400).json({ error: 'Need a token and shop_id (set env vars or pass ?token=&shop_id=)' });
  try {
    const json = await callPrintify('GET', `/shops/${shopId}/products.json?limit=50`, { token });
    const products = Array.isArray(json.data) ? json.data : [];
    const results = [];
    for (const p of products) {
      try {
        await callPrintify('POST', `/shops/${shopId}/products/${p.id}/publishing_succeeded.json`, {
          token, body: { external: publishExternal(p.id) },
        });
        results.push({ id: p.id, title: p.title, ok: true });
      } catch (e) {
        results.push({ id: p.id, title: p.title, ok: false, error: e.message });
      }
    }
    listCache = { at: 0, data: null };
    res.json({ total: products.length, resolved: results.filter((r) => r.ok).length, results });
  } catch (e) {
    console.error('Printify resolve error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

// Register the publish webhook with Printify so future publishes auto-confirm.
router.get('/webhook/register', async (req, res) => {
  const token = (req.query.token || config.PRINTIFY_API_TOKEN || '').toString().trim();
  const shopId = (req.query.shop_id || config.PRINTIFY_SHOP_ID || '').toString().trim();
  if (!token || !shopId) return res.status(400).json({ error: 'Need a token and shop_id' });
  const key = config.PRINTIFY_WEBHOOK_KEY;
  const url = `https://${req.get('host')}/api/printify/webhook${key ? `?key=${encodeURIComponent(key)}` : ''}`;
  try {
    const created = await callPrintify('POST', `/shops/${shopId}/webhooks.json`, {
      token, body: { topic: 'product:publish:started', url },
    });
    res.json({ ok: true, url, webhook: created });
  } catch (e) {
    console.error('Printify webhook register error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

// Printify calls this when a product publish starts; we immediately confirm it.
router.post('/webhook', async (req, res) => {
  if (config.PRINTIFY_WEBHOOK_KEY && req.query.key !== config.PRINTIFY_WEBHOOK_KEY) {
    return res.status(401).json({ error: 'bad key' });
  }
  res.json({ received: true }); // ack fast; Printify retries on non-2xx
  const event = req.body || {};
  if (event.type !== 'product:publish:started') return;
  try {
    const productId = event.resource && event.resource.id;
    const shopId = (event.resource && event.resource.data && event.resource.data.shop_id) || config.PRINTIFY_SHOP_ID;
    if (productId && shopId) {
      await callPrintify('POST', `/shops/${shopId}/products/${productId}/publishing_succeeded.json`, {
        body: { external: publishExternal(productId) },
      });
      listCache = { at: 0, data: null };
    }
  } catch (e) {
    console.error('Printify webhook handler error:', e.message);
  }
});

// Build a price-verified line item from a client {id, variantId, quantity}.
// Prices always come from the server's view of the catalog — never the client.
async function resolveLineItem(raw) {
  const id = String(raw.id || '');
  const variantId = String(raw.variantId || '');
  const quantity = Math.max(1, Math.min(parseInt(raw.quantity, 10) || 1, 99));
  if (!id) return { error: 'Missing product' };
  const product = await loadProduct(id);
  if (!product) return { error: 'Product unavailable' };
  let variant = product.variants.find((v) => v.id === variantId);
  // Fall back to a sellable variant, not just the first (which may be sold out).
  if (!variant) variant = product.variants.find((v) => v.available !== false && v.priceCents > 0) || product.variants[0];
  if (!variant || variant.priceCents <= 0) return { error: `${product.title} is unavailable` };
  if (variant.available === false) {
    return { error: `${product.title} — ${variant.title} is out of stock` };
  }
  return {
    productId: id,
    variantId: variant.id,
    quantity,
    title: product.title,
    variantTitle: variant.title,
    priceCents: variant.priceCents,
    image: product.image,
  };
}

router.post('/checkout', async (req, res) => {
  try {
    const rawItems = Array.isArray(req.body && req.body.items) ? req.body.items.slice(0, 50) : [];
    if (!rawItems.length) return res.status(400).json({ error: 'Cart is empty' });

    const lineItems = [];
    for (const raw of rawItems) {
      const li = await resolveLineItem(raw);
      if (li.error) return res.status(400).json({ error: li.error });
      lineItems.push(li);
    }
    const totalCents = lineItems.reduce((a, i) => a + i.priceCents * i.quantity, 0);

    const s = getStripe();
    if (!s) {
      // Mock checkout when Stripe is not configured — useful in dev/preview.
      return res.json({ url: `${config.PUBLIC_BASE_URL}/shopp.html?success=1&mock=1`, mock: true, totalCents });
    }

    // Persist a pending order so the Stripe webhook can submit it to Printify
    // for fulfillment after payment (and do so idempotently).
    const orderItems = lineItems.map((it) => ({
      product_id: it.productId,
      variant_id: it.variantId,
      quantity: it.quantity,
      title: it.title,
    }));
    const orderRes = run(
      `INSERT INTO printify_orders (total_cents, currency, line_items_json, status)
       VALUES (?, ?, ?, 'pending')`,
      [totalCents, config.STORE_CURRENCY, JSON.stringify(orderItems)]
    );
    const orderId = orderRes.lastInsertRowid;

    const session = await s.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      phone_number_collection: { enabled: true },
      line_items: lineItems.map((it) => ({
        quantity: it.quantity,
        price_data: {
          currency: config.STORE_CURRENCY,
          unit_amount: it.priceCents,
          product_data: {
            name: `${it.title}${it.variantTitle ? ' — ' + it.variantTitle : ''}`.slice(0, 200),
            images: /^https?:\/\//.test(it.image) ? [it.image] : [],
          },
        },
      })),
      success_url: `${config.PUBLIC_BASE_URL}/shopp.html?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.PUBLIC_BASE_URL}/shopp.html?canceled=1`,
      shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'AU'] },
      metadata: { kind: 'printify', orderId: String(orderId) },
    });
    run('UPDATE printify_orders SET stripe_session_id = ? WHERE id = ?', [session.id, orderId]);
    res.json({ url: session.url });
  } catch (e) {
    console.error('Printify checkout error:', e.message);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// Map Stripe's collected shipping/customer details to Printify's address_to shape.
function buildPrintifyAddress(session) {
  const sd = session.shipping_details || {};
  const cd = session.customer_details || {};
  const addr = sd.address || cd.address || {};
  const fullName = (sd.name || cd.name || '').trim();
  const parts = fullName ? fullName.split(/\s+/) : [];
  const first = parts.shift() || 'Customer';
  const last = parts.join(' ') || '-';
  return {
    first_name: first,
    last_name: last,
    email: cd.email || '',
    phone: cd.phone || '',
    country: addr.country || '',
    region: addr.state || '',
    address1: addr.line1 || '',
    address2: addr.line2 || '',
    city: addr.city || '',
    zip: addr.postal_code || '',
  };
}

// Called from the Stripe webhook (in shop.js) when a Printify-tagged checkout
// session completes. Marks the order paid and submits it to Printify. Safe to
// call more than once for the same session — it won't create duplicate orders.
async function fulfillPrintifyOrder(session) {
  const orderId = parseInt((session.metadata && session.metadata.orderId) || '', 10);
  if (!orderId) return;
  const order = get('SELECT * FROM printify_orders WHERE id = ?', [orderId]);
  if (!order || order.printify_order_id) return; // unknown or already fulfilled

  const shipping = buildPrintifyAddress(session);
  run(
    `UPDATE printify_orders SET status = 'paid', stripe_payment_intent = ?, shipping_json = ? WHERE id = ?`,
    [session.payment_intent || '', JSON.stringify(shipping), orderId]
  );

  // Without Printify credentials (e.g. the demo catalog) we can only record the
  // order — there's nothing real to fulfill.
  if (!printifyConfigured()) return;

  const items = JSON.parse(order.line_items_json || '[]');
  const lineItems = items
    .filter((i) => /^\d+$/.test(String(i.variant_id)))
    .map((i) => ({ product_id: String(i.product_id), variant_id: Number(i.variant_id), quantity: i.quantity }));
  if (!lineItems.length) return;

  const body = {
    external_id: `stuflover-${orderId}`,
    label: `Stuflover order #${orderId}`,
    line_items: lineItems,
    shipping_method: 1,
    send_shipping_notification: false,
    address_to: shipping,
  };
  try {
    const created = await callPrintify('POST', `/shops/${config.PRINTIFY_SHOP_ID}/orders.json`, { body });
    const pid = String((created && (created.id || created.order_id)) || '');
    run(`UPDATE printify_orders SET status = 'submitted', printify_order_id = ? WHERE id = ?`, [pid, orderId]);
    if (config.PRINTIFY_AUTO_PRODUCTION && pid) {
      await callPrintify('POST', `/shops/${config.PRINTIFY_SHOP_ID}/orders/${pid}/send_to_production.json`, {});
      run(`UPDATE printify_orders SET status = 'in_production' WHERE id = ?`, [orderId]);
    }
  } catch (e) {
    console.error('Printify order submit failed:', e.message);
    run(`UPDATE printify_orders SET status = 'submit_failed' WHERE id = ?`, [orderId]);
  }
}

// Diagnostics: recent Printify orders and their fulfillment status. Admin only.
// status flow: pending -> paid -> submitted (-> in_production) | submit_failed
router.get('/orders', adminAuth, (req, res) => {
  const orders = all(
    `SELECT id, status, total_cents, currency, printify_order_id, stripe_session_id,
            line_items_json, created_at
     FROM printify_orders ORDER BY id DESC LIMIT 50`
  );
  res.json({
    printifyConfigured: printifyConfigured(),
    autoProduction: config.PRINTIFY_AUTO_PRODUCTION,
    count: orders.length,
    orders,
  });
});

router.fulfillPrintifyOrder = fulfillPrintifyOrder;
module.exports = router;
