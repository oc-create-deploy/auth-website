import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import posthog from 'posthog-js';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles.css';

const apiUrl = import.meta.env.VITE_API_URL || '';
const posthogToken = import.meta.env.VITE_POSTHOG_TOKEN || 'phc_sq47GnfuMyvFcr97EtF6uHXzsLjzDPoeMZSrs6Bfu9bC';
const posthogHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
const aztecGoldGameCode = 'megajack/aztecgold';
const slotSymbols = ['7', 'BAR', '$', 'A', 'K', 'Q', 'J', '10', '9', '8', 'WILD', 'BONUS'];
const aztecSlotSymbols = ['MASK', 'SUN', 'TEMPLE', 'JADE', 'JAGUAR', 'EAGLE', 'A', 'K', 'Q', 'J', 'WILD', 'SCATTER'];
const defaultReels = [
  [{ icon: '7' }, { icon: 'BAR' }, { icon: '$' }],
  [{ icon: 'A' }, { icon: '7' }, { icon: 'K' }],
  [{ icon: '$' }, { icon: 'WILD' }, { icon: '7' }],
  [{ icon: 'Q' }, { icon: 'BAR' }, { icon: 'A' }],
  [{ icon: '7' }, { icon: '$' }, { icon: 'BONUS' }]
];
const spinAnimationMs = 2400;
const paylinePatterns = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 0, 2, 0, 0],
  [2, 2, 0, 2, 2],
  [0, 2, 0, 2, 0],
  [2, 0, 2, 0, 2],
  [1, 0, 2, 0, 1],
  [1, 2, 0, 2, 1],
  [0, 2, 2, 2, 0],
  [2, 0, 0, 0, 2],
  [0, 1, 2, 2, 2],
  [2, 1, 0, 0, 0],
  [0, 0, 0, 1, 2],
  [2, 2, 2, 1, 0],
  [1, 0, 1, 0, 1]
];

if (posthogToken) {
  posthog.init(posthogToken, {
    api_host: posthogHost,
    capture_pageview: false,
    autocapture: true,
    person_profiles: 'identified_only'
  });
}

function trackEvent(eventName, properties = {}) {
  if (!posthogToken) {
    return;
  }

  posthog.capture(eventName, properties);
}

function formatMoney(cents = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(Number(cents) / 100);
}

function slotSymbolIcon(symbol) {
  const raw = String(symbol?.icon || symbol?.id || '');
  const symbolMap = {
    1: '7',
    2: 'BAR',
    3: '$',
    4: 'A',
    5: 'K',
    6: 'Q',
    7: 'J',
    8: '10',
    9: '9',
    10: '8',
    11: 'WILD',
    12: 'BONUS',
    13: 'x2'
  };

  return symbolMap[raw] || raw;
}

function randomSlotSymbol(symbolPool = slotSymbols) {
  return { icon: symbolPool[Math.floor(Math.random() * symbolPool.length)] };
}

function buildAnimatedReels(symbolPool = slotSymbols) {
  return Array.from({ length: 5 }, () => Array.from({ length: 18 }, () => randomSlotSymbol(symbolPool)));
}

function buildSettlingReels(finalReels, symbolPool = slotSymbols) {
  return finalReels.map((reel) => [
    ...reel,
    ...Array.from({ length: 15 }, () => randomSlotSymbol(symbolPool))
  ]);
}

function aztecSymbol(symbol) {
  const raw = String(symbol?.icon || symbol?.id || '').toUpperCase();
  const symbolMap = {
    1: { label: 'MASK', glyph: 'MASK', tone: 'turquoise' },
    2: { label: 'SUN', glyph: 'SUN', tone: 'gold' },
    3: { label: 'TEMPLE', glyph: 'PYR', tone: 'stone' },
    4: { label: 'JADE', glyph: 'JADE', tone: 'green' },
    5: { label: 'JAGUAR', glyph: 'JAG', tone: 'amber' },
    6: { label: 'EAGLE', glyph: 'EGL', tone: 'red' },
    7: { label: 'A', glyph: 'A', tone: 'card' },
    8: { label: 'K', glyph: 'K', tone: 'card' },
    9: { label: 'Q', glyph: 'Q', tone: 'card' },
    10: { label: 'J', glyph: 'J', tone: 'card' },
    11: { label: 'WILD', glyph: 'WILD', tone: 'wild' },
    12: { label: 'SCATTER', glyph: 'SCAT', tone: 'scatter' },
    13: { label: 'BONUS', glyph: 'BONUS', tone: 'gold' },
    MASK: { label: 'MASK', glyph: 'MASK', tone: 'turquoise' },
    SUN: { label: 'SUN', glyph: 'SUN', tone: 'gold' },
    TEMPLE: { label: 'TEMPLE', glyph: 'PYR', tone: 'stone' },
    JADE: { label: 'JADE', glyph: 'JADE', tone: 'green' },
    JAGUAR: { label: 'JAGUAR', glyph: 'JAG', tone: 'amber' },
    EAGLE: { label: 'EAGLE', glyph: 'EGL', tone: 'red' },
    WILD: { label: 'WILD', glyph: 'WILD', tone: 'wild' },
    SCATTER: { label: 'SCATTER', glyph: 'SCAT', tone: 'scatter' },
    BONUS: { label: 'BONUS', glyph: 'BONUS', tone: 'gold' }
  };

  return symbolMap[raw] || { label: raw, glyph: raw, tone: 'card' };
}

