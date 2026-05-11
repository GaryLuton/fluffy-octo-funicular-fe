const express = require('express');
const { all, get, run } = require('../../db');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const { isCleanText } = require('../utils/content');
const config = require('../config');

const router = express.Router();

let stripe = null;
function getStripe() {
  if (!stripe && config.STRIPE_SECRET_KEY) {
    try { stripe = require('stripe')(config.STRIPE_SECRET_KEY); }
    catch (e) { console.error('Stripe SDK not installed:', e.message); }
  }
  return stripe;
}

function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'shop';
}

function uniqueSlug(base) {
  let slug = slugify(base);
  let n = 1;
  while (get('SELECT 1 FROM shops WHERE slug = ?', [slug])) {
    n += 1;
    slug = `${slugify(base)}-${n}`;
  }
  return slug;
}

function parseImageUrls(s) {
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

function hydrateProduct(p) {
  if (!p) return p;
  p.image_urls = parseImageUrls(p.image_urls);
  return p;
}

// ─── Shops ────────────────────────────────────────────────
const ALLOWED_CATEGORIES = ['Apparel','Jewelry','Art','Home','Vintage','Craft','Digital','Other'];
const ALLOWED_KIND = ['handmade','vintage','digital','reseller','mixed'];
const ALLOWED_EXPERIENCE = ['hobby','side-hustle','full-time'];

router.post('/shops', auth, (req, res) => {
  try {
    const { name, handle, bio, categories, productKind, shipsFrom, experience } = req.body || {};
    if (!name || name.length < 2) return res.status(400).json({ error: 'Shop name required' });
    if (!isCleanText(name)) return res.status(400).json({ error: 'Keep name appropriate' });
    if (bio && !isCleanText(bio)) return res.status(400).json({ error: 'Keep bio appropriate' });

    let cleanHandle = '';
    if (handle != null && String(handle).length) {
      cleanHandle = String(handle).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
      if (cleanHandle.length < 3) return res.status(400).json({ error: 'Username must be 3+ letters, numbers, or underscores' });
      const dup = get('SELECT 1 FROM shops WHERE handle = ?', [cleanHandle]);
      if (dup) return res.status(409).json({ error: 'That username is taken' });
    }

    const cats = Array.isArray(categories)
      ? categories.filter((c) => ALLOWED_CATEGORIES.includes(c)).slice(0, 8)
      : [];
    const kind = ALLOWED_KIND.includes(productKind) ? productKind : '';
    const exp = ALLOWED_EXPERIENCE.includes(experience) ? experience : '';
    const ships = (shipsFrom || '').toString().substring(0, 60);

    const existing = get('SELECT * FROM shops WHERE owner_id = ?', [req.user.id]);
    if (existing) return res.status(409).json({ error: 'You already own a shop', shop: existing });
    const slug = uniqueSlug(cleanHandle || name);
    const r = run(
      `INSERT INTO shops (owner_id, name, slug, bio, handle, categories, product_kind, ships_from, experience)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        name.substring(0, 80),
        slug,
        (bio || '').substring(0, 500),
        cleanHandle,
        JSON.stringify(cats),
        kind,
        ships,
        exp,
      ]
    );
    res.json({ ok: true, shopId: r.lastInsertRowid, slug });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// Cheap availability check for the wizard.
router.get('/handle-available', auth, (req, res) => {
  const h = String(req.query.handle || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (h.length < 3) return res.json({ available: false, reason: 'too-short' });
  const dup = get('SELECT 1 FROM shops WHERE handle = ?', [h]);
  res.json({ available: !dup, handle: h });
});

router.get('/shops/me', auth, (req, res) => {
  try {
    const shop = get('SELECT * FROM shops WHERE owner_id = ?', [req.user.id]);
    if (!shop) return res.json({ shop: null });
    const products = all(
      'SELECT * FROM shop_products WHERE shop_id = ? ORDER BY created_at DESC',
      [shop.id]
    ).map(hydrateProduct);
    res.json({ shop, products });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.patch('/shops/me', auth, (req, res) => {
  try {
    const shop = get('SELECT * FROM shops WHERE owner_id = ?', [req.user.id]);
    if (!shop) return res.status(404).json({ error: 'No shop' });
    const { name, bio, banner_url, avatar_url } = req.body || {};
    if (name && !isCleanText(name)) return res.status(400).json({ error: 'Keep name appropriate' });
    if (bio && !isCleanText(bio)) return res.status(400).json({ error: 'Keep bio appropriate' });
    run(
      `UPDATE shops SET
         name = COALESCE(?, name),
         bio = COALESCE(?, bio),
         banner_url = COALESCE(?, banner_url),
         avatar_url = COALESCE(?, avatar_url)
       WHERE id = ?`,
      [
        name ? name.substring(0, 80) : null,
        bio !== undefined ? bio.substring(0, 500) : null,
        banner_url !== undefined ? banner_url.substring(0, 500) : null,
        avatar_url !== undefined ? avatar_url.substring(0, 500) : null,
        shop.id,
      ]
    );
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.get('/shops/:slug', (req, res) => {
  try {
    const shop = get(
      `SELECT s.*, u.username FROM shops s JOIN users u ON u.id = s.owner_id WHERE s.slug = ?`,
      [req.params.slug]
    );
    if (!shop || shop.status !== 'active') return res.status(404).json({ error: 'Shop not found' });
    const products = all(
      `SELECT * FROM shop_products WHERE shop_id = ? AND status = 'active' ORDER BY created_at DESC`,
      [shop.id]
    ).map(hydrateProduct);
    res.json({ shop, products });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ─── Products ─────────────────────────────────────────────
router.get('/products', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 24, 60);
    const q = (req.query.q || '').toString().trim();
    const category = (req.query.category || '').toString().trim();
    const sort = (req.query.sort || 'new').toString();
    const where = [`p.status = 'active'`, `s.status = 'active'`];
    const params = [];
    if (q) {
      where.push(`(p.title LIKE ? OR p.description LIKE ? OR p.tags LIKE ?)`);
      const like = `%${q}%`; params.push(like, like, like);
    }
    if (category) { where.push('p.category = ?'); params.push(category); }
    let order = 'p.created_at DESC';
    if (sort === 'price_asc') order = 'p.price_cents ASC';
    if (sort === 'price_desc') order = 'p.price_cents DESC';
    const products = all(
      `SELECT p.*, s.slug as shop_slug, s.name as shop_name
       FROM shop_products p JOIN shops s ON s.id = p.shop_id
       WHERE ${where.join(' AND ')}
       ORDER BY ${order}
       LIMIT ? OFFSET ?`,
      [...params, limit, page * limit]
    ).map(hydrateProduct);
    res.json({ products, page });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.get('/products/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const product = hydrateProduct(get(
      `SELECT p.*, s.slug as shop_slug, s.name as shop_name, u.username as shop_owner
       FROM shop_products p JOIN shops s ON s.id = p.shop_id
       JOIN users u ON u.id = s.owner_id
       WHERE p.id = ?`,
      [id]
    ));
    if (!product) return res.status(404).json({ error: 'Not found' });
    const reviews = all(
      `SELECT r.rating, r.text, r.created_at, u.username
       FROM shop_reviews r JOIN users u ON u.id = r.user_id
       WHERE r.product_id = ? ORDER BY r.created_at DESC`,
      [id]
    );
    res.json({ product, reviews });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.post('/products', auth, (req, res) => {
  try {
    const shop = get('SELECT * FROM shops WHERE owner_id = ?', [req.user.id]);
    if (!shop) return res.status(400).json({ error: 'Open a shop first' });
    if (shop.status !== 'active') return res.status(403).json({ error: 'Shop suspended' });
    const { title, description, priceCents, imageUrls, category, tags, stock } = req.body || {};
    if (!title || title.length < 2) return res.status(400).json({ error: 'Title required' });
    if (!isCleanText(title)) return res.status(400).json({ error: 'Keep title appropriate' });
    if (description && !isCleanText(description)) return res.status(400).json({ error: 'Keep description appropriate' });
    const price = parseInt(priceCents);
    if (!Number.isFinite(price) || price < 50) return res.status(400).json({ error: 'Price must be at least $0.50' });
    const imgs = Array.isArray(imageUrls) ? imageUrls.slice(0, 8) : [];
    const r = run(
      `INSERT INTO shop_products (shop_id, title, description, price_cents, image_urls, category, tags, stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shop.id,
        title.substring(0, 200),
        (description || '').substring(0, 4000),
        price,
        JSON.stringify(imgs),
        (category || '').substring(0, 60),
        (tags || '').substring(0, 200),
        Math.max(0, parseInt(stock) || 1),
      ]
    );
    res.json({ ok: true, productId: r.lastInsertRowid });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.patch('/products/:id', auth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const product = get(
      `SELECT p.*, s.owner_id FROM shop_products p JOIN shops s ON s.id = p.shop_id WHERE p.id = ?`,
      [id]
    );
    if (!product) return res.status(404).json({ error: 'Not found' });
    if (product.owner_id !== req.user.id) return res.status(403).json({ error: 'Not yours' });
    const { title, description, priceCents, imageUrls, category, tags, stock, status } = req.body || {};
    if (title && !isCleanText(title)) return res.status(400).json({ error: 'Keep title appropriate' });
    if (description && !isCleanText(description)) return res.status(400).json({ error: 'Keep description appropriate' });
    run(
      `UPDATE shop_products SET
         title = COALESCE(?, title),
         description = COALESCE(?, description),
         price_cents = COALESCE(?, price_cents),
         image_urls = COALESCE(?, image_urls),
         category = COALESCE(?, category),
         tags = COALESCE(?, tags),
         stock = COALESCE(?, stock),
         status = COALESCE(?, status)
       WHERE id = ?`,
      [
        title ? title.substring(0, 200) : null,
        description !== undefined ? description.substring(0, 4000) : null,
        Number.isFinite(parseInt(priceCents)) ? parseInt(priceCents) : null,
        Array.isArray(imageUrls) ? JSON.stringify(imageUrls.slice(0, 8)) : null,
        category !== undefined ? category.substring(0, 60) : null,
        tags !== undefined ? tags.substring(0, 200) : null,
        Number.isFinite(parseInt(stock)) ? parseInt(stock) : null,
        status && ['active', 'hidden', 'sold_out'].includes(status) ? status : null,
        id,
      ]
    );
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/products/:id', auth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const product = get(
      `SELECT p.id, s.owner_id FROM shop_products p JOIN shops s ON s.id = p.shop_id WHERE p.id = ?`,
      [id]
    );
    if (!product) return res.status(404).json({ error: 'Not found' });
    if (product.owner_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Not yours' });
    }
    run('DELETE FROM shop_products WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ─── Favorites ───────────────────────────────────────────
router.post('/favorites/:productId', auth, (req, res) => {
  try {
    run(
      'INSERT OR IGNORE INTO shop_favorites (user_id, product_id) VALUES (?, ?)',
      [req.user.id, parseInt(req.params.productId)]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/favorites/:productId', auth, (req, res) => {
  try {
    run(
      'DELETE FROM shop_favorites WHERE user_id = ? AND product_id = ?',
      [req.user.id, parseInt(req.params.productId)]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/favorites', auth, (req, res) => {
  try {
    const products = all(
      `SELECT p.*, s.slug as shop_slug, s.name as shop_name
       FROM shop_favorites f
       JOIN shop_products p ON p.id = f.product_id
       JOIN shops s ON s.id = p.shop_id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`,
      [req.user.id]
    ).map(hydrateProduct);
    res.json({ products });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ─── Cart ────────────────────────────────────────────────
router.get('/cart', auth, (req, res) => {
  try {
    const items = all(
      `SELECT c.id as cart_id, c.quantity, p.*, s.slug as shop_slug, s.name as shop_name
       FROM shop_carts c
       JOIN shop_products p ON p.id = c.product_id
       JOIN shops s ON s.id = p.shop_id
       WHERE c.user_id = ?
       ORDER BY c.created_at DESC`,
      [req.user.id]
    ).map(hydrateProduct);
    const total = items.reduce((acc, it) => acc + it.price_cents * it.quantity, 0);
    res.json({ items, totalCents: total });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/cart', auth, (req, res) => {
  try {
    const productId = parseInt(req.body.productId);
    const quantity = Math.max(1, Math.min(parseInt(req.body.quantity) || 1, 99));
    const product = get(`SELECT * FROM shop_products WHERE id = ? AND status = 'active'`, [productId]);
    if (!product) return res.status(404).json({ error: 'Product unavailable' });
    run(
      `INSERT INTO shop_carts (user_id, product_id, quantity) VALUES (?, ?, ?)
       ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = excluded.quantity`,
      [req.user.id, productId, quantity]
    );
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/cart/:productId', auth, (req, res) => {
  try {
    run(
      'DELETE FROM shop_carts WHERE user_id = ? AND product_id = ?',
      [req.user.id, parseInt(req.params.productId)]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ─── Reviews ─────────────────────────────────────────────
router.post('/products/:id/reviews', auth, (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const rating = Math.max(1, Math.min(5, parseInt(req.body.rating) || 0));
    if (!rating) return res.status(400).json({ error: 'Rating 1-5 required' });
    const text = (req.body.text || '').toString();
    if (text && !isCleanText(text)) return res.status(400).json({ error: 'Keep review appropriate' });
    const purchased = get(
      `SELECT 1 FROM shop_order_items oi
       JOIN shop_orders o ON o.id = oi.order_id
       WHERE oi.product_id = ? AND o.buyer_id = ? AND o.status = 'paid' LIMIT 1`,
      [productId, req.user.id]
    );
    if (!purchased) return res.status(403).json({ error: 'Buy it before reviewing' });
    run(
      `INSERT INTO shop_reviews (product_id, user_id, rating, text) VALUES (?, ?, ?, ?)
       ON CONFLICT(product_id, user_id) DO UPDATE SET rating = excluded.rating, text = excluded.text`,
      [productId, req.user.id, rating, text.substring(0, 1500)]
    );
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ─── Orders / Checkout ───────────────────────────────────
router.get('/orders/me', auth, (req, res) => {
  try {
    const orders = all(
      `SELECT * FROM shop_orders WHERE buyer_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    orders.forEach((o) => {
      o.items = all('SELECT * FROM shop_order_items WHERE order_id = ?', [o.id]);
    });
    res.json({ orders });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/orders/:id', auth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const order = get('SELECT * FROM shop_orders WHERE id = ?', [id]);
    if (!order) return res.status(404).json({ error: 'Not found' });
    if (order.buyer_id !== req.user.id) return res.status(403).json({ error: 'Not yours' });
    order.items = all('SELECT * FROM shop_order_items WHERE order_id = ?', [id]);
    res.json({ order });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/orders/seller', auth, (req, res) => {
  try {
    const shop = get('SELECT id FROM shops WHERE owner_id = ?', [req.user.id]);
    if (!shop) return res.json({ items: [] });
    const items = all(
      `SELECT oi.*, o.status as order_status, o.created_at as ordered_at, u.username as buyer_username
       FROM shop_order_items oi
       JOIN shop_orders o ON o.id = oi.order_id
       JOIN users u ON u.id = o.buyer_id
       WHERE oi.shop_id = ? AND o.status = 'paid'
       ORDER BY o.created_at DESC LIMIT 100`,
      [shop.id]
    );
    res.json({ items });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/checkout', auth, async (req, res) => {
  try {
    const items = all(
      `SELECT c.quantity, p.id, p.title, p.price_cents, p.currency, p.image_urls, p.shop_id, p.status, p.stock
       FROM shop_carts c JOIN shop_products p ON p.id = c.product_id
       WHERE c.user_id = ?`,
      [req.user.id]
    );
    if (!items.length) return res.status(400).json({ error: 'Cart is empty' });
    for (const it of items) {
      if (it.status !== 'active') return res.status(400).json({ error: `${it.title} is unavailable` });
      if (it.stock != null && it.stock < it.quantity) {
        return res.status(400).json({ error: `${it.title}: only ${it.stock} left` });
      }
    }
    const totalCents = items.reduce((a, i) => a + i.price_cents * i.quantity, 0);

    // Create pending order first (so webhook can find it).
    const orderRes = run(
      `INSERT INTO shop_orders (buyer_id, total_cents, status) VALUES (?, ?, 'pending')`,
      [req.user.id, totalCents]
    );
    const orderId = orderRes.lastInsertRowid;
    for (const it of items) {
      run(
        `INSERT INTO shop_order_items (order_id, product_id, shop_id, title_snapshot, price_cents_snapshot, quantity)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, it.id, it.shop_id, it.title, it.price_cents, it.quantity]
      );
    }

    const s = getStripe();
    if (!s) {
      // Mock checkout when Stripe is not configured. Useful in dev/preview.
      run(
        `UPDATE shop_orders SET status = 'paid', stripe_session_id = ? WHERE id = ?`,
        [`mock_${orderId}_${Date.now()}`, orderId]
      );
      run('DELETE FROM shop_carts WHERE user_id = ?', [req.user.id]);
      for (const it of items) {
        run('UPDATE shop_products SET stock = MAX(0, stock - ?) WHERE id = ?', [it.quantity, it.id]);
      }
      const url = `${config.PUBLIC_BASE_URL}/shop-success?orderId=${orderId}&mock=1`;
      return res.json({ url, orderId, mock: true });
    }

    const session = await s.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: items.map((it) => {
        const imgs = parseImageUrls(it.image_urls).filter((u) => /^https?:\/\//.test(u)).slice(0, 1);
        return {
          quantity: it.quantity,
          price_data: {
            currency: it.currency || 'usd',
            unit_amount: it.price_cents,
            product_data: {
              name: it.title.substring(0, 200),
              images: imgs,
            },
          },
        };
      }),
      success_url: `${config.PUBLIC_BASE_URL}/shop-success?orderId=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.PUBLIC_BASE_URL}/shop-cart`,
      shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'AU'] },
      metadata: { orderId: String(orderId), buyerId: String(req.user.id) },
    });

    run('UPDATE shop_orders SET stripe_session_id = ? WHERE id = ?', [session.id, orderId]);
    res.json({ url: session.url, orderId });
  } catch (e) {
    console.error('Checkout error:', e);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// Webhook handler. Note: this route is mounted via raw body in app.js BEFORE
// express.json(), so req.body is a Buffer here.
router.post('/webhook', (req, res) => {
  const s = getStripe();
  if (!s) return res.status(503).json({ error: 'Stripe not configured' });
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    if (!config.STRIPE_WEBHOOK_SECRET) {
      event = JSON.parse(req.body.toString());
    } else {
      event = s.webhooks.constructEvent(req.body, sig, config.STRIPE_WEBHOOK_SECRET);
    }
  } catch (err) {
    console.error('Webhook sig error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = parseInt(session.metadata && session.metadata.orderId);
    if (orderId) {
      const order = get('SELECT * FROM shop_orders WHERE id = ?', [orderId]);
      if (order && order.status !== 'paid') {
        const shipping = session.shipping_details || session.customer_details || {};
        run(
          `UPDATE shop_orders SET status = 'paid', stripe_payment_intent = ?, shipping_json = ? WHERE id = ?`,
          [session.payment_intent || '', JSON.stringify(shipping), orderId]
        );
        const items = all('SELECT * FROM shop_order_items WHERE order_id = ?', [orderId]);
        for (const it of items) {
          run('UPDATE shop_products SET stock = MAX(0, stock - ?) WHERE id = ?', [it.quantity, it.product_id]);
        }
        run('DELETE FROM shop_carts WHERE user_id = ?', [order.buyer_id]);
      }
    }
  }
  res.json({ received: true });
});

// ─── Admin ───────────────────────────────────────────────
router.get('/admin/orders', adminAuth, (req, res) => {
  try {
    const orders = all(
      `SELECT o.*, u.username as buyer_username
       FROM shop_orders o JOIN users u ON u.id = o.buyer_id
       ORDER BY o.created_at DESC LIMIT 200`
    );
    res.json({ orders });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/admin/shops', adminAuth, (req, res) => {
  try {
    const shops = all(
      `SELECT s.*, u.username,
         (SELECT COUNT(*) FROM shop_products WHERE shop_id = s.id) as product_count
       FROM shops s JOIN users u ON u.id = s.owner_id
       ORDER BY s.created_at DESC`
    );
    res.json({ shops });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/admin/shops/:id/suspend', adminAuth, (req, res) => {
  try {
    run(`UPDATE shops SET status = 'suspended' WHERE id = ?`, [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/admin/shops/:id/activate', adminAuth, (req, res) => {
  try {
    run(`UPDATE shops SET status = 'active' WHERE id = ?`, [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
