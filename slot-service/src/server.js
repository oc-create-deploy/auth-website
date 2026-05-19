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
const slotopolClubId = Number(process.env.SLOTOPOL_CLUB_ID || 1);
const slotopolPlayerId = Number(process.env.SLOTOPOL_PLAYER_ID || 3);
const slotopolAdminEmail = process.env.SLOTOPOL_ADMIN_EMAIL || 'admin@example.org';
const slotopolAdminSecret = process.env.SLOTOPOL_ADMIN_SECRET || '0YBoaT';
const slotopolPlayerEmail = process.env.SLOTOPOL_PLAYER_EMAIL || 'player@example.org';
const slotopolPlayerSecret = process.env.SLOTOPOL_PLAYER_SECRET || 'iVI05M';
const slotopolGameAlias = process.env.SLOTOPOL_GAME_ALIAS || 'CT Interactive/Lucky Dollar';
const slotopolLines = Number(process.env.SLOTOPOL_LINES || 30);
const slotopolGameIds = new Map();
const slotopolFreeSpins = new Map();
let slotopolAdminToken = null;
let slotopolPlayerToken = null;
let slotopolSyncedRtp = null;

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
    balanceCents: Number(user.balance_cents || 0),
    isAdmin: Boolean(user.is_admin || user.isAdmin)
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
      'SELECT id, email, balance_cents, is_admin, status FROM users WHERE id = ? LIMIT 1',
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

