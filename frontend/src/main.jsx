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
const mysticalSlotSymbols = ['GOLD', 'GEM', '7', 'BAR', 'BOLT', 'COIN', 'CHRY', 'LEMN', 'WILD', 'SCAT', 'OWL', 'MUSH'];
const mysticalSheets = {
  mainGame: {
    url: '/assets/mystical-forest/mainGameAssets.png',
    w: 1906,
    h: 1600,
    frames: {
      mainGameLogo: { x: 1, y: 1, w: 480, h: 161 },
      reelFrame: { x: 1, y: 164, w: 1649, h: 1029 },
      winBg: { x: 483, y: 1, w: 262, h: 106 },
      symbol0: { x: 1, y: 1195, w: 254, h: 250 },
      symbol1: { x: 257, y: 1195, w: 238, h: 237 },
      symbol2: { x: 1024, y: 1195, w: 224, h: 213 },
      symbol3: { x: 1250, y: 1195, w: 224, h: 213 },
      symbol4: { x: 1652, y: 1, w: 253, h: 238 },
      symbol5: { x: 1652, y: 241, w: 245, h: 270 },
      symbol6: { x: 1652, y: 513, w: 245, h: 270 },
      symbol7: { x: 1652, y: 785, w: 245, h: 270 },
      symbol8: { x: 1652, y: 1057, w: 245, h: 270 },
      symbol9: { x: 1476, y: 1329, w: 245, h: 270 },
      symbol10: { x: 497, y: 1195, w: 299, h: 284 },
      symbol11: { x: 798, y: 1195, w: 224, h: 213 }
    }
  },
  control: {
    url: '/assets/mystical-forest/controlPanel.png',
    w: 792,
    h: 704,
    frames: {
      arrowLeft_Idle: { x: 203, y: 1, w: 99, h: 103 },
      arrowRight_Idle: { x: 1, y: 106, w: 104, h: 103 },
      Balance_Text: { x: 213, y: 106, w: 182, h: 39 },
      Bet_Text: { x: 397, y: 106, w: 182, h: 39 },
      Win_Text: { x: 1, y: 353, w: 182, h: 39 },
      woodframe: { x: 213, y: 147, w: 379, h: 94 },
      info_Idle: { x: 205, y: 243, w: 100, h: 101 },
      spin_Idle: { x: 177, y: 419, w: 174, h: 174 },
      spin_Pressed: { x: 353, y: 419, w: 174, h: 174 },
      spin_Disabled: { x: 409, y: 243, w: 174, h: 174 }
    }
  },
  paytableBg: {
    url: '/assets/mystical-forest/paytableBg.png',
    w: 2048,
    h: 1024,
    frames: {
      paytableBg: { x: 1, y: 1, w: 2046, h: 1022 }
    }
  },
  paytable: {
    url: '/assets/mystical-forest/paytableAssets1.png',
    w: 4573,
    h: 2302,
    frames: {
      symbols: { x: 1613, y: 681, w: 1962, h: 654 },
      Scatter_symbol: { x: 1613, y: 203, w: 429, h: 399 }
    }
  }
};
const mysticalSymbolFrames = {
  GOLD: 'symbol0',
  GEM: 'symbol1',
  7: 'symbol2',
  BAR: 'symbol3',
  BOLT: 'symbol4',
  COIN: 'symbol5',
  CHRY: 'symbol6',
  LEMN: 'symbol7',
  WILD: 'symbol8',
  SCAT: 'symbol9',
  OWL: 'symbol10',
  MUSH: 'symbol11'
};

const defaultMysticalReels = [
  [{ icon: 'GOLD' }, { icon: 'GEM' }, { icon: '7' }],
  [{ icon: 'BAR' }, { icon: 'BOLT' }, { icon: 'COIN' }],
  [{ icon: 'CHRY' }, { icon: 'LEMN' }, { icon: 'GOLD' }],
  [{ icon: 'GEM' }, { icon: '7' }, { icon: 'BAR' }],
  [{ icon: 'BOLT' }, { icon: 'COIN' }, { icon: 'CHRY' }]
];
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

function mysticalSymbolLabel(symbol) {
  return String(symbol?.icon || symbol?.id || 'GOLD').toUpperCase();
}

function mysticalSpriteStyle(sheetName, frameName) {
  const sheet = mysticalSheets[sheetName];
  const frame = sheet?.frames?.[frameName];

  if (!sheet || !frame) {
    return {};
  }

  const positionX = sheet.w === frame.w ? 0 : (frame.x / (sheet.w - frame.w)) * 100;
  const positionY = sheet.h === frame.h ? 0 : (frame.y / (sheet.h - frame.h)) * 100;

  return {
    aspectRatio: `${frame.w} / ${frame.h}`,
    backgroundImage: `url('${sheet.url}')`,
    backgroundSize: `${(sheet.w / frame.w) * 100}% ${(sheet.h / frame.h) * 100}%`,
    backgroundPosition: `${positionX}% ${positionY}%`
  };
}