function winningLineNumber(line) {
  const rawIndex = Number(line.index || 0);
  return rawIndex > 0 ? rawIndex : rawIndex + 1;
}

function linePattern(line) {
  return paylinePatterns[(winningLineNumber(line) - 1) % paylinePatterns.length];
}

function App() {
  const [mode, setMode] = useState('login');
  const [activeView, setActiveView] = useState('cashier');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [amount, setAmount] = useState('250');
  const [message, setMessage] = useState('');
  const [user, setUser] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [slotSession, setSlotSession] = useState(null);
  const [slotGames, setSlotGames] = useState([]);
  const [selectedSlotGameCode, setSelectedSlotGameCode] = useState('ctinteractive/luckydollar');
  const [slotHistory, setSlotHistory] = useState([]);
  const [slotBet, setSlotBet] = useState('1');
  const [slotResult, setSlotResult] = useState(null);
  const [animatedReels, setAnimatedReels] = useState(null);
  const [slotSpinPhase, setSlotSpinPhase] = useState('idle');
  const [adminUsers, setAdminUsers] = useState([]);
  const [selectedAdminUserId, setSelectedAdminUserId] = useState('');
  const [selectedAdminSlotGameCode, setSelectedAdminSlotGameCode] = useState('ctinteractive/luckydollar');
  const [adminUserForm, setAdminUserForm] = useState({
    email: '',
    fullName: '',
    balance: '',
    status: 'active',
    isAdmin: false,
    password: ''
  });
  const [slotConfig, setSlotConfig] = useState(null);
  const [vendorGame, setVendorGame] = useState(null);
  const [slotConfigForm, setSlotConfigForm] = useState({
    title: '',
    rtpPercent: '96',
    minBet: '1',
    maxBet: '1000',
    enabled: true
  });
  const [loading, setLoading] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const emailInputRef = useRef(null);

  const token = localStorage.getItem('authToken');
  const title = mode === 'login' ? 'Login' : 'Registration';
  const submitLabel = mode === 'login' ? 'Sign in' : 'Register';
  const selectedAdminUser = adminUsers.find((item) => String(item.id) === selectedAdminUserId);
  const selectedAdminSlotGame = slotGames.find((game) => game.code === selectedAdminSlotGameCode);
  const isAztecGold = selectedSlotGameCode === aztecGoldGameCode || slotSession?.code === aztecGoldGameCode;
  const activeSymbolPool = isAztecGold ? aztecSlotSymbols : slotSymbols;
  const winningCellKeys = useMemo(() => {
    const keys = new Set();

    if (spinning || !slotResult?.winningLines?.length) {
      return keys;
    }

    slotResult.winningLines.forEach((line) => {
      linePattern(line).forEach((rowIndex, reelIndex) => {
        if (rowIndex >= 0 && rowIndex < 3) {
          keys.add(`${reelIndex}-${rowIndex}`);
        }
      });
    });

    return keys;
  }, [spinning, slotResult]);
  const games = slotGames.length > 0 ? slotGames : [
    {
      code: 'ctinteractive/luckydollar',
      title: slotSession?.title || 'Lucky Dollar',
      provider: 'CT Interactive',
      lines: slotSession?.lines || 30,
      status: slotSession?.enabled === false ? 'Disabled' : 'Available'
    }
  ];
  const visibleGames = games.filter((game) => game.enabled !== false);
  const isSelectedSlotDisabled = slotSession?.enabled === false;

  const passwordHint = useMemo(() => {
    if (mode === 'login') {
      return '';
    }

    return password.length >= 8 ? 'Password length looks good.' : 'Use at least 8 characters.';
  }, [mode, password]);

  useEffect(() => {
    trackEvent('$pageview', { view: user ? activeView : mode });
  }, [activeView, mode, user]);

  useEffect(() => {
    if (user) {
      posthog.identify(String(user.id), {
        email: user.email,
        isAdmin: Boolean(user.isAdmin)
      });
    } else {
      posthog.reset();
    }
  }, [user]);

  useEffect(() => {
    setIsNavigationOpen(false);
  }, [activeView, user]);

  useEffect(() => {
    async function restoreSession() {
      if (!token) {
        return;
      }

      try {
        const response = await apiRequest('/api/me');
        setUser(response.user);
        await loadDeposits();
        await loadSlotGames();
        await loadSlotSession();
        await loadSlotHistory();
        if (response.user?.isAdmin) {
          await loadAdminData();
        }
      } catch (_error) {
        localStorage.removeItem('authToken');
      }
    }

    restoreSession();
  }, []);

  async function apiRequest(path, options = {}) {
    const storedToken = localStorage.getItem('authToken');
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
        ...options.headers
      }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Request failed.');
    }

    return data;
  }

  async function slotRequest(path, options = {}) {
    const storedToken = localStorage.getItem('authToken');
    const response = await fetch(`${apiUrl}/slot-api${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
        ...options.headers
      }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Slot request failed.');
    }

    return data;
  }

  async function loadDeposits() {
    const data = await apiRequest('/api/deposits');
    setDeposits(data.deposits || []);
  }

  async function loadSlotGames() {
    const data = await slotRequest('/slots/games');
    setSlotGames(data.games || []);
  }

  async function loadSlotSession(gameCode = selectedSlotGameCode) {
    const data = await slotRequest(`/slots/session?gameCode=${encodeURIComponent(gameCode)}`);
    setSlotSession(data.game);
    setSelectedSlotGameCode(data.game?.code || gameCode);
    setUser(data.user);
  }

  async function loadSlotHistory() {
    const data = await slotRequest('/slots/history');
    setSlotHistory(data.spins || []);
  }

  async function loadAdminData() {
    const [usersData, slotConfigData] = await Promise.all([
      apiRequest('/api/admin/users'),
      slotRequest(`/admin/slot-config?gameCode=${encodeURIComponent(selectedAdminSlotGameCode)}`)
    ]);

    setAdminUsers(usersData.users || []);
    if (slotConfigData.games?.length) {
      setSlotGames(slotConfigData.games.map((game) => ({
        ...game,
        ...game.config,
        status: game.config?.enabled === false ? 'Disabled' : 'Available'
      })));
    }
    applySlotConfig(slotConfigData.config);

    const firstUser = usersData.users?.[0];
    if (firstUser) {
      selectAdminUser(firstUser);
    }
  }

  function applySlotConfig(config) {
    if (!config) {
      return;
    }

    setSlotConfig(config);
    setSelectedAdminSlotGameCode(config.gameCode);
    setSlotConfigForm({
      title: config.title || 'Lucky Dollar',
      rtpPercent: String(config.rtpPercent ?? 96),
      minBet: String(config.minBet ?? 1),
      maxBet: String(config.maxBet ?? 1000),
      enabled: Boolean(config.enabled)
    });
  }

  function selectAdminSlotGame(gameCode) {
    const nextGame = slotGames.find((game) => game.code === gameCode);
    setSelectedAdminSlotGameCode(gameCode);

    if (nextGame) {
      applySlotConfig({
        gameCode: nextGame.code,
        title: nextGame.title,
        rtpPercent: nextGame.rtpPercent ?? nextGame.config?.rtpPercent ?? 96,
        minBet: nextGame.minBet ?? nextGame.config?.minBet ?? 1,
        maxBet: nextGame.maxBet ?? nextGame.config?.maxBet ?? 1000,
        enabled: nextGame.enabled ?? nextGame.config?.enabled ?? true
      });
    }
  }

  function selectAdminUser(nextUser) {
    setSelectedAdminUserId(String(nextUser.id));
    setAdminUserForm({
      email: nextUser.email || '',
      fullName: nextUser.fullName || '',
      balance: String(Number(nextUser.balanceCents || 0) / 100),
      status: nextUser.status || 'active',
      isAdmin: Boolean(nextUser.isAdmin),
      password: ''
    });
  }

  async function saveAdminUser(event) {
    event.preventDefault();
    if (!selectedAdminUserId) {
      return;
    }

    setAdminSaving(true);
    setMessage('');

    try {
      const payload = {
        email: adminUserForm.email,
        fullName: adminUserForm.fullName,
        balance: adminUserForm.balance,
        status: adminUserForm.status,
        isAdmin: adminUserForm.isAdmin
      };

      if (adminUserForm.password) {
        payload.password = adminUserForm.password;
      }

      const data = await apiRequest(`/api/admin/users/${selectedAdminUserId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      setAdminUsers((current) => current.map((item) => (item.id === data.user.id ? data.user : item)));
      selectAdminUser(data.user);
      if (user?.id === data.user.id) {
        setUser(data.user);
      }
      setMessage('User details saved.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setAdminSaving(false);
    }
  }

  async function saveSlotConfig(event) {
    event.preventDefault();
    setAdminSaving(true);
    setMessage('');

    try {
      const data = await slotRequest('/admin/slot-config', {
        method: 'PATCH',
        body: JSON.stringify({
          ...slotConfigForm,
          gameCode: selectedAdminSlotGameCode
        })
      });

      applySlotConfig(data.config);
      setSlotGames((current) => current.map((game) => (
        game.code === data.config.gameCode
          ? {
            ...game,
            ...data.config,
            status: data.config.enabled ? 'Available' : 'Disabled'
          }
          : game
      )));
      setSlotSession((current) => current ? {
        ...current,
        ...(current.code === data.config.gameCode ? {
          title: data.config.title,
          minBet: data.config.minBet,
          maxBet: data.config.maxBet,
          enabled: data.config.enabled
        } : {}),
        slotopolStatus: data.slotopolStatus
      } : current);
      setMessage('Slot configuration saved.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setAdminSaving(false);
    }
  }

  async function openVendorGameDemo() {
    setAdminSaving(true);
    setMessage('');

    try {
      const data = await apiRequest('/api/admin/vendor-game/session', {
        method: 'POST'
      });
      setVendorGame(data);
      trackEvent('admin_vendor_game_opened', {
        symbol: data.symbol
      });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setAdminSaving(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const data = await apiRequest(`/api/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      localStorage.setItem('authToken', data.token);
      setUser(data.user);
      trackEvent(mode === 'login' ? 'login_succeeded' : 'registration_succeeded', {
        userId: data.user?.id,
        isAdmin: Boolean(data.user?.isAdmin)
      });
      setMessage(mode === 'login' ? 'Welcome back.' : 'Membership profile created.');
      setPassword('');
      await loadDeposits();
      await loadSlotGames();
      await loadSlotSession();
      await loadSlotHistory();
      if (data.user?.isAdmin) {
        await loadAdminData();
      }
    } catch (error) {
      trackEvent(mode === 'login' ? 'login_failed' : 'registration_failed', {
        reason: error.message
      });
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deposit(event) {
    event.preventDefault();
    const checkoutWindow = window.open('', '_blank');
    setDepositing(true);
    setMessage('');

    if (checkoutWindow) {
      checkoutWindow.document.title = 'Opening checkout';
      checkoutWindow.document.body.innerHTML = '<p style="font-family: system-ui; padding: 24px;">Opening secure checkout...</p>';
    }

    try {
      const data = await apiRequest('/api/deposits', {
        method: 'POST',
        body: JSON.stringify({ amount, currency: 'USD' })
      });

      setUser(data.user);
      setDeposits((current) => [data.deposit, ...current].slice(0, 10));
      trackEvent('deposit_created', {
        depositId: data.deposit.id,
        amountCents: data.deposit.amountCents,
        currency: data.deposit.currency,
        status: data.deposit.status,
        hasCheckoutUrl: Boolean(data.deposit.checkoutUrl)
      });
      setMessage(
        data.deposit.status === 'confirmed'
          ? `${formatMoney(data.deposit.amountCents)} deposited.`
          : 'Checkout created. Complete payment to fund your balance.'
      );

      if (data.deposit.checkoutUrl) {
        if (checkoutWindow) {
          checkoutWindow.location.href = data.deposit.checkoutUrl;
        } else {
          window.location.assign(data.deposit.checkoutUrl);
        }
      } else if (checkoutWindow) {
        checkoutWindow.close();
      }
    } catch (error) {
      if (checkoutWindow) {
        checkoutWindow.close();
      }
      trackEvent('deposit_failed', {
        reason: error.message,
        amount
      });
      setMessage(error.message);
    } finally {
      setDepositing(false);
    }
  }

  async function spinSlot() {
    setSpinning(true);
    setSlotSpinPhase('rolling');
    setAnimatedReels(buildAnimatedReels(activeSymbolPool));
    setMessage('');

    try {
      const spinRequest = slotRequest('/slots/spin', {
        method: 'POST',
        body: JSON.stringify({ bet: slotBet, gameCode: selectedSlotGameCode })
      });
      const data = await spinRequest;

      setSlotSpinPhase('settling');
      setAnimatedReels(buildSettlingReels(data.result.reels || defaultReels, activeSymbolPool));
      await new Promise((resolve) => setTimeout(resolve, spinAnimationMs));

      setUser(data.user);
      setSlotResult(data.result);
      trackEvent('slot_spin_completed', {
        gameCode: data.result.gameCode,
        gameTitle: data.result.gameTitle,
        betCents: data.result.betCents,
        winCents: data.result.winCents,
        netCents: data.result.netCents,
        winningLineCount: data.result.winningLines?.length || 0,
        slotopolStatus: data.result.slotopolStatus
      });
      setAnimatedReels(null);
      setSlotSpinPhase('idle');
      await loadSlotHistory();
      setMessage(
        data.result.winCents > 0
          ? `Slot paid ${formatMoney(data.result.winCents)}.`
          : 'No win on this spin.'
      );
    } catch (error) {
      setAnimatedReels(null);
      setSlotSpinPhase('idle');
      trackEvent('slot_spin_failed', {
        gameCode: selectedSlotGameCode,
        reason: error.message
      });
      setMessage(error.message);
    } finally {
      setSpinning(false);
    }
  }

  async function openSlotGame(game) {
    if (game.enabled === false) {
      setMessage('This slot is currently disabled.');
      return;
    }

    setActiveView('slot');
    setSelectedSlotGameCode(game.code);
    setSlotResult(null);
    setMessage('');
    trackEvent('slot_game_selected', {
      gameCode: game.code,
      title: game.title,
      provider: game.provider,
      lines: game.lines
    });
    try {
      await loadSlotSession(game.code);
    } catch (error) {
      setMessage(error.message);
      setActiveView('games');
    }
  }

  function switchAuthMode(nextMode) {
    setMode(nextMode);
    setMessage('');
    setPassword('');
    setTimeout(() => {
      emailInputRef.current?.focus();
    }, 0);
  }

  function logout() {
    trackEvent('logout');
    setShowLogoutConfirm(false);
    setIsNavigationOpen(false);
    localStorage.removeItem('authToken');
    setUser(null);
    setDeposits([]);
    setSlotSession(null);
    setSlotGames([]);
    setSelectedSlotGameCode('ctinteractive/luckydollar');
    setSlotHistory([]);
    setSlotResult(null);
    setAdminUsers([]);
    setSelectedAdminUserId('');
    setSelectedAdminSlotGameCode('ctinteractive/luckydollar');
    setSlotConfig(null);
    setPassword('');
    setMessage('Signed out.');
  }

  function openView(view) {
    setActiveView(view);
    setIsNavigationOpen(false);
  }

  return (
    <main className="auth-page">
      <header className="site-header">
        <div className="container header-inner">
          <div className="brand-mark">
            <img src="/logo.svg?v=20260519" alt="CasUSDT.com" />
            <div>
              <strong>CasUSDT.com</strong>
              <small>Casino USDT</small>
            </div>
          </div>

          <div className="header-actions">
            {user ? (
              <>
                <button
                  type="button"
                  className="menu-toggle"
                  aria-label="Open navigation"
                  aria-controls="memberNavigation"
                  aria-expanded={isNavigationOpen}
                  onClick={() => setIsNavigationOpen((isOpen) => !isOpen)}
                >
                  <span aria-hidden="true"></span>
                  <span aria-hidden="true"></span>
                  <span aria-hidden="true"></span>
                </button>
                <div className="balance-pill">
                  <span>Balance</span>
                  <strong>{formatMoney(user.balanceCents)}</strong>
                </div>
                {user.isAdmin && (
                  <div className="admin-pill">
                    <span>Admin</span>
                  </div>
                )}
                <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setShowLogoutConfirm(true)}>
                  Logout
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`btn btn-sm ${mode === 'login' ? 'btn-primary' : 'btn-outline-primary'}`}
                  aria-pressed={mode === 'login'}
                  onClick={() => switchAuthMode('login')}
                >
                  Login
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${mode === 'register' ? 'btn-primary' : 'btn-outline-primary'}`}
                  aria-pressed={mode === 'register'}
                  onClick={() => switchAuthMode('register')}
                >
                  Register
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {showLogoutConfirm && (
        <div className="confirm-backdrop" role="presentation" onClick={() => setShowLogoutConfirm(false)}>
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logoutConfirmTitle"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="logoutConfirmTitle">Log out?</h2>
            <p>You will need to sign in again to access cashier and games.</p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setShowLogoutConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={logout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="auth-shell container">
        <div className="app-stage">
          {user ? (
            <div className="member-layout">
              <button
                type="button"
                className={`drawer-backdrop ${isNavigationOpen ? 'is-visible' : ''}`}
                aria-label="Close navigation"
                onClick={() => setIsNavigationOpen(false)}
              ></button>
              <aside
                id="memberNavigation"
                className={`member-sidebar ${isNavigationOpen ? 'is-open' : ''}`}
                aria-label="Account navigation"
              >
                <button
                  type="button"
                  className={activeView === 'cashier' ? 'active' : ''}
                  onClick={() => openView('cashier')}
                >
                  <span>Cashier</span>
                  <small>Balance and deposits</small>
                </button>
                <button
                  type="button"
                  className={activeView === 'games' || activeView === 'slot' ? 'active' : ''}
                  onClick={() => openView('games')}
                >
                  <span>Games</span>
                  <small>Slots catalogue</small>
                </button>
                {user.isAdmin && (
                  <button
                    type="button"
                    className={activeView === 'admin' ? 'active' : ''}
                    onClick={() => openView('admin')}
                  >
                    <span>Admin panel</span>
                    <small>Operations control</small>
                  </button>
                )}
              </aside>

              <div className="player-grid">
              {activeView === 'cashier' && (
              <div className="auth-card cashier-card shadow-lg">
                <div className="cashier-head">
                  <div>
                    <span className="eyebrow compact">Cashier</span>
                    <h2>Deposit funds</h2>
                  </div>
                  <div className="vault-balance">
                    <span>Available</span>
                    <strong>{formatMoney(user.balanceCents)}</strong>
                  </div>
                </div>

                <form className="deposit-form" onSubmit={deposit}>
                  <label className="form-label" htmlFor="amount">Deposit amount</label>
                  <div className="deposit-control">
                    <span>$</span>
                    <input
                      id="amount"
                      className="form-control form-control-lg"
                      type="number"
                      min="1"
                      max="10000"
                      step="0.01"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      required
                    />
                    <button className="btn btn-primary btn-lg" type="submit" disabled={depositing}>
                      {depositing ? 'Processing...' : 'Deposit'}
                    </button>
                  </div>
                </form>

                <div className="quick-amounts" aria-label="Quick deposit amounts">
                  {['100', '250', '500', '1000'].map((value) => (
                    <button key={value} type="button" className="btn btn-outline-primary btn-sm" onClick={() => setAmount(value)}>
                      {formatMoney(Number(value) * 100)}
                    </button>
                  ))}
                </div>

                <div className="deposit-history">
                  <h3>Recent deposits</h3>
                  {deposits.length === 0 ? (
                    <p className="text-secondary mb-0">No cashier activity yet.</p>
                  ) : (
                    <ul>
                      {deposits.map((item) => (
                        <li key={item.id}>
                          <span>
                            <strong>{formatMoney(item.amountCents)}</strong>
                            <small>{item.status}</small>
                          </span>
                          <span>{item.currency}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {message && (
                  <div className="alert alert-info mt-4 mb-0" role="status">
                    {message}
                  </div>
                )}
              </div>
              )}

              {activeView === 'games' && (
                <div className="auth-card games-card shadow-lg">
                  <div className="cashier-head">
                    <div>
                      <span className="eyebrow compact">Games</span>
                      <h2>Available slots</h2>
                      <p className="text-secondary mb-0">Choose a game to open the dedicated slot page.</p>
                    </div>
                  </div>

                  <div className="games-grid">
                    {visibleGames.map((game) => {
                      const disabled = game.enabled === false;

                      return (
                      <button
                        key={game.code}
                        type="button"
                        className={`game-tile ${disabled ? 'is-disabled' : ''}`}
                        disabled={disabled}
                        onClick={() => openSlotGame(game)}
                      >
                        <strong>{game.title}</strong>
                        <small>{game.provider} · {game.lines} lines · {game.status}</small>
                        <span className="btn btn-primary btn-sm">{disabled ? 'Disabled' : 'Open game'}</span>
                      </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeView === 'slot' && (
              <div className="auth-card slot-card shadow-lg">
                <div className={`slot-cabinet ${isAztecGold ? 'aztec-cabinet' : ''}`}>
                  {isAztecGold && (
                    <div className="aztec-topper">
                      <span>Megajack</span>
                      <strong>Aztec Gold</strong>
                      <small>{slotSession?.lines || 21} fixed lines</small>
                    </div>
                  )}
                  <div className="slot-marquee">
                    <span>{slotSession?.title || 'Lucky Dollar'}</span>
                    <strong>{slotResult?.winCents > 0 ? `WIN ${formatMoney(slotResult.winCents)}` : `${slotSession?.lines || 30} LINES`}</strong>
                    {isAztecGold && <small>Balance {formatMoney(user.balanceCents)}</small>}
                  </div>

                  <div className={`aztec-stage ${isAztecGold ? 'is-active' : ''}`}>
                    {isAztecGold && (
                      <aside className="aztec-paytable" aria-label="Aztec Gold high symbols">
                        <span>Wild substitutes all symbols except scatter</span>
                        <strong>WILD</strong>
                        <strong>MASK</strong>
                        <strong>SUN</strong>
                        <strong>TEMPLE</strong>
                      </aside>
                    )}

                  <div className={`slot-screen ${isAztecGold ? 'aztec-screen' : ''}`}>
                    <div className={`slot-machine ${isAztecGold ? 'aztec-machine' : ''}`} aria-label="Slot reels">
                      {(animatedReels || slotResult?.reels || defaultReels).map((reel, reelIndex) => (
                        <div
                          className={`slot-reel ${isAztecGold ? 'aztec-reel' : ''} ${spinning ? `is-${slotSpinPhase}` : ''}`}
                          key={reelIndex}
                          style={spinning ? {
                            '--spin-duration': `${1700 + reelIndex * 160}ms`
                          } : undefined}
                        >
                          <div className="slot-reel-strip">
                            {reel.map((symbol, rowIndex) => {
                              const aztec = aztecSymbol(symbol);

                              return (
                                <span
                                  className={[
                                    winningCellKeys.has(`${reelIndex}-${rowIndex}`) ? 'is-winning-symbol' : '',
                                    isAztecGold ? `aztec-symbol is-${aztec.tone}` : ''
                                  ].filter(Boolean).join(' ')}
                                  key={`${reelIndex}-${rowIndex}-${symbol.icon}`}
                                  aria-label={isAztecGold ? aztec.label : slotSymbolIcon(symbol)}
                                >
                                  {isAztecGold ? <b>{aztec.glyph}</b> : slotSymbolIcon(symbol)}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                    {isAztecGold && (
                      <aside className="aztec-paytable aztec-paytable-right" aria-label="Aztec Gold game status">
                        <span>Connected to live balance</span>
                        <strong>{formatMoney(slotBet * 100)}</strong>
                        <strong>{slotResult?.winCents > 0 ? formatMoney(slotResult.winCents) : 'WIN $0.00'}</strong>
                        <strong>{spinning ? 'SPINNING' : 'READY'}</strong>
                      </aside>
                    )}
                  </div>

                  <div className="slot-console">
                    <div className="slot-meter">
                      <span>Balance</span>
                      <strong>{formatMoney(user.balanceCents)}</strong>
                    </div>
                    <div className="slot-bet-panel">
                      <label className="form-label" htmlFor="slotBet">Bet</label>
                      <div className="slot-bet-control">
                        <span>$</span>
                        <input
                          id="slotBet"
                          className="form-control form-control-lg"
                          type="number"
                          min="1"
                          max="1000"
                          step="0.01"
                          value={slotBet}
                          onChange={(event) => setSlotBet(event.target.value)}
                        />
                      </div>
                    </div>
                    <button className="slot-spin-button" type="button" disabled={spinning || isSelectedSlotDisabled} onClick={spinSlot}>
                      {isSelectedSlotDisabled ? 'Disabled' : spinning ? 'Spinning' : 'Spin'}
                    </button>
                  </div>
                </div>

                {user.isAdmin && slotResult && (
                  <div className="slot-raw-result" aria-live="polite">
                    <h3>Raw spin result</h3>
                    <pre>{JSON.stringify(slotResult, null, 2)}</pre>
                  </div>
                )}

                <div className="deposit-history slot-history">
                  <h3>Recent spins</h3>
                  {slotHistory.length === 0 ? (
                    <p className="text-secondary mb-0">No slot activity yet.</p>
                  ) : (
                    <ul>
                      {slotHistory.map((item) => (
                        <li key={item.id}>
                          <span>
                            <strong>{formatMoney(item.winCents)}</strong>
                            <small>Bet {formatMoney(item.betCents)}</small>
                          </span>
                          <span>{formatMoney(item.balanceAfterCents)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              )}

              {user.isAdmin && activeView === 'admin' && (
                <div className="auth-card admin-card shadow-lg">
                  <div className="cashier-head">
                    <div>
                      <span className="eyebrow compact">Admin panel</span>
                      <h2>Operations control</h2>
                      <p className="text-secondary mb-0">Visible only to admin users. Manage accounts, balances, and slot configuration.</p>
                    </div>
                    <button type="button" className="btn btn-outline-primary btn-sm" onClick={loadAdminData}>
                      Refresh
                    </button>
                  </div>

                  <div className="admin-grid">
                    <div className="admin-list">
                      <h3>Users</h3>
                      <div className="admin-user-list">
                        {adminUsers.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={String(item.id) === selectedAdminUserId ? 'active' : ''}
                            onClick={() => selectAdminUser(item)}
                          >
                            <span>
                              <strong>{item.email}</strong>
                              <small>{item.isAdmin ? 'Admin' : 'User'} · {item.status}</small>
                            </span>
                            <span>{formatMoney(item.balanceCents)}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <form className="admin-editor" onSubmit={saveAdminUser}>
                      <h3>{selectedAdminUser ? 'User details' : 'Select a user'}</h3>
                      <div className="row g-3">
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="adminEmail">Email</label>
                          <input
                            id="adminEmail"
                            className="form-control"
                            type="email"
                            value={adminUserForm.email}
                            onChange={(event) => setAdminUserForm((current) => ({ ...current, email: event.target.value }))}
                            disabled={!selectedAdminUser}
                            required
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="adminFullName">Full name</label>
                          <input
                            id="adminFullName"
                            className="form-control"
                            value={adminUserForm.fullName}
                            onChange={(event) => setAdminUserForm((current) => ({ ...current, fullName: event.target.value }))}
                            disabled={!selectedAdminUser}
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="adminBalance">Balance</label>
                          <input
                            id="adminBalance"
                            className="form-control"
                            type="number"
                            min="0"
                            step="0.01"
                            value={adminUserForm.balance}
                            onChange={(event) => setAdminUserForm((current) => ({ ...current, balance: event.target.value }))}
                            disabled={!selectedAdminUser}
                            required
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="adminStatus">Status</label>
                          <select
                            id="adminStatus"
                            className="form-control"
                            value={adminUserForm.status}
                            onChange={(event) => setAdminUserForm((current) => ({ ...current, status: event.target.value }))}
                            disabled={!selectedAdminUser}
                          >
                            <option value="active">Active</option>
                            <option value="suspended">Suspended</option>
                          </select>
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="adminPassword">New password</label>
                          <input
                            id="adminPassword"
                            className="form-control"
                            type="password"
                            value={adminUserForm.password}
                            onChange={(event) => setAdminUserForm((current) => ({ ...current, password: event.target.value }))}
                            disabled={!selectedAdminUser}
                            placeholder="Optional"
                          />
                        </div>
                      </div>

                      <label className="admin-check">
                        <input
                          type="checkbox"
                          checked={adminUserForm.isAdmin}
                          onChange={(event) => setAdminUserForm((current) => ({ ...current, isAdmin: event.target.checked }))}
                          disabled={!selectedAdminUser}
                        />
                        Admin access
                      </label>

                      <button className="btn btn-primary" type="submit" disabled={!selectedAdminUser || adminSaving}>
                        {adminSaving ? 'Saving...' : 'Save user'}
                      </button>
                    </form>
                  </div>

                  <form className="slot-config-panel" onSubmit={saveSlotConfig}>
                    <div>
                      <h3>Slotopol settings</h3>
                      <p className="text-secondary mb-0">
                        Controls the site slot layer connected to Slotopol. RTP scales payouts before balance settlement.
                      </p>
                    </div>
                    <div className="row g-3">
                      <div className="col-md-12">
                        <label className="form-label" htmlFor="slotConfigGame">Game</label>
                        <select
                          id="slotConfigGame"
                          className="form-control"
                          value={selectedAdminSlotGameCode}
                          onChange={(event) => selectAdminSlotGame(event.target.value)}
                        >
                          {slotGames.map((game) => (
                            <option key={game.code} value={game.code}>
                              {game.provider} / {game.title} ({game.lines} lines)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="slotTitle">Game title</label>
                        <input
                          id="slotTitle"
                          className="form-control"
                          value={slotConfigForm.title}
                          onChange={(event) => setSlotConfigForm((current) => ({ ...current, title: event.target.value }))}
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="slotRtp">RTP %</label>
                        <input
                          id="slotRtp"
                          className="form-control"
                          type="number"
                          min="50"
                          max="99.9"
                          step="0.1"
                          value={slotConfigForm.rtpPercent}
                          onChange={(event) => setSlotConfigForm((current) => ({ ...current, rtpPercent: event.target.value }))}
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="slotMinBet">Min bet</label>
                        <input
                          id="slotMinBet"
                          className="form-control"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={slotConfigForm.minBet}
                          onChange={(event) => setSlotConfigForm((current) => ({ ...current, minBet: event.target.value }))}
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="slotMaxBet">Max bet</label>
                        <input
                          id="slotMaxBet"
                          className="form-control"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={slotConfigForm.maxBet}
                          onChange={(event) => setSlotConfigForm((current) => ({ ...current, maxBet: event.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="slot-config-actions">
                      <label className="admin-check">
                        <input
                          type="checkbox"
                          checked={slotConfigForm.enabled}
                          onChange={(event) => setSlotConfigForm((current) => ({ ...current, enabled: event.target.checked }))}
                        />
                        Game enabled
                      </label>
                      <span>
                        {selectedAdminSlotGame ? `${selectedAdminSlotGame.provider} / ${selectedAdminSlotGame.title}` : 'Game loading'} · Current RTP {slotConfig ? `${slotConfig.rtpPercent}%` : 'loading'}
                      </span>
                      <button className="btn btn-primary" type="submit" disabled={adminSaving}>
                        {adminSaving ? 'Saving...' : 'Save slot settings'}
                      </button>
                    </div>
                  </form>

                  <section className="vendor-game-panel">
                    <div className="vendor-game-head">
                      <div>
                        <h3>Uploaded slot demo</h3>
                        <p className="text-secondary mb-0">
                          Admin-only Pragmatic client from the split archive, served with a simulated local game service.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline-primary"
                        onClick={openVendorGameDemo}
                        disabled={adminSaving}
                      >
                        {vendorGame ? 'Reload demo' : 'Open demo'}
                      </button>
                    </div>

                    {vendorGame && (
                      <div className="vendor-game-frame">
                        <iframe
                          title={vendorGame.title}
                          src={vendorGame.url}
                          allow="autoplay; fullscreen"
                        />
                      </div>
                    )}
                  </section>
                </div>
              )}
              </div>
            </div>
          ) : (
            <div className="auth-card shadow-lg">
              <div className="mb-4">
                <h2>{title}</h2>
              </div>

              <form onSubmit={submit}>
                <div className="mb-3">
                  <label className="form-label" htmlFor="email">Email address</label>
                  <input
                    ref={emailInputRef}
                    id="email"
                    className="form-control form-control-lg"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="mb-2">
                  <label className="form-label" htmlFor="password">Password</label>
                  <input
                    id="password"
                    className="form-control form-control-lg"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    minLength={mode === 'register' ? 8 : undefined}
                    required
                  />
                </div>

                {passwordHint && <div className="form-text mb-3">{passwordHint}</div>}

                <button className="btn btn-primary btn-lg w-100 mt-3" type="submit" disabled={loading}>
                  {loading ? 'Please wait...' : submitLabel}
                </button>
              </form>

              {message && (
                <div className="alert alert-info mt-4 mb-0" role="status">
                  {message}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
