import 'dotenv/config';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase, pool } from './db.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || 'local-dev-secret-change-me';
const defaultCurrency = 'USD';
const aviatorHouseEdge = 0.01;
const aviatorMinMultiplier = 1;
const aviatorMaxMultiplier = 1000000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vendorGameRoot = path.resolve(__dirname, '../vendor-games/pragmatic-dragon');
const vendorGameDesktopRoot = path.join(
  vendorGameRoot,
  'gs2c/common/v2/games-html5/games/vs/vswaysdragden/desktop'
);
const vendorGameAssetVersion = 'casusdt-local50';
const vendorGameInitPath = path.join(vendorGameRoot, 'gs2c/ge/v5/gameService.html');
const vendorGameInitResponse = fs.existsSync(vendorGameInitPath)
  ? fs.readFileSync(vendorGameInitPath, 'utf8')
  : '';
const vendorGameInitParams = new URLSearchParams(vendorGameInitResponse);
const cloakdDefaultPublicBaseUrl = process.env.NODE_ENV === 'production' ? 'https://casusdt.com' : 'http://localhost:5173';
const aviatorRounds = new Map();
const aviatorTickMs = 100;
const corsOrigins = [
  ...String(process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  'http://127.0.0.1:5173'
];

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin is not allowed by CORS.'));
  },
}));
app.use(express.json({
  verify: (req, _res, buffer) => {
    req.rawBody = buffer;
  }
}));
app.use(express.urlencoded({ extended: false }));

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateCredentials(email, password) {
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return 'Enter a valid email address.';
  }

  if (String(password || '').length < 8) {
    return 'Password must be at least 8 characters.';
  }

  return null;
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, isAdmin: Boolean(user.is_admin || user.isAdmin) },
    jwtSecret,
    { expiresIn: '2h' }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    balanceCents: Number(user.balance_cents || user.balanceCents || 0),
    isAdmin: Boolean(user.is_admin || user.isAdmin),
    fullName: user.full_name || user.fullName || '',
    status: user.status || 'active',
    createdAt: user.created_at || user.createdAt
  };
}

async function requireUser(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const [rows] = await pool.execute(
      'SELECT id, email, balance_cents, is_admin, full_name, status, created_at FROM users WHERE id = ? LIMIT 1',
      [payload.sub]
    );

    if (!rows[0]) {
      return res.status(401).json({ message: 'User no longer exists.' });
    }

    if (rows[0].status !== 'active') {
      return res.status(403).json({ message: 'Account is not active.' });
    }

    req.user = rows[0];
    next();
  } catch (_error) {
    res.status(401).json({ message: 'Invalid or expired session.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ message: 'Admin access required.' });
  }

  next();
}

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const [name, ...rawValue] = part.trim().split('=');

    if (name) {
      cookies[name] = decodeURIComponent(rawValue.join('=') || '');
    }

    return cookies;
  }, {});
}

function signVendorGameToken(user) {
  return jwt.sign(
    { sub: user.id, isAdmin: true, scope: 'vendor-game' },
    jwtSecret,
    { expiresIn: '30m' }
  );
}

async function requireVendorGameAccess(req, res, next) {
  const token = parseCookies(req.get('cookie') || '').vendorGameTicket || '';

  if (!token) {
    return res.status(401).send('Admin game session required.');
  }

  try {
    const payload = jwt.verify(token, jwtSecret);

    if (payload.scope !== 'vendor-game' || !payload.isAdmin) {
      return res.status(403).send('Admin game access required.');
    }

    const [rows] = await pool.execute(
      'SELECT id, email, balance_cents, is_admin, status FROM users WHERE id = ? LIMIT 1',
      [payload.sub]
    );

    if (!rows[0] || !rows[0].is_admin || rows[0].status !== 'active') {
      return res.status(403).send('Admin game access required.');
    }

    req.vendorGameUser = rows[0];
    next();
  } catch (_error) {
    res.status(401).send('Admin game session expired.');
  }
}

function formatGameBalance(cents = 0) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(cents) / 100);
}

function replaceGameParam(response, key, value) {
  const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp('(^|&)' + safeKey + '=[^&]*');

  if (pattern.test(response)) {
    return response.replace(pattern, '$1' + key + '=' + value);
  }

  return response + '&' + key + '=' + value;
}

