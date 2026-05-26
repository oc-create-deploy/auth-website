import 'dotenv/config';
import cors from 'cors';
import crypto from 'crypto';
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
let slotopolGameCatalogCache = null;
let slotopolGameCatalogCacheAt = 0;
const corsOrigins = [
  ...String(process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  'http://127.0.0.1:5173'
];

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

const openSourceSlotSymbols = [
  { id: 'gold', label: 'Gold', weight: 4, icon: 'GOLD' },
  { id: 'gem', label: 'Gem', weight: 5, icon: 'GEM' },
  { id: 'seven', label: 'Seven', weight: 6, icon: '7' },
  { id: 'bar', label: 'Bar', weight: 9, icon: 'BAR' },
  { id: 'bolt', label: 'Bolt', weight: 12, icon: 'BOLT' },
  { id: 'coin', label: 'Coin', weight: 16, icon: 'COIN' },
  { id: 'cherry', label: 'Cherry', weight: 20, icon: 'CHRY' },
  { id: 'lemon', label: 'Lemon', weight: 28, icon: 'LEMN' }
];

const openSourceSlotPayouts = {
  gold: { 5: 100, 4: 20, 3: 5 },
  gem: { 5: 60, 4: 15, 3: 4 },
  seven: { 5: 40, 4: 10, 3: 3 },
  bar: { 5: 25, 4: 6, 3: 2 },
  bolt: { 5: 16, 4: 4, 3: 1.5 },
  coin: { 5: 10, 4: 3, 3: 1 },
  cherry: { 5: 8, 4: 2, 3: 0.8 },
  lemon: { 5: 5, 4: 1.5, 3: 0.5 }
};

const openSourcePaylines = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1]
];

const plinkoRowOptions = [8, 9, 10, 11, 12, 13, 14, 15, 16];
const plinkoRiskLevels = ['low', 'medium', 'high'];
const plinkoPayouts = {
  8: {
    low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29]
  },
  9: {
    low: [5.6, 2, 1.6, 1, 0.7, 0.7, 1, 1.6, 2, 5.6],
    medium: [18, 4, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4, 18],
    high: [43, 7, 2, 0.6, 0.2, 0.2, 0.6, 2, 7, 43]
  },
  10: {
    low: [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
    medium: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
    high: [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76]
  },
  11: {
    low: [8.4, 3, 1.9, 1.3, 1, 0.7, 0.7, 1, 1.3, 1.9, 3, 8.4],
    medium: [24, 6, 3, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3, 6, 24],
    high: [120, 14, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14, 120]
  },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170]
  },
  13: {
    low: [8.1, 4, 3, 1.9, 1.2, 0.9, 0.7, 0.7, 0.9, 1.2, 1.9, 3, 4, 8.1],
    medium: [43, 13, 6, 3, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3, 6, 13, 43],
    high: [260, 37, 11, 4, 1, 0.2, 0.2, 0.2, 0.2, 1, 4, 11, 37, 260]
  },
  14: {
    low: [7.1, 4, 1.9, 1.4, 1.3, 1.1, 1, 0.5, 1, 1.1, 1.3, 1.4, 1.9, 4, 7.1],
    medium: [58, 15, 7, 4, 1.9, 1, 0.5, 0.2, 0.5, 1, 1.9, 4, 7, 15, 58],
    high: [420, 56, 18, 5, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5, 18, 56, 420]
  },
  15: {
    low: [15, 8, 3, 2, 1.5, 1.1, 1, 0.7, 0.7, 1, 1.1, 1.5, 2, 3, 8, 15],
    medium: [88, 18, 11, 5, 3, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3, 5, 11, 18, 88],
    high: [620, 83, 27, 8, 3, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3, 8, 27, 83, 620]
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000]
  }
};

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

function weightedOpenSourceSymbol(randomValue) {
  const total = openSourceSlotSymbols.reduce((sum, symbol) => sum + symbol.weight, 0);
  let roll = randomValue % total;

  for (const symbol of openSourceSlotSymbols) {
    if (roll < symbol.weight) {
      return symbol;
    }
    roll -= symbol.weight;
  }

  return openSourceSlotSymbols[openSourceSlotSymbols.length - 1];
}