function mysticalSymbolStyle(symbol) {
  const key = mysticalSymbolLabel(symbol);
  return mysticalSpriteStyle('mainGame', mysticalSymbolFrames[key] || 'symbol0');
}

function playAdminSlotSound(kind) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;

  if (!AudioContext) {
    return;
  }

  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = kind === 'win' ? 0.1 : 0.045;
  master.connect(context.destination);

  const tones = kind === 'win' ? [523, 659, 784, 1046] : [164, 196, 246];
  tones.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === 'win' ? 'triangle' : 'sawtooth';
    oscillator.frequency.setValueAtTime(frequency, context.currentTime + index * 0.06);
    gain.gain.setValueAtTime(0.001, context.currentTime + index * 0.06);
    gain.gain.exponentialRampToValueAtTime(0.6, context.currentTime + index * 0.06 + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + index * 0.06 + 0.18);
    oscillator.connect(gain).connect(master);
    oscillator.start(context.currentTime + index * 0.06);
    oscillator.stop(context.currentTime + index * 0.06 + 0.22);
  });

  setTimeout(() => context.close(), kind === 'win' ? 650 : 420);
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

function generateCrashShadows(count) {
  const width = typeof window === 'undefined' ? 1600 : Math.max(window.innerWidth, 1200);
  const height = 4000;

  return Array.from({ length: count }, () => {
    const x = Math.round(Math.random() * width);
    const y = Math.round(Math.random() * height);
    return `${x}px ${y}px #ffffff`;
  }).join(', ');
}

function crashTargetFromSlider(index) {
  if (index <= 50) {
    return Math.round((1 + (9 * (index / 50))) * 4) / 4;
  }

  return Math.round(10 + (90 * ((index - 50) / 50)));
}

function crashSliderFromTarget(target) {
  if (target <= 10) {
    return Math.round(((target - 1) / 9) * 50);
  }

  return Math.round(50 + ((target - 10) / 90) * 50);
}

function nextCrashMultiplier(current) {
  return Math.round((current + 0.01 * (Math.floor(current) + 1)) * 100) / 100;
}