function vendorGameResponse(params) {
  let response = vendorGameInitResponse;

  Object.entries(params).forEach(([key, value]) => {
    response = replaceGameParam(response, key, String(value));
  });

  return response;
}

function randomVendorSymbols(length) {
  const symbols = '123456789a';
  let result = '';

  for (let index = 0; index < length; index += 1) {
    result += symbols[Math.floor(Math.random() * symbols.length)];
  }

  return result;
}

function vendorGameSpinParams() {
  const reelWidth = Number(vendorGameInitParams.get('sw') || 6);
  const reelHeight = Number(vendorGameInitParams.get('sh') || 7);
  const symbolCount = Math.max(1, reelWidth * reelHeight);

  return {
    s: randomVendorSymbols(symbolCount),
    sa: randomVendorSymbols(reelWidth),
    sb: randomVendorSymbols(reelWidth),
    rs_p: '0',
    tw: '0.00',
    w: '0.00',
    na: 's'
  };
}

function parseDepositAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
    return null;
  }

  return Math.round(amount * 100);
}

function parseWalletAddress(value) {
  const walletAddress = String(value || '').trim();

  if (walletAddress.length < 8 || walletAddress.length > 255) {
    return null;
  }

  return walletAddress;
}

function parseGameBet(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
    return null;
  }

  return Math.round(amount * 100);
}

function aviatorCrashMultiplier(serverSeed, clientSeed) {
  const nonce = 1;
  const hash = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest('hex');
  const value = BigInt(`0x${hash.slice(0, 16)}`);
  const ratio = Number(value) / 18446744073709551616;

  if (ratio < aviatorHouseEdge) {
    return aviatorMinMultiplier;
  }

  const raw = (100 - aviatorHouseEdge * 100) / (100 - ratio * 100);
  const multiplier = Math.floor(raw * 100) / 100;

  return Math.max(aviatorMinMultiplier, Math.min(aviatorMaxMultiplier, multiplier));
}

function aviatorCurrentMultiplier(round, now = Date.now()) {
  const elapsedTicks = Math.max(0, Math.floor((now - round.startedAt) / 50));
  let multiplier = 0;

  for (let tick = 0; tick < elapsedTicks; tick += 1) {
    multiplier += 0.01 * (Math.floor(multiplier) + 1);
  }

  multiplier = Math.round(multiplier * 100) / 100;

  return Math.min(multiplier, round.crashMultiplier);
}

function publicAviatorRound(round) {
  const now = Date.now();
  const multiplier = aviatorCurrentMultiplier(round, now);
  const crashed = multiplier >= round.crashMultiplier;

  return {
    id: round.id,
    betCents: round.betCents,
    multiplier,
    crashed,
    serverSeedHash: round.serverSeedHash,
    startedAt: round.startedAt
  };
}

setInterval(() => {
  const now = Date.now();

  for (const [roundId, round] of aviatorRounds.entries()) {
    const expired = now - round.startedAt > 5 * 60 * 1000;
    const crashed = aviatorCurrentMultiplier(round, now) >= round.crashMultiplier;

    if (expired || crashed) {
      aviatorRounds.delete(roundId);
    }
  }
}, 30 * 1000).unref?.();

