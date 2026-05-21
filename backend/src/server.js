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
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vendorGameRoot = path.resolve(__dirname, '../vendor-games/pragmatic-dragon');
const vendorGameDesktopRoot = path.join(
  vendorGameRoot,
  'gs2c/common/v2/games-html5/games/vs/vswaysdragden/desktop'
);
const vendorGameAssetVersion = 'casusdt-local58';
const vendorGameInitPath = path.join(vendorGameRoot, 'gs2c/ge/v5/gameService.html');
const vendorGameInitResponse = fs.existsSync(vendorGameInitPath)
  ? fs.readFileSync(vendorGameInitPath, 'utf8')
  : '';
const vendorGameInitParams = new URLSearchParams(vendorGameInitResponse);
const vendorGameSessions = new Map();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
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

function formatGameAmount(cents = 0) {
  return (Number(cents) / 100).toFixed(2);
}

function parseGameNumber(value, fallback = 0) {
  const parsed = Number(String(value || '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function encodeGameResponse(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');
}

function getVendorGameSession(userId) {
  const existing = vendorGameSessions.get(userId);

  if (existing) {
    return existing;
  }

  const session = {
    pendingWinCents: 0,
    freeSpins: null
  };
  vendorGameSessions.set(userId, session);
  return session;
}

function vendorGameBetConfig(rawCoin, rawBetLevel) {
  const coin = Number.isFinite(rawCoin) && rawCoin > 0
    ? rawCoin
    : parseGameNumber(vendorGameInitParams.get('defc'), 0.10);
  const betLevel = Number.isFinite(rawBetLevel) ? Math.max(0, Math.min(2, rawBetLevel)) : 0;
  const linesByLevel = [20, 40, 200];
  const lines = linesByLevel[betLevel] || linesByLevel[0];
  const betCents = Math.max(1, Math.round(coin * lines * 100));

  return {
    coin,
    coinText: coin.toFixed(2),
    betLevel,
    lines,
    betCents
  };
}

function vendorGamePurchaseCostCents(purchaseIndex, betCents) {
  if (purchaseIndex === 0) {
    return betCents * 100;
  }

  if (purchaseIndex === 1) {
    return betCents * 650;
  }

  return 0;
}

function randomVendorVisibleSymbols(length) {
  const symbols = '123456789a';
  let result = '';

  for (let index = 0; index < length; index += 1) {
    const roll = Math.random();

    if (roll < 0.12) {
      result += 'O';
    } else if (roll < 0.18) {
      result += 'W';
    } else {
      result += symbols[Math.floor(Math.random() * symbols.length)];
    }
  }

  return result;
}

function randomDragonPotsReels({ forceFeature = false } = {}) {
  const reelWidth = Number(vendorGameInitParams.get('sw') || 6);
  const reelHeight = Number(vendorGameInitParams.get('sh') || 7);
  const symbolCount = Math.max(1, reelWidth * reelHeight);
  let symbols = randomVendorVisibleSymbols(symbolCount).split('');

  if (forceFeature) {
    symbols[4] = 'T';
    symbols[14] = 'V';
    symbols[24] = 'U';
  }

  return symbols.join('');
}

function randomDragonPotsAccumulator(mode = 'base') {
  if (mode === 'all') {
    return '6~6;6~6;6~6';
  }

  if (mode === 'two') {
    return '6~6;6~6;0~0';
  }

  return ['0~0;0~0;0~0', '1~1;0~0;0~0', '0~0;1~1;0~0'][Math.floor(Math.random() * 3)];
}

function randomWinCents(betCents, { feature = false } = {}) {
  const roll = Math.random();

  if (!feature && roll < 0.62) {
    return 0;
  }

  const multipliers = feature
    ? [0, 0, 1, 2, 4, 7, 10, 18, 30, 45]
    : [0, 1, 2, 3, 5, 8, 12, 19];
  const multiplier = multipliers[Math.floor(Math.random() * multipliers.length)];

  return Math.round(betCents * multiplier * (feature ? 0.35 : 1));
}

function randomWinLine(winCents, bet) {
  if (winCents <= 0) {
    return undefined;
  }

  const amount = formatGameAmount(winCents);
  const symbol = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'a'][Math.floor(Math.random() * 10)];
  const ways = Math.max(1, Math.floor(winCents / Math.max(1, bet.betCents)));

  return `${symbol}~${amount}~${ways}~${3 + Math.floor(Math.random() * 4)}~0,7,14,21~l`;
}