function buildOpenSourceSpin({ serverSeed, clientSeed, nonce }) {
  const firstDigest = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest();
  const secondDigest = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:extra`)
    .digest();
  const digest = Buffer.concat([firstDigest, secondDigest]);
  let offset = 0;

  return Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => {
    const value = digest.readUInt32BE(offset);
    offset += 4;
    return weightedOpenSourceSymbol(value);
  }));
}

function calculateOpenSourceWin(reels, betCents) {
  const lineBet = Math.max(1, Math.floor(betCents / openSourcePaylines.length));
  const winningLines = [];
  let winCents = 0;

  openSourcePaylines.forEach((pattern, index) => {
    const symbolsOnLine = pattern.map((rowIndex, reelIndex) => reels[reelIndex][rowIndex]);
    const first = symbolsOnLine[0];
    let matchCount = 1;

    for (let symbolIndex = 1; symbolIndex < symbolsOnLine.length; symbolIndex += 1) {
      if (symbolsOnLine[symbolIndex].id !== first.id) {
        break;
      }
      matchCount += 1;
    }

    if (matchCount >= 3) {
      const multiplier = openSourceSlotPayouts[first.id]?.[matchCount] || 0;
      const amountCents = Math.floor(lineBet * multiplier);
      winCents += amountCents;
      winningLines.push({
        index,
        symbol: first.id,
        matchCount,
        multiplier,
        amountCents
      });
    }
  });

  return { winCents, winningLines };
}

function parsePlinkoRows(value) {
  const rows = Number(value || 16);
  return plinkoRowOptions.includes(rows) ? rows : null;
}

function parsePlinkoRisk(value) {
  const risk = String(value || 'medium').toLowerCase();
  return plinkoRiskLevels.includes(risk) ? risk : null;
}

function buildPlinkoDrop({ serverSeed, clientSeed, nonce, rows }) {
  const digest = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:plinko`)
    .digest();
  const path = [];
  let binIndex = 0;

  for (let row = 0; row < rows; row += 1) {
    const byte = digest[row % digest.length];
    const direction = (byte >> (row % 8)) & 1;
    path.push(direction === 1 ? 'R' : 'L');
    binIndex += direction;
  }

  return { binIndex, path };
}

