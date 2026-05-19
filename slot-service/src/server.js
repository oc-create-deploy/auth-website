import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';

const app = express();
const port = Number(process.env.PORT || 3100);
const jwtSecret = process.env.JWT_SECRET || 'local-dev-secret-change-me';
const slotopolUrl = process.env.SLOTOPOL_URL || 'http://slotopol:8080';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'auth_user',
  password: process.env.DB_PASSWORD || 'auth-password-change-me',
  database: process.env.DB_NAME || 'auth_app',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const symbols = [
  { id: 'crown', label: 'Crown', weight: 4, icon: '♛' },
  { id: 'diamond', label: 'Diamond', weight: 5, icon: '♦' },
  { id: 'seven', label: 'Seven', weight: 6, icon: '7' },
  { id: 'bar', label: 'Bar', weight: 9, icon: 'BAR' },
  { id: 'bell', label: 'Bell', weight: 12, icon: '●' },
  { id: 'coin', label: 'Coin', weight: 16, icon: '$' },
  { id: 'cherry', label: 'Cherry', weight: 20, icon: '●' },
  { id: 'lemon', label: 'Lemon', weight: 28, icon: '◆' }
];

const payoutTable = {
  crown: 25,
  diamond: 15,
  seven: 10,
  bar: 6,
  bell: 4,
  coin: 3,
  cherry: 2,
  lemon: 1
};

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    balanceCents: Number(user.balance_cents || 0)
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
      'SELECT id, email, balance_cents FROM users WHERE id = ? LIMIT 1',
      [payload.sub]
    );

    if (!rows[0]) {
      return res.status(401).json({ message: 'User no longer exists.' });
    }

    req.user = rows[0];
    next();
  } catch (_error) {
    res.status(401).json({ message: 'Invalid or expired session.' });
  }
}

function parseBet(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 1 || amount > 1000) {
    return null;
  }

  return Math.round(amount * 100);
}

function randomSymbol() {
  const total = symbols.reduce((sum, symbol) => sum + symbol.weight, 0);
  let roll = Math.random() * total;

  for (const symbol of symbols) {
    roll -= symbol.weight;
    if (roll <= 0) {
      return symbol;
    }
  }

  return symbols[symbols.length - 1];
}

function buildSpin() {
  const reels = Array.from({ length: 3 }, () => Array.from({ length: 3 }, randomSymbol));
  const lines = [
    [reels[0][0], reels[1][0], reels[2][0]],
    [reels[0][1], reels[1][1], reels[2][1]],
    [reels[0][2], reels[1][2], reels[2][2]],
    [reels[0][0], reels[1][1], reels[2][2]],
    [reels[0][2], reels[1][1], reels[2][0]]
  ];

  return { reels, lines };
}

function calculateWin(spin, betCents) {
  const lineBet = Math.max(1, Math.floor(betCents / spin.lines.length));
  const winningLines = [];
  let winCents = 0;

  spin.lines.forEach((line, index) => {
    const [first, second, third] = line;

    if (first.id === second.id && second.id === third.id) {
      const multiplier = payoutTable[first.id] || 0;
      const amountCents = lineBet * multiplier;
      winCents += amountCents;
      winningLines.push({ index, symbol: first.id, multiplier, amountCents });
      return;
    }

    if (first.id === second.id || second.id === third.id) {
      const symbol = first.id === second.id ? first : second;
      const amountCents = Math.floor(lineBet * 0.4);
      winCents += amountCents;
      winningLines.push({ index, symbol: symbol.id, multiplier: 0.4, amountCents });
    }
  });

  return { winCents, winningLines };
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slot_spins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      game_code VARCHAR(80) NOT NULL,
      bet_cents INT NOT NULL,
      win_cents INT NOT NULL,
      balance_after_cents INT NOT NULL,
      reels_json JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

async function getSlotopolStatus() {
  try {
    const response = await fetch(`${slotopolUrl.replace(/\/$/, '')}/ping`, { signal: AbortSignal.timeout(1200) });
    return response.ok ? 'online' : 'unavailable';
  } catch (_error) {
    return 'unavailable';
  }
}

app.get('/health', async (_req, res) => {
  res.json({ ok: true, slotopol: await getSlotopolStatus() });
});

app.get('/api/slots/session', requireUser, async (req, res) => {
  res.json({
    game: {
      code: 'ctinteractive/luckydollar',
      title: 'Lucky Dollar',
      lines: 5,
      minBet: 1,
      maxBet: 1000,
      slotopolStatus: await getSlotopolStatus()
    },
    user: publicUser(req.user)
  });
});

app.get('/api/slots/history', requireUser, async (req, res) => {
  const [rows] = await pool.execute(
    `
      SELECT id, game_code AS gameCode, bet_cents AS betCents, win_cents AS winCents,
             balance_after_cents AS balanceAfterCents, created_at AS createdAt
      FROM slot_spins
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 10
    `,
    [req.user.id]
  );

  res.json({ spins: rows });
});

app.post('/api/slots/spin', requireUser, async (req, res) => {
  const betCents = parseBet(req.body.bet);

  if (!betCents) {
    return res.status(400).json({ message: 'Enter a stake from 1 to 1,000.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [users] = await connection.execute(
      'SELECT id, email, balance_cents FROM users WHERE id = ? FOR UPDATE',
      [req.user.id]
    );
    const user = users[0];

    if (!user) {
      await connection.rollback();
      return res.status(401).json({ message: 'User no longer exists.' });
    }

    if (Number(user.balance_cents) < betCents) {
      await connection.rollback();
      return res.status(400).json({ message: 'Insufficient balance for this spin.' });
    }

    const spin = buildSpin();
    const outcome = calculateWin(spin, betCents);
    const balanceAfter = Number(user.balance_cents) - betCents + outcome.winCents;

    await connection.execute('UPDATE users SET balance_cents = ? WHERE id = ?', [balanceAfter, user.id]);
    await connection.execute(
      `
        INSERT INTO slot_spins (user_id, game_code, bet_cents, win_cents, balance_after_cents, reels_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        user.id,
        'ctinteractive/luckydollar',
        betCents,
        outcome.winCents,
        balanceAfter,
        JSON.stringify(spin.reels.map((reel) => reel.map((symbol) => symbol.id)))
      ]
    );

    await connection.commit();

    res.json({
      result: {
        gameCode: 'ctinteractive/luckydollar',
        betCents,
        winCents: outcome.winCents,
        netCents: outcome.winCents - betCents,
        reels: spin.reels.map((reel) => reel.map(({ id, label, icon }) => ({ id, label, icon }))),
        winningLines: outcome.winningLines,
        slotopolStatus: await getSlotopolStatus()
      },
      user: publicUser({ ...user, balance_cents: balanceAfter })
    });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: 'Spin could not be settled.' });
  } finally {
    connection.release();
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: 'Unexpected slot server error.' });
});

await initializeDatabase();

app.listen(port, () => {
  console.log(`Slot service listening on port ${port}`);
});
