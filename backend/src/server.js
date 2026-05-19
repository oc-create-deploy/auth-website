import 'dotenv/config';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { initializeDatabase, pool } from './db.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || 'local-dev-secret-change-me';
const defaultCurrency = 'USD';

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

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

  if (!baseUrl || !apiKey) {
    return {
      provider: 'cloakd-demo',
      reference: `demo-${Date.now()}-${userId}`,
      checkoutUrl: null,
      status: 'confirmed'
    };
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/payment-links`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: amountCents / 100,
      amountCents,
      currency,
      customerEmail: email,
      metadata: { userId }
    })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Cloakd deposit session could not be created.');
  }

  return {
    provider: 'cloakd',
    reference: String(data.id || data.reference || data.paymentId || ''),
    checkoutUrl: data.checkoutUrl || data.checkout_url || data.paymentUrl || data.url || null,
    status: 'pending'
  };
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
        password_hash = VALUES(password_hash),
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
        'SELECT id, email, balance_cents FROM users WHERE id = ? LIMIT 1',
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

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: 'Unexpected server error.' });
});

await initializeDatabase();
await ensureAdminUser();

app.listen(port, () => {
  console.log(`Auth API listening on port ${port}`);
});