function calculatePlinkoWin({ betCents, rows, risk, binIndex }) {
  const multiplier = Number(plinkoPayouts[rows]?.[risk]?.[binIndex]);

  if (!Number.isFinite(multiplier)) {
    return { multiplier: 0, winCents: 0 };
  }

  return {
    multiplier,
    winCents: Math.max(0, Math.floor(betCents * multiplier))
  };
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

async function syncGameConfigs(games) {
  const uniqueGames = [];
  const seen = new Set();

  for (const game of games || []) {
    if (!game?.code || seen.has(game.code)) {
      continue;
    }

    seen.add(game.code);
    uniqueGames.push(game);
  }

  if (uniqueGames.length === 0) {
    return new Map();
  }

  const placeholders = uniqueGames.map(() => '(?, ?, 96.00, 100, 100000, TRUE)').join(', ');
  const values = uniqueGames.flatMap((game) => [game.code, game.title || game.code]);

  await pool.execute(
    `
      INSERT INTO slot_game_configs (game_code, title, rtp_percent, min_bet_cents, max_bet_cents, enabled)
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE game_code = game_code
    `,
    values
  );

  const [rows] = await pool.query(
    `
      SELECT game_code, title, rtp_percent, min_bet_cents, max_bet_cents, enabled, updated_at
      FROM slot_game_configs
      WHERE game_code IN (?)
    `,
    [uniqueGames.map((game) => game.code)]
  );

  return new Map(rows.map((row) => [row.game_code, row]));
}

async function getGameConfig(gameCode = 'ctinteractive/luckydollar', gameDefinition = null) {
  const definition = gameDefinition || await getSlotopolGameDefinition(gameCode);
  const configs = await syncGameConfigs([definition]);
  const syncedConfig = configs.get(definition.code);

  if (syncedConfig) {
    return syncedConfig;
  }

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

function parseEnabledFlag(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }

  return false;
}

function slugPart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function gameCodeForAlias(alias) {
  return `${slugPart(alias.prov)}/${slugPart(alias.name)}`;
}

function publicSlotopolGame(alias, algorithm) {
  return {
    code: gameCodeForAlias(alias),
    alias: `${alias.prov}/${alias.name}`,
    title: alias.name,
    provider: alias.prov,
    lines: Number(alias.lnum || algorithm.ln || algorithm.wn || 30),
    reels: Number(algorithm.sx || 5),
    rows: Number(algorithm.sy || 3),
    rtp: Array.isArray(algorithm.rtp) ? algorithm.rtp.map(Number) : []
  };
}

function defaultSlotopolGames() {
  return [
    {
      code: 'ctinteractive/luckydollar',
      alias: slotopolGameAlias,
      title: 'Lucky Dollar',
      provider: 'CT Interactive',
      lines: slotopolLines,
      reels: 5,
      rows: 3,
      rtp: []
    }
  ];
}

async function getSlotopolGames() {
  const now = Date.now();

  if (slotopolGameCatalogCache && now - slotopolGameCatalogCacheAt < 10 * 60 * 1000) {
    return slotopolGameCatalogCache;
  }

  try {
    const algorithms = await slotopolRequest('/game/algs', { timeoutMs: 8000 });
    const seen = new Set();
    const games = [];

    for (const algorithm of algorithms || []) {
      if (Number(algorithm.gt) !== 1 || Number(algorithm.sx) !== 5 || Number(algorithm.sy) !== 3) {
        continue;
      }

      for (const alias of algorithm.aliases || []) {
        if (!alias.prov || !alias.name) {
          continue;
        }

        const game = publicSlotopolGame(alias, algorithm);

        if (seen.has(game.code)) {
          continue;
        }

        seen.add(game.code);
        games.push(game);
      }
    }

    games.sort((left, right) => left.provider.localeCompare(right.provider) || left.title.localeCompare(right.title));
    slotopolGameCatalogCache = games.length ? games : defaultSlotopolGames();
    slotopolGameCatalogCacheAt = now;
    return slotopolGameCatalogCache;
  } catch (error) {
    console.error('Slotopol game catalog unavailable:', error.message);
    return slotopolGameCatalogCache || defaultSlotopolGames();
  }
}

async function getSlotopolGameDefinition(gameCode = 'ctinteractive/luckydollar') {
  const games = await getSlotopolGames();
  return games.find((game) => game.code === gameCode) || games.find((game) => game.code === 'ctinteractive/luckydollar') || games[0];
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

async function getSlotopolGame(userId, gameDefinition) {
  const playerToken = await getSlotopolToken('player');
  const cacheKey = `${userId}:${gameDefinition.code}`;
  const cached = slotopolGameIds.get(cacheKey);

  if (cached) {
    return { gid: cached, token: playerToken };
  }

  const data = await slotopolRequest('/game/new', {
    token: playerToken,
    body: { cid: slotopolClubId, uid: slotopolPlayerId, alias: gameDefinition.alias }
  });
  slotopolGameIds.set(cacheKey, data.gid);
  return { gid: data.gid, token: playerToken };
}

function slotopolGridToReels(grid = []) {
  return grid.map((reel) => reel.map((symbol) => ({
    id: String(symbol),
    label: `Symbol ${symbol}`,
    icon: String(symbol)
  })));
}

async function spinSlotopol({ userId, betCents, rtpPercent, gameDefinition }) {
  const totalStake = betCents / 100;
  const lineCount = Number(gameDefinition.lines || slotopolLines || 30);
  const lineBet = totalStake / lineCount;
  const cacheKey = `${userId}:${gameDefinition.code}`;
  const isFreeSpin = Number(slotopolFreeSpins.get(cacheKey) || 0) > 0;

  await syncSlotopolRtp(rtpPercent);
  await ensureSlotopolLiquidity(Math.max(1000, totalStake * 50));

  let game = await getSlotopolGame(userId, gameDefinition);
  try {
    const spin = await slotopolRequest('/slot/spin', {
      token: game.token,
      body: { gid: game.gid, bet: lineBet },
      timeoutMs: 8000
    });
    slotopolFreeSpins.set(cacheKey, Number(spin.game?.fsr || 0));
    return { ...spin, paidStakeCents: isFreeSpin ? 0 : betCents };
  } catch (error) {
    slotopolGameIds.delete(cacheKey);
    slotopolFreeSpins.delete(cacheKey);
    game = await getSlotopolGame(userId, gameDefinition);
    const spin = await slotopolRequest('/slot/spin', {
      token: game.token,
      body: { gid: game.gid, bet: lineBet },
      timeoutMs: 8000
    });
    slotopolFreeSpins.set(cacheKey, Number(spin.game?.fsr || 0));
    return { ...spin, paidStakeCents: betCents };
  }
}

app.get('/health', async (_req, res) => {
  res.json({ ok: true, slotopol: await getSlotopolStatus() });
});

app.get('/api/slots/games', requireUser, async (_req, res) => {
  const games = await getSlotopolGames();
  const configs = await syncGameConfigs(games);

  const publicGames = games.map((game) => {
      const config = configs.get(game.code);

      return {
        ...game,
        title: config?.title || game.title,
        minBet: Number(config?.min_bet_cents || 100) / 100,
        maxBet: Number(config?.max_bet_cents || 100000) / 100,
        rtpPercent: Number(config?.rtp_percent || 96),
        enabled: config ? Boolean(config.enabled) : true,
        status: !config || Boolean(config.enabled) ? 'Available' : 'Disabled'
      };
    }).filter((game) => game.enabled !== false);

  res.json({
    games: publicGames,
    slotopolStatus: await getSlotopolStatus()
  });
});

app.get('/api/slots/session', requireUser, async (req, res) => {
  const gameDefinition = await getSlotopolGameDefinition(req.query.gameCode);
  const config = await getGameConfig(gameDefinition.code, gameDefinition);

  res.json({
    game: {
      code: gameDefinition.code,
      alias: gameDefinition.alias,
      title: config.title || gameDefinition.title,
      provider: gameDefinition.provider,
      lines: gameDefinition.lines,
      reels: gameDefinition.reels,
      rows: gameDefinition.rows,
      minBet: Number(config.min_bet_cents) / 100,
      maxBet: Number(config.max_bet_cents) / 100,
      slotopolStatus: await getSlotopolStatus(),
      enabled: Boolean(config.enabled)
    },
    user: publicUser(req.user)
  });
});

app.get('/api/admin/slot-config', requireUser, requireAdmin, async (_req, res) => {
  const games = await getSlotopolGames();
  const configs = await syncGameConfigs(games);
  const gameConfigs = games.map((game) => ({
    ...game,
    config: publicGameConfig(configs.get(game.code))
  }));
  const selectedGameCode = _req.query.gameCode || gameConfigs[0]?.code || 'ctinteractive/luckydollar';
  const selected = gameConfigs.find((game) => game.code === selectedGameCode) || gameConfigs[0];

  res.json({
    config: selected?.config || publicGameConfig(await getGameConfig()),
    games: gameConfigs,
    slotopolStatus: await getSlotopolStatus()
  });
});

app.patch('/api/admin/slot-config', requireUser, requireAdmin, async (req, res) => {
  const gameDefinition = await getSlotopolGameDefinition(req.body.gameCode);
  const title = String(req.body.title || '').trim() || gameDefinition.title;
  const rtpPercent = Number(req.body.rtpPercent);
  const minBet = Number(req.body.minBet);
  const maxBet = Number(req.body.maxBet);
  const enabled = parseEnabledFlag(req.body.enabled);

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
      WHERE game_code = ?
    `,
    [title, rtpPercent, Math.round(minBet * 100), Math.round(maxBet * 100), enabled ? 1 : 0, gameDefinition.code]
  );
  await syncSlotopolRtp(rtpPercent);

  const config = await getGameConfig(gameDefinition.code, gameDefinition);
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
  const gameDefinition = await getSlotopolGameDefinition(req.body.gameCode);
  const config = await getGameConfig(gameDefinition.code, gameDefinition);

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
      rtpPercent: Number(config.rtp_percent),
      gameDefinition
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
        gameDefinition.code,
        betCents,
        outcome.winCents,
        balanceAfter,
        JSON.stringify(slotopolSpin.game?.grid || [])
      ]
    );

    await connection.commit();

    res.json({
      result: {
        gameCode: gameDefinition.code,
        gameTitle: gameDefinition.title,
        gameAlias: gameDefinition.alias,
        lines: gameDefinition.lines,
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

app.post('/api/plinko/drop', requireUser, async (req, res) => {
  const betCents = parseBet(req.body.bet);
  const rows = parsePlinkoRows(req.body.rows);
  const risk = parsePlinkoRisk(req.body.risk);
  const clientSeed = String(req.body.clientSeed || req.user.id || 'casusdt-plinko').slice(0, 80);

  if (!betCents) {
    return res.status(400).json({ message: 'Enter a stake from 1 to 1,000.' });
  }

  if (!rows) {
    return res.status(400).json({ message: 'Choose 8 to 16 rows.' });
  }

  if (!risk) {
    return res.status(400).json({ message: 'Choose low, medium, or high risk.' });
  }

  const serverSeed = crypto.randomBytes(32).toString('hex');
  const fairnessHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  const nonce = Date.now();
  const drop = buildPlinkoDrop({ serverSeed, clientSeed, nonce, rows });
  const outcome = calculatePlinkoWin({ betCents, rows, risk, binIndex: drop.binIndex });
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
      return res.status(400).json({ message: 'Insufficient balance for this drop.' });
    }

    const balanceAfter = Number(user.balance_cents) - betCents + outcome.winCents;
    const roundPayload = {
      rows,
      risk,
      binIndex: drop.binIndex,
      path: drop.path,
      multiplier: outcome.multiplier,
      fairnessHash,
      nonce,
      clientSeed
    };

    await connection.execute('UPDATE users SET balance_cents = ? WHERE id = ?', [balanceAfter, user.id]);
    const [spinResult] = await connection.execute(
      `
        INSERT INTO slot_spins (user_id, game_code, bet_cents, win_cents, balance_after_cents, reels_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        user.id,
        'plinko/plinko-game-online',
        betCents,
        outcome.winCents,
        balanceAfter,
        JSON.stringify(roundPayload)
      ]
    );

    await connection.commit();

    res.json({
      result: {
        id: spinResult.insertId,
        gameCode: 'plinko/plinko-game-online',
        gameTitle: 'Plinko',
        source: 'plinko-game-online/plinko-game-online.github.io frontend port with CasUSDT balance settlement',
        betCents,
        winCents: outcome.winCents,
        netCents: outcome.winCents - betCents,
        rows,
        risk,
        binIndex: drop.binIndex,
        path: drop.path,
        multiplier: outcome.multiplier,
        payouts: plinkoPayouts[rows][risk],
        fairnessHash,
        nonce,
        clientSeed
      },
      user: publicUser({ ...user, balance_cents: balanceAfter })
    });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: 'Plinko drop could not be settled.' });
  } finally {
    connection.release();
  }
});