function applyRtp(winCents, config) {
  const target = Number(config.rtp_percent);
  const base = 96;

  if (!Number.isFinite(target) || target <= 0) {
    return winCents;
  }

  return Math.max(0, Math.floor(winCents * (target / base)));
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS slot_game_configs (
      game_code VARCHAR(80) PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      rtp_percent DECIMAL(5,2) NOT NULL DEFAULT 96.00,
      min_bet_cents INT NOT NULL DEFAULT 100,
      max_bet_cents INT NOT NULL DEFAULT 100000,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    INSERT INTO slot_game_configs (game_code, title, rtp_percent, min_bet_cents, max_bet_cents, enabled)
    VALUES ('ctinteractive/luckydollar', 'Lucky Dollar', 96.00, 100, 100000, TRUE)
    ON DUPLICATE KEY UPDATE game_code = game_code
  `);
}

async function getGameConfig(gameCode = 'ctinteractive/luckydollar') {
  const [rows] = await pool.execute(
    `
      SELECT game_code, title, rtp_percent, min_bet_cents, max_bet_cents, enabled, updated_at
      FROM slot_game_configs
      WHERE game_code = ?
      LIMIT 1
    `,
    [gameCode]
  );

  return rows[0];
}

function publicGameConfig(config) {
  return {
    gameCode: config.game_code,
    title: config.title,
    rtpPercent: Number(config.rtp_percent),
    minBet: Number(config.min_bet_cents) / 100,
    maxBet: Number(config.max_bet_cents) / 100,
    enabled: Boolean(config.enabled),
    updatedAt: config.updated_at
  };
}

async function getSlotopolStatus() {
  try {
    const response = await fetch(`${slotopolUrl.replace(/\/$/, '')}/ping`, { signal: AbortSignal.timeout(1200) });
    return response.ok ? 'online' : 'unavailable';
  } catch (_error) {
    return 'unavailable';
  }
}

async function slotopolRequest(path, { token, body, timeoutMs = 5000 } = {}) {
  const response = await fetch(`${slotopolUrl.replace(/\/$/, '')}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data?.what || data?.message || 'Slotopol request failed.');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function getSlotopolToken(kind = 'player') {
  if (kind === 'admin' && slotopolAdminToken) {
    return slotopolAdminToken;
  }
  if (kind === 'player' && slotopolPlayerToken) {
    return slotopolPlayerToken;
  }

  const credentials = kind === 'admin'
    ? { email: slotopolAdminEmail, secret: slotopolAdminSecret }
    : { email: slotopolPlayerEmail, secret: slotopolPlayerSecret };
  const data = await slotopolRequest('/signin', { body: credentials });
  const token = data.access;

  if (kind === 'admin') {
    slotopolAdminToken = token;
  } else {
    slotopolPlayerToken = token;
  }

  return token;
}

async function syncSlotopolRtp(rtpPercent) {
  const nextRtp = Number(rtpPercent);

  if (slotopolSyncedRtp === nextRtp) {
    return;
  }

  const adminToken = await getSlotopolToken('admin');
  await slotopolRequest('/prop/rtp/set', {
    token: adminToken,
    body: { cid: slotopolClubId, uid: slotopolPlayerId, mrtp: nextRtp }
  });
  slotopolSyncedRtp = nextRtp;
}

async function ensureSlotopolLiquidity(minWallet) {
  const adminToken = await getSlotopolToken('admin');
  const props = await slotopolRequest('/prop/get', {
    token: adminToken,
    body: { cid: slotopolClubId, uid: slotopolPlayerId }
  });

  if (Number(props.wallet) < minWallet) {
    await slotopolRequest('/prop/wallet/add', {
      token: adminToken,
      body: { cid: slotopolClubId, uid: slotopolPlayerId, sum: minWallet - Number(props.wallet) + 1000 }
    });
  }

  await slotopolRequest('/club/cashin', {
    token: adminToken,
    body: { cid: slotopolClubId, banksum: 100000, fundsum: 0, locksum: 0 }
  }).catch(() => null);
}

async function getSlotopolGame(userId) {
  const playerToken = await getSlotopolToken('player');
  const cached = slotopolGameIds.get(userId);

  if (cached) {
    return { gid: cached, token: playerToken };
  }

  const data = await slotopolRequest('/game/new', {
    token: playerToken,
    body: { cid: slotopolClubId, uid: slotopolPlayerId, alias: slotopolGameAlias }
  });
  slotopolGameIds.set(userId, data.gid);
  return { gid: data.gid, token: playerToken };
}

function slotopolGridToReels(grid = []) {
  return grid.map((reel) => reel.map((symbol) => ({
    id: String(symbol),
    label: `Symbol ${symbol}`,
    icon: String(symbol)
  })));
}

async function spinSlotopol({ userId, betCents, rtpPercent }) {
  const totalStake = betCents / 100;
  const lineBet = totalStake / slotopolLines;
  const isFreeSpin = Number(slotopolFreeSpins.get(userId) || 0) > 0;

  await syncSlotopolRtp(rtpPercent);
  await ensureSlotopolLiquidity(Math.max(1000, totalStake * 50));

  let game = await getSlotopolGame(userId);
  try {
    const spin = await slotopolRequest('/slot/spin', {
      token: game.token,
      body: { gid: game.gid, bet: lineBet },
      timeoutMs: 8000
    });
    slotopolFreeSpins.set(userId, Number(spin.game?.fsr || 0));
    return { ...spin, paidStakeCents: isFreeSpin ? 0 : betCents };
  } catch (error) {
    slotopolGameIds.delete(userId);
    slotopolFreeSpins.delete(userId);
    game = await getSlotopolGame(userId);
    const spin = await slotopolRequest('/slot/spin', {
      token: game.token,
      body: { gid: game.gid, bet: lineBet },
      timeoutMs: 8000
    });
    slotopolFreeSpins.set(userId, Number(spin.game?.fsr || 0));
    return { ...spin, paidStakeCents: betCents };
  }
}

app.get('/health', async (_req, res) => {
  res.json({ ok: true, slotopol: await getSlotopolStatus() });
});

app.get('/api/slots/session', requireUser, async (req, res) => {
  const config = await getGameConfig();
  res.json({
    game: {
      code: config.game_code,
      title: config.title,
      lines: slotopolLines,
      minBet: Number(config.min_bet_cents) / 100,
      maxBet: Number(config.max_bet_cents) / 100,
      slotopolStatus: await getSlotopolStatus(),
      enabled: Boolean(config.enabled)
    },
    user: publicUser(req.user)
  });
});

app.get('/api/admin/slot-config', requireUser, requireAdmin, async (_req, res) => {
  const config = await getGameConfig();
  res.json({ config: publicGameConfig(config), slotopolStatus: await getSlotopolStatus() });
});

app.patch('/api/admin/slot-config', requireUser, requireAdmin, async (req, res) => {
  const title = String(req.body.title || '').trim() || 'Lucky Dollar';
  const rtpPercent = Number(req.body.rtpPercent);
  const minBet = Number(req.body.minBet);
  const maxBet = Number(req.body.maxBet);
  const enabled = Boolean(req.body.enabled);

  if (!Number.isFinite(rtpPercent) || rtpPercent < 50 || rtpPercent > 99.9) {
    return res.status(400).json({ message: 'RTP must be from 50 to 99.9 percent.' });
  }

  if (!Number.isFinite(minBet) || !Number.isFinite(maxBet) || minBet < 0.01 || maxBet < minBet || maxBet > 1000000) {
    return res.status(400).json({ message: 'Bet limits are invalid.' });
  }

  await pool.execute(
    `
      UPDATE slot_game_configs
      SET title = ?, rtp_percent = ?, min_bet_cents = ?, max_bet_cents = ?, enabled = ?
      WHERE game_code = 'ctinteractive/luckydollar'
    `,
    [title, rtpPercent, Math.round(minBet * 100), Math.round(maxBet * 100), enabled ? 1 : 0]
  );
  await syncSlotopolRtp(rtpPercent);

  const config = await getGameConfig();
  res.json({ config: publicGameConfig(config), slotopolStatus: await getSlotopolStatus() });
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
  const config = await getGameConfig();

  if (!betCents) {
    return res.status(400).json({ message: 'Enter a stake from 1 to 1,000.' });
  }

  if (!config.enabled) {
    return res.status(403).json({ message: 'This slot is currently disabled.' });
  }

  if (betCents < Number(config.min_bet_cents) || betCents > Number(config.max_bet_cents)) {
    return res.status(400).json({
      message: `Enter a stake from $${(Number(config.min_bet_cents) / 100).toFixed(2)} to $${(Number(config.max_bet_cents) / 100).toFixed(2)}.`
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [users] = await connection.execute(
      'SELECT id, email, balance_cents, is_admin, status FROM users WHERE id = ? FOR UPDATE',
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

    const slotopolSpin = await spinSlotopol({
      userId: user.id,
      betCents,
      rtpPercent: Number(config.rtp_percent)
    });
    const slotopolStakeCents = Number(slotopolSpin.paidStakeCents || 0);
    const winCents = Math.max(0, Math.round(Number(slotopolSpin.game?.gain || 0) * 100));
    const outcome = {
      winCents,
      winningLines: (slotopolSpin.wins || []).map((win) => ({
        index: win.li || 0,
        symbol: String(win.sym),
        multiplier: win.mp || 1,
        amountCents: Math.round(Number(win.pay || 0) * 100)
      }))
    };
    const balanceAfter = Number(user.balance_cents) - slotopolStakeCents + outcome.winCents;

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
        JSON.stringify(slotopolSpin.game?.grid || [])
      ]
    );

    await connection.commit();

    res.json({
      result: {
        gameCode: 'ctinteractive/luckydollar',
        betCents,
        winCents: outcome.winCents,
        netCents: outcome.winCents - slotopolStakeCents,
        reels: slotopolGridToReels(slotopolSpin.game?.grid || []),
        winningLines: outcome.winningLines,
        slotopolSid: slotopolSpin.sid,
        slotopolStakeCents,
        appliedRtpPercent: Number(config.rtp_percent),
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
