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
  return jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: '2h' });
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
    const user = { id: result.insertId, email };

    res.status(201).json({
      token: signToken(user),
      user
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
    'SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1',
    [email]
  );

  const user = rows[0];
  const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!passwordMatches) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  res.json({
    token: signToken(user),
    user: { id: user.id, email: user.email }
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: 'Unexpected server error.' });
});

await initializeDatabase();

app.listen(port, () => {
  console.log(`Auth API listening on port ${port}`);
});