app.post('/api/admin/open-source-slot/spin', requireUser, requireAdmin, async (req, res) => {
  const betCents = parseBet(req.body.bet);
  const clientSeed = String(req.body.clientSeed || req.user.id || 'casusdt-admin').slice(0, 80);

  if (!betCents) {
    return res.status(400).json({ message: 'Enter a stake from 1 to 1,000.' });
  }

  const serverSeed = crypto.randomBytes(32).toString('hex');
  const fairnessHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  const nonce = Date.now();
  const reels = buildOpenSourceSpin({ serverSeed, clientSeed, nonce });
  const outcome = calculateOpenSourceWin(reels, betCents);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [users] = await connection.execute(
      'SELECT id, email, balance_cents, is_admin, status FROM users WHERE id = ? FOR UPDATE',
      [req.user.id]
    );
    const user = users[0];

    if (!user || !user.is_admin) {
      await connection.rollback();
      return res.status(403).json({ message: 'Admin access required.' });
    }

    if (Number(user.balance_cents) < betCents) {
      await connection.rollback();
      return res.status(400).json({ message: 'Insufficient balance for this spin.' });
    }

    const balanceAfter = Number(user.balance_cents) - betCents + outcome.winCents;

    await connection.execute('UPDATE users SET balance_cents = ? WHERE id = ?', [balanceAfter, user.id]);
    const [spinResult] = await connection.execute(
      `
        INSERT INTO slot_spins (user_id, game_code, bet_cents, win_cents, balance_after_cents, reels_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        user.id,
        'opensource/html5-slot-machine',
        betCents,
        outcome.winCents,
        balanceAfter,
        JSON.stringify(reels)
      ]
    );

    await connection.commit();

    res.json({
      result: {
        id: spinResult.insertId,
        gameCode: 'opensource/html5-slot-machine',
        gameTitle: 'Mystical Forest Adventure',
        source: 'Mystical Forest Adventure assets with johakr/html5-slot-machine style admin prototype',
        betCents,
        winCents: outcome.winCents,
        netCents: outcome.winCents - betCents,
        reels,
        winningLines: outcome.winningLines,
        fairnessHash,
        nonce,
        clientSeed
      },
      user: publicUser({ ...user, balance_cents: balanceAfter })
    });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: 'Open-source slot spin could not be settled.' });
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