function baseVendorSpinResponse({ action = 'doSpin', balanceCents, bet, index, counter, winCents, nextAction = 's', ntpCents }) {
  const winLine = randomWinLine(winCents, bet);
  const symbols = randomDragonPotsReels();

  return {
    action,
    tw: formatGameAmount(winCents),
    balance: formatGameBalance(balanceCents),
    balance_cash: formatGameBalance(balanceCents),
    balance_bonus: '0.00',
    index,
    counter,
    na: nextAction,
    reel_set: String(Math.floor(Math.random() * 11)),
    accm: 's1cp~s1cd;s2cp~s2cd;s3cp~s3cd',
    acci: '0;1;2',
    accv: randomDragonPotsAccumulator(),
    bl: bet.betLevel,
    stime: Date.now(),
    sa: randomVendorSymbols(6),
    sb: randomVendorSymbols(6),
    sh: '7',
    st: 'rect',
    c: bet.coinText,
    sw: '6',
    sver: '6',
    ntp: formatGameAmount(ntpCents),
    l: bet.lines,
    s: symbols,
    w: formatGameAmount(winCents),
    wlc_v: winLine
  };
}

function vendorGameFeatureStartResponse({ balanceCents, bet, index, counter, purchaseIndex, purchaseCostCents }) {
  const allModifiers = purchaseIndex === 1;
  const activeMode = allModifiers ? 'all' : 'two';

  return {
    tw: '0.00',
    fsmul: '1',
    trail: 'fst~12',
    balance: formatGameBalance(balanceCents),
    accm: 's1cp~s1cd;s2cp~s2cd;s3cp~s3cd',
    fsmax: '10',
    acci: '0;1;2',
    index,
    balance_cash: formatGameBalance(balanceCents),
    purtr: '1',
    reel_set: '4',
    balance_bonus: '0.00',
    na: 's',
    accv: randomDragonPotsAccumulator(activeMode),
    fswin: '0.00',
    puri: purchaseIndex,
    bl: bet.betLevel,
    stime: Date.now(),
    fs: '1',
    sa: 'OOOOOO',
    sb: 'OOOOOO',
    sh: '7',
    fsres: '0.00',
    st: 'rect',
    c: bet.coinText,
    sw: '6',
    sver: '6',
    counter,
    ntp: formatGameAmount(-purchaseCostCents),
    l: bet.lines,
    s: randomDragonPotsReels({ forceFeature: true }),
    w: '0.00'
  };
}

function vendorGameFreeSpinResponse({ balanceCents, bet, index, counter, freeSpins, winCents }) {
  freeSpins.totalWinCents += winCents;

  const isLastSpin = freeSpins.current >= freeSpins.max;
  const spinNumber = freeSpins.current;
  const winLine = randomWinLine(winCents, bet);
  const response = {
    tw: formatGameAmount(freeSpins.totalWinCents),
    fsmul: '1',
    trail: isLastSpin ? 'fst~12;bpp~0,0,0' : 'fst~12',
    balance: formatGameBalance(balanceCents),
    accm: 's1cp~s1cd;s2cp~s2cd;s3cp~s3cd',
    acci: '0;1;2',
    index,
    balance_cash: formatGameBalance(balanceCents),
    reel_set: String(4 + Math.floor(Math.random() * 7)),
    balance_bonus: '0.00',
    na: isLastSpin ? 'c' : 's',
    accv: randomDragonPotsAccumulator(freeSpins.mode),
    fswin: isLastSpin ? undefined : formatGameAmount(freeSpins.totalWinCents),
    fswin_total: isLastSpin ? formatGameAmount(freeSpins.totalWinCents) : undefined,
    fsmul_total: isLastSpin ? '1' : undefined,
    fs_total: isLastSpin ? String(freeSpins.max) : undefined,
    fsend_total: isLastSpin ? '1' : undefined,
    puri: freeSpins.purchaseIndex,
    bl: bet.betLevel,
    stime: Date.now(),
    fs: isLastSpin ? undefined : String(spinNumber),
    fsmax: isLastSpin ? undefined : String(freeSpins.max),
    sa: 'OOOOOO',
    sb: 'OOOOOO',
    sh: '7',
    fsres: isLastSpin ? undefined : formatGameAmount(freeSpins.totalWinCents),
    st: 'rect',
    c: bet.coinText,
    sw: '6',
    sver: '6',
    counter,
    ntp: formatGameAmount(-freeSpins.purchaseCostCents),
    l: bet.lines,
    s: randomDragonPotsReels(),
    w: formatGameAmount(winCents),
    wlc_v: winLine,
    wmt: 'pr',
    wmv: String([2, 3, 4, 5, 7, 10][Math.floor(Math.random() * 6)]),
    gwm: String([2, 3, 4, 5, 7, 10][Math.floor(Math.random() * 6)])
  };

  freeSpins.current += 1;

  if (isLastSpin) {
    return response;
  }

  return response;
}

function parseDepositAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
    return null;
  }

  return Math.round(amount * 100);
}

async function createCloakdSession({ amountCents, currency, email, userId }) {
  const baseUrl = process.env.CLOAKD_API_URL;
  const apiKey = process.env.CLOAKD_API_KEY;
  const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || '').replace(/\/$/, '');

  if (!baseUrl || !apiKey) {
    return {
      provider: 'cloakd-demo',
      reference: `demo-${Date.now()}-${userId}`,
      checkoutUrl: null,
      status: 'confirmed'
    };
  }

  const orderId = `deposit-${userId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/payment`, {
    method: 'POST',
    headers: {
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

  return {
    provider: 'cloakd',
    reference: String(data.id || data.reference || data.paymentId || data.payment_id || data.order_id || orderId),
    checkoutUrl: data.checkout_url || data.checkoutUrl || data.paymentUrl || data.url || null,
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
    const expected = hmacHex(secret, `${parsed.t}.${body}`);
    return Boolean(parsed.t && parsed.v1 && timingSafeEqualString(parsed.v1, expected));
  }

  if (cloakdSignature) {
    const payload = cloakdTimestamp ? `${cloakdTimestamp}.${body}` : body;
    const expected = hmacHex(secret, payload);
    return timingSafeEqualString(cloakdSignature, expected);
  }

  if (webhookId && webhookTimestamp && webhookSignature) {
    const signedContent = `${webhookId}.${webhookTimestamp}.${body}`;
    const candidates = [secret];

    if (secret.startsWith('whsec_')) {
      candidates.push(Buffer.from(secret.slice(6), 'base64'));
    }

    return webhookSignature
      .split(' ')
      .flatMap((signature) => signature.split(','))
      .some((signature) => {
        const value = signature.replace(/^v\d+,/, '').replace(/^v\d+=/, '');
        return candidates.some((candidate) => timingSafeEqualString(value, hmacBase64(candidate, signedContent)));
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
  const rawCoin = Number(req.body.c || req.query.c || vendorGameInitParams.get('defc') || '0.10');
  const rawBetLevel = Number(req.body.bl || req.query.bl || '0');
  const purchaseIndexValue = req.body.pur ?? req.query.pur;
  const purchaseIndex = purchaseIndexValue === undefined ? null : Number(purchaseIndexValue);
  const requestIndex = Number(req.body.index || req.query.index || 1);
  const requestCounter = Number(req.body.counter || req.query.counter || 1);
  const bet = vendorGameBetConfig(rawCoin, rawBetLevel);
  const session = getVendorGameSession(req.vendorGameUser.id);

  const readBalance = async () => {
    const [rows] = await pool.execute(
      'SELECT balance_cents FROM users WHERE id = ? LIMIT 1',
      [req.vendorGameUser.id]
    );

    return Number(rows[0]?.balance_cents || 0);
  };

  const sendNoMoney = (balanceCents) => {
    res.type('text/plain').send(encodeGameResponse({
      balance: formatGameBalance(balanceCents),
      balance_cash: formatGameBalance(balanceCents),
      balance_bonus: '0.00',
      c: bet.coinText,
      l: bet.lines,
      bl: bet.betLevel,
      na: 's',
      nomoney: '1',
      stime: Date.now(),
      index: requestIndex,
      counter: requestCounter
    }));
  };

  try {
    if (action === 'doInit') {
      session.pendingWinCents = 0;
      session.freeSpins = null;

      const balanceCents = await readBalance();
      const balance = formatGameBalance(balanceCents);

      return res.type('text/plain').send(vendorGameResponse({
        balance,
        balance_cash: balance,
        balance_bonus: '0.00',
        stime: Date.now(),
        index: requestIndex,
        counter: requestCounter,
        na: 's'
      }));
    }

    if (action === 'doCollect') {
      if (session.pendingWinCents > 0) {
        await pool.execute(
          'UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?',
          [session.pendingWinCents, req.vendorGameUser.id]
        );
        session.pendingWinCents = 0;
      }

      const balanceCents = await readBalance();

      return res.type('text/plain').send(encodeGameResponse({
        balance: formatGameBalance(balanceCents),
        balance_cash: formatGameBalance(balanceCents),
        balance_bonus: '0.00',
        index: requestIndex,
        counter: requestCounter,
        na: 's',
        stime: Date.now(),
        sver: '6'
      }));
    }

    if (action === 'doSpin') {
      if (session.freeSpins) {
        const balanceCents = await readBalance();
        const winCents = randomWinCents(bet.betCents, { feature: true });
        const response = vendorGameFreeSpinResponse({
          balanceCents,
          bet,
          index: requestIndex,
          counter: requestCounter,
          freeSpins: session.freeSpins,
          winCents
        });

        if (response.na === 'c') {
          session.pendingWinCents = session.freeSpins.totalWinCents;
          session.freeSpins = null;
        }

        return res.type('text/plain').send(encodeGameResponse(response));
      }

      if (purchaseIndex === 0 || purchaseIndex === 1) {
        const purchaseCostCents = vendorGamePurchaseCostCents(purchaseIndex, bet.betCents);
        const balanceCents = await readBalance();

        if (balanceCents < purchaseCostCents) {
          return sendNoMoney(balanceCents);
        }

        await pool.execute(
          'UPDATE users SET balance_cents = balance_cents - ? WHERE id = ?',
          [purchaseCostCents, req.vendorGameUser.id]
        );
        const updatedBalanceCents = await readBalance();
        session.pendingWinCents = 0;
        session.freeSpins = {
          current: 2,
          max: 10,
          totalWinCents: 0,
          purchaseIndex,
          purchaseCostCents,
          mode: purchaseIndex === 1 ? 'all' : 'two'
        };

        return res.type('text/plain').send(encodeGameResponse(vendorGameFeatureStartResponse({
          balanceCents: updatedBalanceCents,
          bet,
          index: requestIndex,
          counter: requestCounter,
          purchaseIndex,
          purchaseCostCents
        })));
      }

      const balanceCents = await readBalance();

      if (balanceCents < bet.betCents) {
        return sendNoMoney(balanceCents);
      }

      await pool.execute(
        'UPDATE users SET balance_cents = balance_cents - ? WHERE id = ?',
        [bet.betCents, req.vendorGameUser.id]
      );
      const updatedBalanceCents = await readBalance();
      const winCents = randomWinCents(bet.betCents);
      session.pendingWinCents = winCents;

      return res.type('text/plain').send(encodeGameResponse(baseVendorSpinResponse({
        balanceCents: updatedBalanceCents,
        bet,
        index: requestIndex,
        counter: requestCounter,
        winCents,
        nextAction: winCents > 0 ? 'c' : 's',
        ntpCents: winCents - bet.betCents
      })));
    }

    const balanceCents = await readBalance();

    res.type('text/plain').send(encodeGameResponse({
      action,
      balance: formatGameBalance(balanceCents),
      balance_cash: formatGameBalance(balanceCents),
      balance_bonus: '0.00',
      c: bet.coinText,
      l: bet.lines,
      bl: bet.betLevel,
      stime: Date.now(),
      index: requestIndex,
      counter: requestCounter,
      na: 's',
      tw: '0.00',
      w: '0.00',
      s: vendorGameInitParams.get('s') || vendorGameInitParams.get('def_s') || '',
      sa: vendorGameInitParams.get('def_sa') || vendorGameInitParams.get('sa') || '',
      sb: vendorGameInitParams.get('def_sb') || vendorGameInitParams.get('sb') || ''
    }));
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