async function createCloakdSession({ amountCents, currency, email, userId }) {
  const baseUrl = process.env.CLOAKD_API_URL;
  const apiKey = process.env.CLOAKD_API_KEY;
  const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || cloakdDefaultPublicBaseUrl).replace(/\/$/, '');

  if (!baseUrl || !apiKey) {
    return {
      provider: 'cloakd-demo',
      reference: `demo-${Date.now()}-${userId}`,
      checkoutUrl: null,
      status: 'confirmed'
    };
  }

  const orderId = `deposit-${userId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const endpoint = process.env.CLOAKD_PAYMENT_PATH || '/payment';
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-API-Key': apiKey,
      'Idempotency-Key': orderId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      pay_amount: (amountCents / 100).toFixed(2),
      pay_currency: currency,
      order_id: orderId,
      order_description: 'Cashier deposit',
      callback_url: publicBaseUrl ? `${publicBaseUrl}/api/webhooks/cloakd` : undefined,
      success_url: publicBaseUrl ? `${publicBaseUrl}/?deposit=success` : undefined,
      cancel_url: publicBaseUrl ? `${publicBaseUrl}/?deposit=cancelled` : undefined,
      expiration_minutes: 60,
      customer_email: email,
      metadata: {
        userId,
        amountCents,
        currency
      }
    })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Cloakd deposit session could not be created.');
  }

  const responseData = data.data || data.payment || data.paymentLink || data.checkout || data;
  const reference = findFirstValue(responseData, [
    'id',
    'reference',
    'paymentId',
    'payment_id',
    'paymentLinkId',
    'payment_link_id',
    'order_id',
    'orderId',
    'checkoutId',
    'checkout_id'
  ]) || findFirstValue(data, ['id', 'reference', 'paymentId', 'payment_id', 'order_id', 'orderId']);
  const checkoutUrl = findFirstValue(responseData, [
    'checkout_url',
    'checkoutUrl',
    'checkoutURL',
    'paymentUrl',
    'payment_url',
    'paymentURL',
    'hosted_url',
    'hostedUrl',
    'invoice_url',
    'invoiceUrl',
    'url'
  ]) || findFirstValue(data, [
    'checkout_url',
    'checkoutUrl',
    'checkoutURL',
    'paymentUrl',
    'payment_url',
    'paymentURL',
    'hosted_url',
    'hostedUrl',
    'invoice_url',
    'invoiceUrl',
    'url'
  ]);

  if (!checkoutUrl) {
    console.error('Cloakd response did not include a checkout URL', data);
    throw new Error('Cloakd did not return a checkout URL.');
  }

  return {
    provider: 'cloakd',
    reference: String(reference || orderId),
    checkoutUrl: String(checkoutUrl),
    status: 'pending'
  };
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hmacHex(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function hmacBase64(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

function webhookSecretCandidates(secret) {
  const candidates = [secret];

  if (secret.startsWith('whsec_')) {
    const value = secret.slice(6);

    try {
      candidates.push(Buffer.from(value, 'base64'));
    } catch {}

    if (/^[a-f0-9]+$/i.test(value) && value.length % 2 === 0) {
      candidates.push(Buffer.from(value, 'hex'));
    }
  }

  return candidates;
}

function parseStripeSignature(signatureHeader = '') {
  return Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const [key, ...value] = part.split('=');
      return [key, value.join('=')];
    })
  );
}

function verifyCloakdWebhook(req) {
  const secret = process.env.CLOAKD_WEBHOOK_SECRET;

  if (!secret) {
    return true;
  }

  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const body = rawBody.toString('utf8');
  const stripeSignature = req.get('stripe-signature');
  const cloakdSignature = req.get('cloakd-signature') || req.get('x-cloakd-signature') || req.get('x-webhook-signature');
  const cloakdTimestamp = req.get('cloakd-timestamp') || req.get('x-cloakd-timestamp') || req.get('x-webhook-timestamp');
  const webhookId = req.get('webhook-id') || req.get('svix-id');
  const webhookTimestamp = req.get('webhook-timestamp') || req.get('svix-timestamp');
  const webhookSignature = req.get('webhook-signature') || req.get('svix-signature');

  if (stripeSignature) {
    const parsed = parseStripeSignature(stripeSignature);
    return Boolean(
      parsed.t
        && parsed.v1
        && webhookSecretCandidates(secret).some((candidate) => timingSafeEqualString(parsed.v1, hmacHex(candidate, `${parsed.t}.${body}`)))
    );
  }

  if (cloakdSignature) {
    const payload = cloakdTimestamp ? `${cloakdTimestamp}.${body}` : body;
    return webhookSecretCandidates(secret).some((candidate) => timingSafeEqualString(cloakdSignature, hmacHex(candidate, payload)));
  }

  if (webhookId && webhookTimestamp && webhookSignature) {
    const signedContent = `${webhookId}.${webhookTimestamp}.${body}`;
    const candidates = webhookSecretCandidates(secret);

    return webhookSignature
      .split(' ')
      .flatMap((signature) => signature.split(','))
      .some((signature) => {
        const value = signature.replace(/^v\d+,/, '').replace(/^v\d+=/, '');
        return candidates.some((candidate) => (
          timingSafeEqualString(value, hmacBase64(candidate, signedContent))
          || timingSafeEqualString(value, hmacHex(candidate, signedContent))
        ));
      });
  }

  return false;
}

function findFirstValue(source, keys) {
  if (!source || typeof source !== 'object') {
    return undefined;
  }

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }

  return undefined;
}

function extractCloakdEvent(payload) {
  const data = payload.data || payload.object || payload.payment || payload.paymentLink || payload;
  const metadata = data.metadata || payload.metadata || {};
  const reference = String(findFirstValue(data, [
    'id',
    'reference',
    'paymentId',
    'payment_id',
    'paymentLinkId',
    'payment_link_id',
    'token_id',
    'order_id',
    'orderId',
    'checkoutId',
    'checkout_id'
  ]) || findFirstValue(payload, ['id', 'reference']) || '');
  const amount = findFirstValue(data, ['amountCents', 'amount_cents'])
    || (Number(findFirstValue(data, ['pay_amount', 'amount', 'total'])) * 100);
  const status = String(
    findFirstValue(data, ['status', 'paymentStatus', 'payment_status'])
      || findFirstValue(payload, ['status', 'type', 'event'])
      || ''
  ).toLowerCase();

  return {
    reference,
    status,
    amountCents: Number.isFinite(Number(amount)) ? Math.round(Number(amount)) : null,
    currency: String(findFirstValue(data, ['currency', 'pay_currency']) || metadata.currency || defaultCurrency).toUpperCase(),
    userId: Number(metadata.userId || metadata.user_id || data.userId || data.user_id || 0) || null
  };
}

function isPaidCloakdStatus(status) {
  return ['paid', 'succeeded', 'success', 'confirmed', 'complete', 'completed', 'settled', 'payment.succeeded', 'payment.paid', 'payment.settled'].includes(status);
}

function isFailedCloakdStatus(status) {
  return ['failed', 'cancelled', 'canceled', 'expired', 'payment.failed', 'payment.cancelled'].includes(status);
}

async function applyConfirmedDeposit({ reference, amountCents, currency, userId }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT id, user_id, amount_cents, currency, status FROM deposits WHERE provider = ? AND provider_reference = ? LIMIT 1 FOR UPDATE',
      ['cloakd', reference]
    );
    let deposit = rows[0];

    if (!deposit) {
      if (!userId || !amountCents) {
        throw new Error('Webhook did not match an existing deposit and lacked user metadata.');
      }

      const [result] = await connection.execute(
        `
          INSERT INTO deposits (user_id, amount_cents, currency, provider, provider_reference, status)
          VALUES (?, ?, ?, 'cloakd', ?, 'pending')
        `,
        [userId, amountCents, currency, reference]
      );
      deposit = {
        id: result.insertId,
        user_id: userId,
        amount_cents: amountCents,
        currency,
        status: 'pending'
      };
    }

    if (deposit.status !== 'confirmed') {
      await connection.execute(
        'UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?',
        [deposit.amount_cents, deposit.user_id]
      );
      await connection.execute('UPDATE deposits SET status = ? WHERE id = ?', ['confirmed', deposit.id]);
    }

    await connection.commit();
    return { credited: deposit.status !== 'confirmed', depositId: deposit.id };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function ensureAdminUser() {
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || 'admin@casusdt.com');
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await pool.execute(
    `
      INSERT INTO users (email, password_hash, is_admin, full_name, status)
      VALUES (?, ?, TRUE, 'Site Administrator', 'active')
      ON DUPLICATE KEY UPDATE
        is_admin = TRUE,
        status = 'active'
    `,
    [adminEmail, passwordHash]
  );
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/register', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const validationError = validateCredentials(email, password);

  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const [result] = await pool.execute(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, passwordHash]
    );
    const user = { id: result.insertId, email, balance_cents: 0, is_admin: false, status: 'active' };

    res.status(201).json({
      token: signToken(user),
      user: publicUser(user)
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    console.error(error);
    res.status(500).json({ message: 'Could not create account.' });
  }
});

app.post('/api/login', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const [rows] = await pool.execute(
    'SELECT id, email, password_hash, balance_cents, is_admin, full_name, status, created_at FROM users WHERE email = ? LIMIT 1',
    [email]
  );

  const user = rows[0];
  const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!passwordMatches) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ message: 'Account is not active.' });
  }

  res.json({
    token: signToken(user),
    user: publicUser(user)
  });
});

app.get('/api/me', requireUser, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/api/admin/users', requireUser, requireAdmin, async (_req, res) => {
  const [rows] = await pool.execute(
    `
      SELECT id, email, balance_cents, is_admin, full_name, status, created_at
      FROM users
      ORDER BY id DESC
      LIMIT 200
    `
  );

  res.json({ users: rows.map(publicUser) });
});

app.patch('/api/admin/users/:id', requireUser, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const email = req.body.email === undefined ? undefined : normalizeEmail(req.body.email);
  const fullName = req.body.fullName === undefined ? undefined : String(req.body.fullName || '').trim();
  const status = req.body.status === undefined ? undefined : String(req.body.status || '').trim();
  const isAdmin = req.body.isAdmin === undefined ? undefined : Boolean(req.body.isAdmin);
  const balance = req.body.balance === undefined ? undefined : Number(req.body.balance);
  const password = req.body.password === undefined ? undefined : String(req.body.password || '');

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ message: 'Invalid user id.' });
  }

  if (email !== undefined && !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }

  if (status !== undefined && !['active', 'suspended'].includes(status)) {
    return res.status(400).json({ message: 'Status must be active or suspended.' });
  }

  if (balance !== undefined && (!Number.isFinite(balance) || balance < 0 || balance > 100000000)) {
    return res.status(400).json({ message: 'Balance must be from 0 to 100,000,000.' });
  }

  if (password && password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  const fields = [];
  const values = [];

  if (email !== undefined) {
    fields.push('email = ?');
    values.push(email);
  }
  if (fullName !== undefined) {
    fields.push('full_name = ?');
    values.push(fullName || null);
  }
  if (status !== undefined) {
    fields.push('status = ?');
    values.push(status);
  }
  if (isAdmin !== undefined) {
    fields.push('is_admin = ?');
    values.push(isAdmin ? 1 : 0);
  }
  if (balance !== undefined) {
    fields.push('balance_cents = ?');
    values.push(Math.round(balance * 100));
  }
  if (password) {
    fields.push('password_hash = ?');
    values.push(await bcrypt.hash(password, 12));
  }

  if (fields.length === 0) {
    return res.status(400).json({ message: 'No changes provided.' });
  }

  values.push(userId);

  try {
    const [result] = await pool.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const [rows] = await pool.execute(
      'SELECT id, email, balance_cents, is_admin, full_name, status, created_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    res.json({ user: publicUser(rows[0]) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    console.error(error);
    res.status(500).json({ message: 'Could not update user.' });
  }
});

app.post('/api/admin/vendor-game/session', requireUser, requireAdmin, (req, res) => {
  const token = signVendorGameToken(req.user);

  res.cookie('vendorGameTicket', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/api/admin/vendor-game',
    maxAge: 30 * 60 * 1000
  });
  res.json({
    title: 'Dragon Pots Megaways demo',
    symbol: 'vswaysdragden',
    url: `/api/admin/vendor-game/gs2c/html5Game.do?v=${vendorGameAssetVersion}`
  });
});

app.post('/api/aviator/rounds', requireUser, requireAdmin, async (req, res) => {
  const betCents = parseGameBet(req.body.bet);
  const clientSeed = String(req.body.clientSeed || `user-${req.user.id}`).slice(0, 120);

  if (!betCents) {
    return res.status(400).json({ message: 'Enter a Crash bet from $1 to $10,000.' });
  }

  const existingRound = [...aviatorRounds.values()].find((round) => round.userId === req.user.id);

  if (existingRound && aviatorCurrentMultiplier(existingRound) < existingRound.crashMultiplier) {
    return res.status(409).json({ message: 'Wait for the current Crash round to finish.' });
  }

  if (existingRound) {
    aviatorRounds.delete(existingRound.id);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [users] = await connection.execute(
      'SELECT id, email, balance_cents, is_admin, full_name, status, created_at FROM users WHERE id = ? LIMIT 1 FOR UPDATE',
      [req.user.id]
    );
    const user = users[0];

    if (!user || user.status !== 'active') {
      await connection.rollback();
      return res.status(403).json({ message: 'Account is not active.' });
    }

    if (Number(user.balance_cents) < betCents) {
      await connection.rollback();
      return res.status(400).json({ message: 'Insufficient balance for this Crash bet.' });
    }

    await connection.execute(
      'UPDATE users SET balance_cents = balance_cents - ? WHERE id = ?',
      [betCents, req.user.id]
    );

    const [updatedUsers] = await connection.execute(
      'SELECT id, email, balance_cents, is_admin, full_name, status, created_at FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    await connection.commit();

    const serverSeed = crypto.randomBytes(32).toString('hex');
    const round = {
      id: crypto.randomUUID(),
      userId: req.user.id,
      betCents,
      clientSeed,
      serverSeed,
      serverSeedHash: crypto.createHash('sha256').update(serverSeed).digest('hex'),
      crashMultiplier: aviatorCrashMultiplier(serverSeed, clientSeed),
      startedAt: Date.now()
    };

    aviatorRounds.set(round.id, round);

    res.status(201).json({
      round: publicAviatorRound(round),
      user: publicUser(updatedUsers[0])
    });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: 'Could not start Crash round.' });
  } finally {
    connection.release();
  }
});

app.get('/api/aviator/rounds/:id', requireUser, requireAdmin, (req, res) => {
  const round = aviatorRounds.get(req.params.id);

  if (!round || round.userId !== req.user.id) {
    return res.status(404).json({ message: 'Crash round not found.' });
  }

  const publicRound = publicAviatorRound(round);

  if (publicRound.crashed) {
    aviatorRounds.delete(round.id);
  }

  res.json({ round: publicRound });
});

app.post('/api/aviator/rounds/:id/cashout', requireUser, requireAdmin, async (req, res) => {
  const round = aviatorRounds.get(req.params.id);

  if (!round || round.userId !== req.user.id) {
    return res.status(404).json({ message: 'Crash round not found.' });
  }

  const multiplier = aviatorCurrentMultiplier(round);

  if (multiplier >= round.crashMultiplier) {
    aviatorRounds.delete(round.id);
    return res.status(409).json({
      message: `Crashed at ${round.crashMultiplier.toFixed(2)}x.`,
      result: {
        crashed: true,
        multiplier: round.crashMultiplier,
        betCents: round.betCents,
        winCents: 0,
        netCents: -round.betCents,
        serverSeed: round.serverSeed,
        serverSeedHash: round.serverSeedHash
      }
    });
  }

  aviatorRounds.delete(round.id);
  const winCents = Math.floor(round.betCents * multiplier);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      'UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?',
      [winCents, req.user.id]
    );
    const [users] = await connection.execute(
      'SELECT id, email, balance_cents, is_admin, full_name, status, created_at FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    await connection.commit();

    res.json({
      result: {
        crashed: false,
        multiplier,
        betCents: round.betCents,
        winCents,
        netCents: winCents - round.betCents,
        serverSeed: round.serverSeed,
        serverSeedHash: round.serverSeedHash
      },
      user: publicUser(users[0])
    });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: 'Could not settle Crash round.' });
  } finally {
    connection.release();
  }
});

app.use('/api/admin/vendor-game', requireVendorGameAccess, (req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self' data: blob:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'self'"
  ].join('; '));
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

app.all('/api/admin/vendor-game/gs2c/ge/v5/gameService', async (req, res) => {
  if (!vendorGameInitResponse) {
    return res.status(503).send('Vendor game payload is not installed.');
  }

  const action = String(req.body.action || req.query.action || 'doInit');
  const coin = Number(req.body.c || req.query.c || vendorGameInitParams.get('c') || '0.10');
  const lines = Number(req.body.l || req.query.l || vendorGameInitParams.get('l') || '20');
  const betCents = Math.max(0, Math.round(coin * lines * 100));

  try {
    if (action === 'doSpin' && betCents > 0) {
      await pool.execute(
        'UPDATE users SET balance_cents = GREATEST(balance_cents - ?, 0) WHERE id = ?',
        [betCents, req.vendorGameUser.id]
      );
    }

    const [rows] = await pool.execute(
      'SELECT balance_cents FROM users WHERE id = ? LIMIT 1',
      [req.vendorGameUser.id]
    );
    const balance = formatGameBalance(rows[0]?.balance_cents || 0);
    const now = Date.now();
    const base = {
      action,
      balance,
      balance_cash: balance,
      balance_bonus: '0.00',
      c: coin.toFixed(2),
      l: Number.isFinite(lines) ? lines : 20,
      stime: now,
      index: Math.floor(now / 1000),
      counter: Math.floor(now / 500),
      na: 's',
      tw: '0.00',
      w: '0.00',
      rs_p: '0',
      s: vendorGameInitParams.get('s') || vendorGameInitParams.get('def_s') || '',
      sa: vendorGameInitParams.get('def_sa') || vendorGameInitParams.get('sa') || '',
      sb: vendorGameInitParams.get('def_sb') || vendorGameInitParams.get('sb') || ''
    };

    res.type('text/plain').send(vendorGameResponse(action === 'doSpin'
      ? { ...base, ...vendorGameSpinParams() }
      : base));
  } catch (error) {
    console.error(error);
    res.status(500).send('Could not simulate vendor game response.');
  }
});

app.get('/api/admin/vendor-game/gs2c/html5Game.do', (req, res) => {
  res.type('html').sendFile(path.join(vendorGameRoot, 'gs2c/html5Game.do'));
});

app.all('/api/admin/vendor-game/gs2c/stats.do', (_req, res) => {
  res.json({ error: 0, description: 'OK' });
});

app.all('/api/admin/vendor-game/gs2c/saveSettings.do', (_req, res) => {
  res.json({
    MinimizedNotificationTypes: '',
    HideMetaNotifications: 'false'
  });
});

app.all('/api/admin/vendor-game/gs2c/reloadBalance.do', async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT balance_cents FROM users WHERE id = ? LIMIT 1',
    [req.vendorGameUser.id]
  );
  const balance = formatGameBalance(rows[0]?.balance_cents || 0);

  res.type('text/plain').send(`balance=${balance}&balance_cash=${balance}&balance_bonus=0.00&stime=${Date.now()}`);
});

app.all('/api/admin/vendor-game/gs2c/jackpot/reload.do', (_req, res) => {
  res.json({ error: 0, jackpots: [] });
});

app.all('/api/admin/vendor-game/gs2c/closeGame.do', (_req, res) => {
  res.type('text/plain').send('OK');
});

app.all('/api/admin/vendor-game/gs2c/logout.do', (_req, res) => {
  res.type('text/plain').send('OK');
});

app.get(/^\/api\/admin\/vendor-game\/(.*\.(?:ogg|mp3)\.json)$/, (req, res, next) => {
  const vendorAssetPath = path.resolve(vendorGameRoot, req.params[0] || '');

  if (!vendorAssetPath.startsWith(`${vendorGameRoot}${path.sep}`)) {
    return res.status(400).send('Invalid vendor game asset path.');
  }

  if (!fs.existsSync(vendorAssetPath)) {
    return res.type('application/json').send('{"sounds":[]}');
  }

  res.sendFile(vendorAssetPath, (error) => {
    if (error) {
      next(error);
    }
  });
});

app.get('/api/admin/vendor-game/gs2c/common/v2/games-html5/games/vs/vswaysdragden/:build/packages/:packageFile', (req, res, next) => {
  const packageFile = req.params.packageFile || '';
  const fallbackFile = packageFile.endsWith('_mobile.json')
    ? packageFile.replace(/_mobile\.json$/, '_desktop.json')
    : packageFile;
  const desktopAssetPath = path.resolve(vendorGameDesktopRoot, 'packages', fallbackFile);

  if (!desktopAssetPath.startsWith(`${vendorGameDesktopRoot}${path.sep}packages${path.sep}`)) {
    return res.status(400).send('Invalid vendor game package path.');
  }

  res.sendFile(desktopAssetPath, (error) => {
    if (error) {
      next(error);
    }
  });
});

app.get('/api/admin/vendor-game/gs2c/common/v2/games-html5/games/vs/vswaysdragden/mobile/*', (req, res, next) => {
  const requestedAsset = req.params[0] || '';
  const desktopAssetPath = path.resolve(vendorGameDesktopRoot, requestedAsset);

  if (!desktopAssetPath.startsWith(`${vendorGameDesktopRoot}${path.sep}`)) {
    return res.status(400).send('Invalid vendor game asset path.');
  }

  res.sendFile(desktopAssetPath, (error) => {
    if (error) {
      next(error);
    }
  });
});

app.use('/api/admin/vendor-game', express.static(vendorGameRoot, {
  etag: false,
  fallthrough: false,
  lastModified: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.removeHeader('Pragma');
    res.removeHeader('Expires');
    res.removeHeader('Surrogate-Control');
  }
}));

app.get('/api/deposits', requireUser, async (req, res) => {
  const [rows] = await pool.execute(
    `
      SELECT id, amount_cents AS amountCents, currency, provider, provider_reference AS providerReference,
             checkout_url AS checkoutUrl, status, created_at AS createdAt
      FROM deposits
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 10
    `,
    [req.user.id]
  );

  res.json({ deposits: rows });
});

app.post('/api/deposits', requireUser, async (req, res) => {
  const amountCents = parseDepositAmount(req.body.amount);
  const currency = String(req.body.currency || defaultCurrency).toUpperCase();

  if (!amountCents) {
    return res.status(400).json({ message: 'Enter a deposit amount from 1 to 10,000.' });
  }

  try {
    const session = await createCloakdSession({
      amountCents,
      currency,
      email: req.user.email,
      userId: req.user.id
    });

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [depositResult] = await connection.execute(
        `
          INSERT INTO deposits (user_id, amount_cents, currency, provider, provider_reference, checkout_url, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [req.user.id, amountCents, currency, session.provider, session.reference, session.checkoutUrl, session.status]
      );

      if (session.status === 'confirmed') {
        await connection.execute(
          'UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?',
          [amountCents, req.user.id]
        );
      }

      const [users] = await connection.execute(
        'SELECT id, email, balance_cents, is_admin, full_name, status, created_at FROM users WHERE id = ? LIMIT 1',
        [req.user.id]
      );
      await connection.commit();

      res.status(201).json({
        deposit: {
          id: depositResult.insertId,
          amountCents,
          currency,
          provider: session.provider,
          providerReference: session.reference,
          checkoutUrl: session.checkoutUrl,
          status: session.status
        },
        user: publicUser(users[0])
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error(error);
    res.status(502).json({ message: error.message || 'Deposit provider is unavailable.' });
  }
});