function App() {
  const [mode, setMode] = useState('login');
  const [activeView, setActiveView] = useState('cashier');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [amount, setAmount] = useState('250');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [cashierTab, setCashierTab] = useState('deposit');
  const [message, setMessage] = useState('');
  const [user, setUser] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [slotSession, setSlotSession] = useState(null);
  const [slotGames, setSlotGames] = useState([]);
  const [selectedSlotGameCode, setSelectedSlotGameCode] = useState('ctinteractive/luckydollar');
  const [slotHistory, setSlotHistory] = useState([]);
  const [slotBet, setSlotBet] = useState('1');
  const [slotResult, setSlotResult] = useState(null);
  const [animatedReels, setAnimatedReels] = useState(null);
  const [slotSpinPhase, setSlotSpinPhase] = useState('idle');
  const [aviatorBet, setAviatorBet] = useState('1');
  const [aviatorRound, setAviatorRound] = useState(null);
  const [aviatorMultiplier, setAviatorMultiplier] = useState(0);
  const [aviatorResult, setAviatorResult] = useState(null);
  const [aviatorBusy, setAviatorBusy] = useState(false);
  const [aviatorHistory, setAviatorHistory] = useState(['1.34x', '2.08x', '1.11x', '4.72x', '1.86x', '7.40x']);
  const [aviatorTarget, setAviatorTarget] = useState(1.5);
  const [adminOpenSourceBet, setAdminOpenSourceBet] = useState('1');
  const [adminOpenSourceResult, setAdminOpenSourceResult] = useState(null);
  const [adminOpenSourceSpinning, setAdminOpenSourceSpinning] = useState(false);
  const [adminOpenSourceReels, setAdminOpenSourceReels] = useState(defaultMysticalReels);
  const [adminOpenSourcePaytableOpen, setAdminOpenSourcePaytableOpen] = useState(false);
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
  const [withdrawing, setWithdrawing] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [showCrashInfo, setShowCrashInfo] = useState(true);
  const emailInputRef = useRef(null);
  const aviatorMultiplierRef = useRef(0);
  const aviatorCashoutRef = useRef(false);
  const crashAudioRefs = useRef({});

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
  const crashShadows = useMemo(() => ({
    small: generateCrashShadows(700),
    medium: generateCrashShadows(200),
    big: generateCrashShadows(100)
  }), []);
  const gambaCrashMultiplier = aviatorRound ? aviatorMultiplier : aviatorResult ? aviatorResult.multiplier : 0;
  const crashRocketProgress = Math.min(gambaCrashMultiplier / 1, 1);
  const crashRocketStyle = {
    left: `${crashRocketProgress * 80}%`,
    bottom: `${Math.pow(crashRocketProgress, 5) * 70}%`,
    transform: `rotate(${(1 - Math.pow(crashRocketProgress, 2.3)) * 90}deg)`
  };
  const gambaCrashTone = aviatorResult?.crashed ? 'is-crashed' : aviatorResult ? 'is-win' : '';
  const crashTargetSliderValue = crashSliderFromTarget(aviatorTarget);

  const passwordHint = useMemo(() => {
    if (mode === 'login') {
      return '';
    }

    return password.length >= 8 ? 'Password length looks good.' : 'Use at least 8 characters.';
  }, [mode, password]);

  function stopCrashMusic() {
    const music = crashAudioRefs.current.music;

    if (music) {
      music.pause();
      music.currentTime = 0;
    }
  }

  function playCrashSound(name) {
    const sources = {
      music: '/assets/crash-music.mp3',
      crash: '/assets/crash-crash.mp3',
      win: '/assets/crash-win.mp3'
    };

    if (!crashAudioRefs.current[name]) {
      crashAudioRefs.current[name] = new Audio(sources[name]);
    }

    const audio = crashAudioRefs.current[name];
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

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
    aviatorMultiplierRef.current = aviatorMultiplier;
  }, [aviatorMultiplier]);

  useEffect(() => {
    if (!aviatorRound || aviatorRound.crashed) {
      return undefined;
    }

    let cancelled = false;
    let pollTick = 0;

    const settleCrash = (result, userUpdate = null) => {
      stopCrashMusic();
      playCrashSound(result.crashed ? 'crash' : 'win');
      setAviatorRound(null);
      setAviatorResult(result);
      setAviatorMultiplier(result.multiplier);
      setAviatorHistory((history) => [
        `${result.multiplier.toFixed(2)}x`,
        ...history
      ].slice(0, 12));

      if (userUpdate) {
        setUser(userUpdate);
      }
    };

    const interval = window.setInterval(async () => {
      if (cancelled) {
        return;
      }

      const nextMultiplier = nextCrashMultiplier(aviatorMultiplierRef.current);
      aviatorMultiplierRef.current = nextMultiplier;
      setAviatorMultiplier(nextMultiplier);
      pollTick += 1;

      if (nextMultiplier >= aviatorTarget && !aviatorCashoutRef.current) {
        aviatorCashoutRef.current = true;
        setAviatorBusy(true);

        try {
          const cashout = await apiRequest(`/api/aviator/rounds/${aviatorRound.id}/cashout`, {
            method: 'POST'
          });

          if (!cancelled) {
            settleCrash(cashout.result, cashout.user);
            trackEvent('crash_round_auto_cashed_out', {
              betCents: cashout.result.betCents,
              winCents: cashout.result.winCents,
              multiplier: cashout.result.multiplier,
              target: aviatorTarget
            });
            setMessage(`Crash paid ${formatMoney(cashout.result.winCents)} at ${cashout.result.multiplier.toFixed(2)}x.`);
          }
        } catch (error) {
          if (!cancelled) {
            const result = error.result || {
              crashed: true,
              multiplier: nextMultiplier,
              betCents: aviatorRound.betCents,
              winCents: 0,
              netCents: -aviatorRound.betCents
            };
            settleCrash(result);
            setMessage(error.message);
          }
        } finally {
          if (!cancelled) {
            setAviatorBusy(false);
          }
        }
      }

      if (pollTick % 4 === 0 && !aviatorCashoutRef.current) {
        try {
          const data = await apiRequest(`/api/aviator/rounds/${aviatorRound.id}`);

          if (!cancelled && data.round.crashed) {
            settleCrash({
              crashed: true,
              multiplier: data.round.multiplier,
              betCents: data.round.betCents,
              winCents: 0,
              netCents: -data.round.betCents
            });
            setMessage(`Crash game ended at ${data.round.multiplier.toFixed(2)}x.`);
          }
        } catch (_error) {
          if (!cancelled && !aviatorCashoutRef.current) {
            stopCrashMusic();
            setAviatorRound(null);
          }
        }
      }
    }, 50);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [aviatorRound?.id, aviatorRound?.crashed, aviatorTarget]);

  useEffect(() => {
    async function restoreSession() {
      if (!token) {
        return;
      }

      try {
        const response = await apiRequest('/api/me');
        setUser(response.user);
        await loadDeposits();
        await loadWithdrawals();
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

  async function loadWithdrawals() {
    const data = await apiRequest('/api/withdrawals');
    setWithdrawals(data.withdrawals || []);
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
      await loadWithdrawals();
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

  async function withdraw(event) {
    event.preventDefault();
    setWithdrawing(true);
    setMessage('');

    try {
      const data = await apiRequest('/api/withdrawals', {
        method: 'POST',
        body: JSON.stringify({ amount: withdrawAmount, walletAddress, currency: 'USD' })
      });

      setWithdrawals((current) => [data.withdrawal, ...current].slice(0, 10));
      trackEvent('withdrawal_created', {
        withdrawalId: data.withdrawal.id,
        amountCents: data.withdrawal.amountCents,
        currency: data.withdrawal.currency,
        status: data.withdrawal.status
      });
      setWithdrawAmount('');
      setWalletAddress('');
      setMessage('Withdrawal request created. It is pending review.');
    } catch (error) {
      trackEvent('withdrawal_failed', {
        reason: error.message,
        amount: withdrawAmount
      });
      setMessage(error.message);
    } finally {
      setWithdrawing(false);
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

  async function startAviatorRound() {
    setAviatorBusy(true);
    setAviatorResult(null);
    setAviatorMultiplier(0);
    aviatorMultiplierRef.current = 0;
    aviatorCashoutRef.current = false;
    setMessage('');

    try {
      const data = await apiRequest('/api/aviator/rounds', {
        method: 'POST',
        body: JSON.stringify({
          bet: aviatorBet,
          clientSeed: `casusdt-${user?.id || 'guest'}-${Date.now()}`
        })
      });

      setUser(data.user);
      setAviatorRound(data.round);
      setAviatorMultiplier(0);
      playCrashSound('music');
      trackEvent('crash_round_started', {
        betCents: data.round.betCents,
        roundId: data.round.id,
        target: aviatorTarget
      });
    } catch (error) {
      setMessage(error.message);
      trackEvent('crash_round_failed', {
        reason: error.message
      });
    } finally {
      setAviatorBusy(false);
    }
  }

  async function cashOutAviatorRound() {
    if (!aviatorRound) {
      return;
    }

    setAviatorBusy(true);
    setMessage('');

    try {
      const data = await apiRequest(`/api/aviator/rounds/${aviatorRound.id}/cashout`, {
        method: 'POST'
      });

      setUser(data.user);
      setAviatorRound(null);
      setAviatorResult(data.result);
      setAviatorMultiplier(data.result.multiplier);
      setAviatorHistory((history) => [
        `${data.result.multiplier.toFixed(2)}x`,
        ...history
      ].slice(0, 12));
      trackEvent('crash_round_cashed_out', {
        betCents: data.result.betCents,
        winCents: data.result.winCents,
        multiplier: data.result.multiplier
      });
      setMessage(`Crash cashed out at ${data.result.multiplier.toFixed(2)}x for ${formatMoney(data.result.winCents)}.`);
    } catch (error) {
      setAviatorRound(null);
      setAviatorResult(error.result || null);
      setMessage(error.message);
      trackEvent('crash_cashout_failed', {
        reason: error.message
      });
    } finally {
      setAviatorBusy(false);
    }
  }

  async function spinAdminOpenSourceSlot() {
    setAdminOpenSourceSpinning(true);
    setAdminOpenSourceReels(buildAnimatedReels(mysticalSlotSymbols));
    setMessage('');
    playAdminSlotSound('spin');

    try {
      const data = await slotRequest('/admin/open-source-slot/spin', {
        method: 'POST',
        body: JSON.stringify({
          bet: adminOpenSourceBet,
          clientSeed: `admin-${user?.id || 'casusdt'}`
        })
      });

      setAdminOpenSourceReels(buildSettlingReels(data.result.reels || defaultMysticalReels, mysticalSlotSymbols));
      await new Promise((resolve) => setTimeout(resolve, spinAnimationMs));
      setUser(data.user);
      setAdminOpenSourceResult(data.result);
      setAdminOpenSourceReels(data.result.reels || defaultMysticalReels);
      if (data.result.winCents > 0) {
        playAdminSlotSound('win');
      }
      trackEvent('admin_open_source_slot_spin_completed', {
        betCents: data.result.betCents,
        winCents: data.result.winCents,
        netCents: data.result.netCents
      });
      setMessage(
        data.result.winCents > 0
          ? `Open-source slot paid ${formatMoney(data.result.winCents)}.`
          : 'No win on this admin test spin.'
      );
    } catch (error) {
      setAdminOpenSourceReels(defaultMysticalReels);
      trackEvent('admin_open_source_slot_spin_failed', {
        reason: error.message
      });
      setMessage(error.message);
    } finally {
      setAdminOpenSourceSpinning(false);
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
    setMobileDrawerOpen(false);
    localStorage.removeItem('authToken');
    setUser(null);
    setDeposits([]);
    setSlotSession(null);
    setSlotGames([]);
    setSelectedSlotGameCode('ctinteractive/luckydollar');
    setSlotHistory([]);
    setSlotResult(null);
    setAviatorRound(null);
    setAviatorResult(null);
    setAviatorMultiplier(0);
    setAdminUsers([]);
    setSelectedAdminUserId('');
    setSelectedAdminSlotGameCode('ctinteractive/luckydollar');
    setSlotConfig(null);
    setAdminOpenSourceBet('1');
    setAdminOpenSourceResult(null);
    setAdminOpenSourceSpinning(false);
    setAdminOpenSourceReels(defaultMysticalReels);
    setAdminOpenSourcePaytableOpen(false);
    setPassword('');
    setMessage('Signed out.');
  }

  function showMemberView(nextView) {
    setActiveView(nextView);
    setMobileDrawerOpen(false);
  }

  const navigationItems = user
    ? [
        {
          key: 'cashier',
          label: 'Cashier',
          description: 'Balance and deposits',
          active: activeView === 'cashier',
          onSelect: () => showMemberView('cashier')
        },
        {
          key: 'games',
          label: 'Games',
          description: 'Slots catalogue',
          active: activeView === 'games' || activeView === 'slot',
          onSelect: () => showMemberView('games')
        },
        {
          key: 'plinko',
          label: 'Plinko',
          description: 'Drop balls with balance',
          active: activeView === 'plinko',
          onSelect: () => showMemberView('plinko')
        },
        ...(user.isAdmin
          ? [
              {
                key: 'aviator',
                label: 'Crash',
                description: 'Rocket multiplier game',
                active: activeView === 'aviator',
                onSelect: () => showMemberView('aviator')
              },
              {
                key: 'admin',
                label: 'Admin panel',
                description: 'Operations control',
                active: activeView === 'admin',
                onSelect: () => showMemberView('admin')
              },
              {
                key: 'admin-open-source-slot',
                label: 'Open-source slot',
                description: 'Admin-only game lab',
                active: activeView === 'admin-open-source-slot',
                onSelect: () => showMemberView('admin-open-source-slot')
              }
            ]
          : [])
      ]
    : [];

  return (
    <main className="auth-page">
      <header className="site-header">
        <div className="container header-inner">
          {user && (
            <button
              type="button"
              className="mobile-menu-button"
              aria-label="Open account navigation"
              aria-expanded={mobileDrawerOpen}
              aria-controls="mobileMemberDrawer"
              onClick={() => setMobileDrawerOpen(true)}
            >
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </button>
          )}

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

      {user && (
        <div
          className={'mobile-drawer-backdrop ' + (mobileDrawerOpen ? 'open' : '')}
          role="presentation"
          onClick={() => setMobileDrawerOpen(false)}
        >
          <nav
            id="mobileMemberDrawer"
            className="mobile-member-drawer"
            aria-label="Account navigation"
            aria-hidden={!mobileDrawerOpen}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-drawer-head">
              <div>
                <strong>CasUSDT.com</strong>
                <small>{user.email}</small>
              </div>
              <button
                type="button"
                className="drawer-close"
                aria-label="Close account navigation"
                onClick={() => setMobileDrawerOpen(false)}
              >
                X
              </button>
            </div>

            <div className="mobile-drawer-balance">
              <span>Balance</span>
              <strong>{formatMoney(user.balanceCents)}</strong>
            </div>

            <div className="mobile-drawer-nav">
              {navigationItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={item.active ? 'active' : ''}
                  onClick={item.onSelect}
                >
                  <span>{item.label}</span>
                  <small>{item.description}</small>
                </button>
              ))}
              <button
                type="button"
                className="drawer-logout"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  setShowLogoutConfirm(true);
                }}
              >
                <span>Logout</span>
                <small>End current session</small>
              </button>
            </div>
          </nav>
        </div>
      )}

      <section className="auth-shell container">
        <div className="app-stage">
          {user ? (
            <div className="member-layout">
              <aside className="member-sidebar" aria-label="Account navigation">
                {navigationItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={item.active ? 'active' : ''}
                    onClick={item.onSelect}
                  >
                    <span>{item.label}</span>
                    <small>{item.description}</small>
                  </button>
                ))}
              </aside>

              <div className="player-grid">
              {activeView === 'cashier' && (
              <div className="auth-card cashier-card shadow-lg">
                <div className="cashier-head">
                  <div>
                    <h2>Cashier</h2>
                  </div>
                  <div className="vault-balance">
                    <span>Available</span>
                    <strong>{formatMoney(user.balanceCents)}</strong>
                  </div>
                </div>

                <div className="cashier-tabs" role="tablist" aria-label="Cashier actions">
                  <button
                    type="button"
                    className={cashierTab === 'deposit' ? 'active' : ''}
                    role="tab"
                    aria-selected={cashierTab === 'deposit'}
                    onClick={() => setCashierTab('deposit')}
                  >
                    Deposit
                  </button>
                  <button
                    type="button"
                    className={cashierTab === 'withdraw' ? 'active' : ''}
                    role="tab"
                    aria-selected={cashierTab === 'withdraw'}
                    onClick={() => setCashierTab('withdraw')}
                  >
                    Withdraw
                  </button>
                </div>

                {cashierTab === 'deposit' ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <form className="deposit-form withdraw-form" onSubmit={withdraw}>
                      <label className="form-label" htmlFor="withdraw-amount">Withdraw amount</label>
                      <div className="deposit-control withdraw-control">
                        <span>$</span>
                        <input
                          id="withdraw-amount"
                          className="form-control form-control-lg"
                          type="number"
                          min="1"
                          max="10000"
                          step="0.01"
                          value={withdrawAmount}
                          onChange={(event) => setWithdrawAmount(event.target.value)}
                          required
                        />
                      </div>
                      <label className="form-label" htmlFor="wallet-address">Wallet address</label>
                      <input
                        id="wallet-address"
                        className="form-control form-control-lg"
                        type="text"
                        value={walletAddress}
                        onChange={(event) => setWalletAddress(event.target.value)}
                        autoComplete="off"
                        required
                      />
                      <button className="btn btn-primary btn-lg withdraw-submit" type="submit" disabled={withdrawing}>
                        {withdrawing ? 'Creating request...' : 'Confirm withdrawal'}
                      </button>
                    </form>

                    <div className="deposit-history">
                      <h3>Recent withdrawals</h3>
                      {withdrawals.length === 0 ? (
                        <p className="text-secondary mb-0">No withdrawal requests yet.</p>
                      ) : (
                        <ul>
                          {withdrawals.map((item) => (
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
                  </>
                )}

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

              {activeView === 'plinko' && (
                <div className="plinko-direct-card">
                  <iframe
                    className="plinko-embed"
                    title="Plinko Game"
                    src="/plinko/index.html"
                    loading="lazy"
                  />
                </div>
              )}

              {user.isAdmin && activeView === 'aviator' && (
                <div className="gamba-crash-view">
                  <div className="gamba-crash-game">
                    <div className={'gamba-crash-screen ' + (aviatorRound ? 'is-flying' : aviatorResult?.crashed ? 'is-crashed' : '')}>
                      {showCrashInfo && (
                        <div className="gamba-crash-info-modal" role="dialog" aria-modal="true" aria-label="Crash game information">
                          <button type="button" className="gamba-crash-modal-close" aria-label="Close" onClick={() => setShowCrashInfo(false)}>
                            ×
                          </button>
                          <h1>
                            <img src="/assets/gamba-games/crash.png" alt="Crash" />
                          </h1>
                          <p>
                            Predict a multiplier target and watch a rocket attempt to reach it. If the rocket crashes before the target, the player loses; if it reaches or exceeds the target, the player wins.
                          </p>
                          <button type="button" className="gamba-crash-info-play" onClick={() => setShowCrashInfo(false)}>
                            Play
                          </button>
                        </div>
                      )}
                      <div className="gamba-crash-screen-inner">
                        <div className="gamba-crash-stars-layer gamba-crash-stars-layer-1" style={{ opacity: gambaCrashMultiplier > 3 ? 0 : 1, boxShadow: crashShadows.small }} />
                        <div className="gamba-crash-lines-layer gamba-crash-lines-layer-1" style={{ opacity: gambaCrashMultiplier > 3 ? 1 : 0, boxShadow: crashShadows.small }} />
                        <div className="gamba-crash-stars-layer gamba-crash-stars-layer-2" style={{ opacity: gambaCrashMultiplier > 2 ? 0 : 1, boxShadow: crashShadows.medium }} />
                        <div className="gamba-crash-lines-layer gamba-crash-lines-layer-2" style={{ opacity: gambaCrashMultiplier > 2 ? 1 : 0, boxShadow: crashShadows.medium }} />
                        <div className="gamba-crash-stars-layer gamba-crash-stars-layer-3" style={{ opacity: gambaCrashMultiplier > 1 ? 0 : 1, boxShadow: crashShadows.big }} />
                        <div className="gamba-crash-lines-layer gamba-crash-lines-layer-3" style={{ opacity: gambaCrashMultiplier > 1 ? 1 : 0, boxShadow: crashShadows.big }} />
                        <div className={'gamba-crash-multiplier ' + gambaCrashTone}>
                          {gambaCrashMultiplier.toFixed(2)}x
                        </div>
                        <img className="gamba-crash-rocket" src="/assets/crash-rocket.gif" alt="" style={crashRocketStyle} />
                      </div>
                      <div className="gamba-crash-meta-controls" aria-label="Game tools">
                        <button type="button" aria-label="Information" onClick={() => setShowCrashInfo(true)}>i</button>
                        <button type="button" aria-label="Fairness">F</button>
                        <button type="button" aria-label="Sound">S</button>
                      </div>
                    </div>

                    <div className="gamba-crash-loading" aria-hidden="true" />

                    <div className="gamba-crash-controls">
                      <div className="gamba-crash-wager">
                        <button
                          type="button"
                          disabled={Boolean(aviatorRound)}
                          onClick={() => setAviatorBet((current) => String(Math.max(1, Math.floor(Number(current || 0) - 1))))}
                        >
                          -
                        </button>
                        <label>
                          <span>Wager</span>
                          <input
                            id="aviatorBet"
                            aria-label="Crash wager"
                            type="number"
                            min="1"
                            max="10000"
                            step="1"
                            value={aviatorBet}
                            disabled={Boolean(aviatorRound)}
                            onChange={(event) => setAviatorBet(event.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          disabled={Boolean(aviatorRound)}
                          onClick={() => setAviatorBet((current) => String(Math.max(1, Math.floor(Number(current || 0) + 1))))}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(aviatorRound)}
                          onClick={() => setAviatorBet((current) => String(Math.max(1, Math.floor(Number(current || 0) * 0.5))))}
                        >
                          x.5
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(aviatorRound)}
                          onClick={() => setAviatorBet((current) => String(Math.max(1, Math.floor(Number(current || 0) * 2))))}
                        >
                          2x
                        </button>
                      </div>

                      <div className="gamba-crash-slider">
                        <span>{aviatorTarget.toFixed(2)}x</span>
                        <input
                          aria-label="Crash target multiplier"
                          type="range"
                          min="1"
                          max="100"
                          step="1"
                          value={crashTargetSliderValue}
                          disabled={Boolean(aviatorRound)}
                          onChange={(event) => {
                            const index = Number(event.target.value);
                            setAviatorTarget(crashTargetFromSlider(index));
                          }}
                        />
                      </div>

                      <button className="gamba-crash-play" type="button" disabled={aviatorBusy || Boolean(aviatorRound)} onClick={startAviatorRound}>
                        {aviatorRound ? 'Flying...' : aviatorBusy ? 'Launching...' : 'Play'}
                      </button>
                    </div>
                  </div>

                  {aviatorResult && (
                    <div className="gamba-crash-result">
                      <span>{aviatorResult.crashed ? 'Crashed' : 'Cashed out'}</span>
                      <strong>{aviatorResult.multiplier.toFixed(2)}x</strong>
                      <small>Net {formatMoney(aviatorResult.netCents)}</small>
                    </div>
                  )}

                  <div className="gamba-crash-carousel" aria-label="More Gamba games">
                    {[
                      ['dice', 'Dice', '#ff6490'],
                      ['slots', 'Slots', '#5465ff'],
                      ['flip', 'Flip', '#ffe694'],
                      ['hilo', 'HiLo', '#ff4f4f'],
                      ['mines', 'Mines', '#8376ff'],
                      ['plinko', 'Plinko', '#7272ff'],
                      ['roulette', 'Roulette', '#1de87e'],
                      ['blackjack', 'BlackJack', '#084700']
                    ].map(([id, name, background]) => (
                      <div className="gamba-crash-card" key={id} style={{ background }}>
                        <div className="gamba-crash-card-pattern" />
                        <div className="gamba-crash-card-image" style={{ backgroundImage: `url(/assets/gamba-games/${id}.png)` }} />
                        <span>Play {name}</span>
                      </div>
                    ))}
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

              {user.isAdmin && activeView === 'admin-open-source-slot' && (
                <div className="admin-open-source-card mystical-game-card">
                  <div className="mystical-game-viewport">
                    <section className="mystical-game-stage" aria-label="Mystical Forest Adventure admin slot">
                      <div className="mystical-background" />
                      <div className="mystical-logo" style={mysticalSpriteStyle('mainGame', 'mainGameLogo')} />
                      <div className="mystical-reel-frame" style={mysticalSpriteStyle('mainGame', 'reelFrame')} />
                      <div className="mystical-reels-window">
                        <div className="mystical-reels" aria-label="Admin open-source slot reels">
                          {adminOpenSourceReels.map((reel, reelIndex) => (
                            <div
                              className={`mystical-reel ${adminOpenSourceSpinning ? 'is-rolling' : ''}`}
                              key={reelIndex}
                              style={adminOpenSourceSpinning ? {
                                '--spin-duration': `${1700 + reelIndex * 160}ms`
                              } : undefined}
                            >
                              <div className="mystical-reel-strip">
                                {reel.map((symbol, rowIndex) => (
                                  <span
                                    className="mystical-symbol"
                                    key={`${reelIndex}-${rowIndex}-${symbol.icon}`}
                                    style={mysticalSymbolStyle(symbol)}
                                    aria-label={mysticalSymbolLabel(symbol)}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mystical-ticker">
                        <span className="mystical-panel-bg" style={mysticalSpriteStyle('control', 'woodframe')} />
                        <strong>{adminOpenSourceSpinning ? 'SPINNING' : adminOpenSourceResult?.winCents > 0 ? `WIN ${formatMoney(adminOpenSourceResult.winCents)}` : 'GOOD LUCK'}</strong>
                      </div>
                      <div className="mystical-meter mystical-meter-balance">
                        <span className="mystical-panel-bg" style={mysticalSpriteStyle('control', 'woodframe')} />
                        <span className="mystical-label-sprite" style={mysticalSpriteStyle('control', 'Balance_Text')} />
                        <strong>{formatMoney(user.balanceCents)}</strong>
                      </div>
                      <div className="mystical-meter mystical-meter-win">
                        <span className="mystical-panel-bg" style={mysticalSpriteStyle('control', 'woodframe')} />
                        <span className="mystical-label-sprite" style={mysticalSpriteStyle('control', 'Win_Text')} />
                        <strong>{formatMoney(adminOpenSourceResult?.winCents || 0)}</strong>
                      </div>
                      <div className="mystical-meter mystical-meter-bet">
                        <span className="mystical-panel-bg" style={mysticalSpriteStyle('control', 'woodframe')} />
                        <button
                          className="mystical-arrow mystical-arrow-left"
                          type="button"
                          aria-label="Decrease bet"
                          style={mysticalSpriteStyle('control', 'arrowLeft_Idle')}
                          onClick={() => setAdminOpenSourceBet((current) => String(Math.max(1, Number(current || 1) - 1)))}
                          disabled={adminOpenSourceSpinning}
                        />
                        <span className="mystical-label-sprite" style={mysticalSpriteStyle('control', 'Bet_Text')} />
                        <input
                          id="adminOpenSourceBet"
                          aria-label="Bet"
                          type="number"
                          min="1"
                          max="1000"
                          step="0.01"
                          value={adminOpenSourceBet}
                          onChange={(event) => setAdminOpenSourceBet(event.target.value)}
                          disabled={adminOpenSourceSpinning}
                        />
                        <button
                          className="mystical-arrow mystical-arrow-right"
                          type="button"
                          aria-label="Increase bet"
                          style={mysticalSpriteStyle('control', 'arrowRight_Idle')}
                          onClick={() => setAdminOpenSourceBet((current) => String(Math.min(1000, Number(current || 1) + 1)))}
                          disabled={adminOpenSourceSpinning}
                        />
                      </div>
                      <button
                        className="mystical-info-button"
                        type="button"
                        aria-label="Open paytable"
                        style={mysticalSpriteStyle('control', 'info_Idle')}
                        onClick={() => setAdminOpenSourcePaytableOpen(true)}
                      />
                      <button
                        className="mystical-spin-button"
                        type="button"
                        aria-label="Spin"
                        disabled={adminOpenSourceSpinning}
                        onClick={spinAdminOpenSourceSlot}
                      >
                        <span style={mysticalSpriteStyle('control', adminOpenSourceSpinning ? 'spin_Disabled' : 'spin_Idle')} />
                      </button>
                      {adminOpenSourceResult?.fairnessHash && (
                        <div className="mystical-audit-strip">
                          <span>Round #{adminOpenSourceResult.id}</span>
                          <span>{adminOpenSourceResult.fairnessHash.slice(0, 18)}...</span>
                        </div>
                      )}
                      {adminOpenSourcePaytableOpen && (
                        <div className="mystical-paytable" role="dialog" aria-modal="true" aria-label="Mystical Forest Adventure paytable">
                          <div className="mystical-paytable-panel">
                            <button
                              className="mystical-paytable-close"
                              type="button"
                              aria-label="Close paytable"
                              onClick={() => setAdminOpenSourcePaytableOpen(false)}
                            >
                              x
                            </button>
                            <h3>Mystical Forest Adventure</h3>
                            <div className="mystical-paytable-symbols" style={mysticalSpriteStyle('paytable', 'symbols')} />
                            <p>Admin-only demo. The visual client is the Mystical Forest Adventure frontend; all reels, wins, balance changes, and audit hashes are settled by the CasUSDT slot service.</p>
                          </div>
                        </div>
                      )}
                    </section>
                  </div>
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