app.get('/api/withdrawals', requireUser, async (req, res) => {
  const [rows] = await pool.execute(
    `
      SELECT id, amount_cents AS amountCents, currency, wallet_address AS walletAddress,
             status, created_at AS createdAt
      FROM withdrawals
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 10
    `,
    [req.user.id]
  );

  res.json({ withdrawals: rows });
});

app.post('/api/withdrawals', requireUser, async (req, res) => {
  const amountCents = parseDepositAmount(req.body.amount);
  const currency = String(req.body.currency || defaultCurrency).toUpperCase();
  const walletAddress = parseWalletAddress(req.body.walletAddress);

  if (!amountCents) {
    return res.status(400).json({ message: 'Enter a withdrawal amount from 1 to 10,000.' });
  }

  if (!walletAddress) {
    return res.status(400).json({ message: 'Enter a valid wallet address.' });
  }

  const [[account]] = await pool.execute(
    'SELECT balance_cents FROM users WHERE id = ? LIMIT 1',
    [req.user.id]
  );

  if (!account || Number(account.balance_cents) < amountCents) {
    return res.status(400).json({ message: 'Withdrawal amount exceeds available balance.' });
  }

  const [result] = await pool.execute(
    `
      INSERT INTO withdrawals (user_id, amount_cents, currency, wallet_address, status)
      VALUES (?, ?, ?, ?, ?)
    `,
    [req.user.id, amountCents, currency, walletAddress, 'pending']
  );

  res.status(201).json({
    withdrawal: {
      id: result.insertId,
      amountCents,
      currency,
      walletAddress,
      status: 'pending'
    }
  });
});

app.post('/api/webhooks/cloakd', async (req, res) => {
  if (!verifyCloakdWebhook(req)) {
    return res.status(400).json({ message: 'Invalid webhook signature.' });
  }

  const event = extractCloakdEvent(req.body || {});

  if (!event.reference) {
    return res.status(400).json({ message: 'Webhook is missing payment reference.' });
  }

  try {
    if (isPaidCloakdStatus(event.status)) {
      const result = await applyConfirmedDeposit(event);
      return res.json({ received: true, credited: result.credited, depositId: result.depositId });
    }

    if (isFailedCloakdStatus(event.status)) {
      await pool.execute(
        'UPDATE deposits SET status = ? WHERE provider = ? AND provider_reference = ? AND status <> ?',
        [event.status, 'cloakd', event.reference, 'confirmed']
      );
    }

    res.json({ received: true, credited: false });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not process Cloakd webhook.' });
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: 'Unexpected server error.' });
});

await initializeDatabase();
await ensureAdminUser();

app.listen(port, () => {
  console.log(`Auth API listening on port ${port}`);
});
