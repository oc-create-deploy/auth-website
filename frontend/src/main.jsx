import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles.css';

const apiUrl = import.meta.env.VITE_API_URL || '';

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
  const [slotHistory, setSlotHistory] = useState([]);
  const [slotBet, setSlotBet] = useState('25');
  const [slotResult, setSlotResult] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [selectedAdminUserId, setSelectedAdminUserId] = useState('');
  const [adminUserForm, setAdminUserForm] = useState({
    email: '',
    fullName: '',
    balance: '',
    status: 'active',
    isAdmin: false,
    password: ''
  });
  const [slotConfig, setSlotConfig] = useState(null);
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
  const emailInputRef = useRef(null);

  const token = localStorage.getItem('authToken');
  const title = mode === 'login' ? 'Access account' : 'Request membership';
  const submitLabel = mode === 'login' ? 'Sign in' : 'Register';
  const selectedAdminUser = adminUsers.find((item) => String(item.id) === selectedAdminUserId);
  const games = [
    {
      code: 'ctinteractive/luckydollar',
      title: slotSession?.title || 'Lucky Dollar',
      provider: 'CT Interactive',
      lines: slotSession?.lines || 30,
      status: slotSession?.enabled === false ? 'Disabled' : 'Available'
    }
  ];

  const passwordHint = useMemo(() => {
    if (mode === 'login') {
      return '';
    }

    return password.length >= 8 ? 'Password length looks good.' : 'Use at least 8 characters.';
  }, [mode, password]);

  useEffect(() => {
    async function restoreSession() {
      if (!token) {
        return;
      }

      try {
        const response = await apiRequest('/api/me');
        setUser(response.user);
        await loadDeposits();
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

  async function loadSlotSession() {
    const data = await slotRequest('/slots/session');
    setSlotSession(data.game);
    setUser(data.user);
  }

  async function loadSlotHistory() {
    const data = await slotRequest('/slots/history');
    setSlotHistory(data.spins || []);
  }

  async function loadAdminData() {
    const [usersData, slotConfigData] = await Promise.all([
      apiRequest('/api/admin/users'),
      slotRequest('/admin/slot-config')
    ]);

    setAdminUsers(usersData.users || []);
    setSlotConfig(slotConfigData.config);
    setSlotConfigForm({
      title: slotConfigData.config?.title || 'Lucky Dollar',
      rtpPercent: String(slotConfigData.config?.rtpPercent ?? 96),
      minBet: String(slotConfigData.config?.minBet ?? 1),
      maxBet: String(slotConfigData.config?.maxBet ?? 1000),
      enabled: Boolean(slotConfigData.config?.enabled)
    });

    const firstUser = usersData.users?.[0];
    if (firstUser) {
      selectAdminUser(firstUser);
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
        body: JSON.stringify(slotConfigForm)
      });

      setSlotConfig(data.config);
      setSlotSession((current) => current ? {
        ...current,
        title: data.config.title,
        minBet: data.config.minBet,
        maxBet: data.config.maxBet,
        enabled: data.config.enabled,
        slotopolStatus: data.slotopolStatus
      } : current);
      setMessage('Slot configuration saved.');
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
      setMessage(mode === 'login' ? 'Welcome back.' : 'Membership profile created.');
      setPassword('');
      await loadDeposits();
      await loadSlotSession();
      await loadSlotHistory();
      if (data.user?.isAdmin) {
        await loadAdminData();
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deposit(event) {
    event.preventDefault();
    setDepositing(true);
    setMessage('');

    try {
      const data = await apiRequest('/api/deposits', {
        method: 'POST',
        body: JSON.stringify({ amount, currency: 'USD' })
      });

      setUser(data.user);
      setDeposits((current) => [data.deposit, ...current].slice(0, 10));
      setMessage(
        data.deposit.status === 'confirmed'
          ? `${formatMoney(data.deposit.amountCents)} deposited.`
          : 'Cloakd checkout created. Complete the provider payment to fund your balance.'
      );

      if (data.deposit.checkoutUrl) {
        window.open(data.deposit.checkoutUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setDepositing(false);
    }
  }

  async function spinSlot() {
    setSpinning(true);
    setMessage('');

    try {
      const data = await slotRequest('/slots/spin', {
        method: 'POST',
        body: JSON.stringify({ bet: slotBet })
      });

      setUser(data.user);
      setSlotResult(data.result);
      await loadSlotHistory();
      setMessage(
        data.result.winCents > 0
          ? `Slot paid ${formatMoney(data.result.winCents)}.`
          : 'No win on this spin.'
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSpinning(false);
    }
  }

  function openSlotGame() {
    setActiveView('slot');
    setMessage('');
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
    localStorage.removeItem('authToken');
    setUser(null);
    setDeposits([]);
    setSlotSession(null);
    setSlotHistory([]);
    setSlotResult(null);
    setAdminUsers([]);
    setSelectedAdminUserId('');
    setSlotConfig(null);
    setPassword('');
    setMessage('Signed out.');
  }

  return (
    <main className="auth-page">
      <header className="site-header">
        <div className="container header-inner">
          <div className="brand-mark">
            <span>AE</span>
            <div>
              <strong>Aurum Exchange</strong>
              <small>Private cashier</small>
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
                <button type="button" className="btn btn-outline-primary btn-sm" onClick={logout}>
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

      <section className="auth-shell container">
        <div className="app-stage">
          {user ? (
            <div className="member-layout">
              <aside className="member-sidebar" aria-label="Account navigation">
                <button
                  type="button"
                  className={activeView === 'cashier' ? 'active' : ''}
                  onClick={() => setActiveView('cashier')}
                >
                  <span>Cashier</span>
                  <small>Balance and deposits</small>
                </button>
                <button
                  type="button"
                  className={activeView === 'games' || activeView === 'slot' ? 'active' : ''}
                  onClick={() => setActiveView('games')}
                >
                  <span>Games</span>
                  <small>Slots catalogue</small>
                </button>
              </aside>

              <div className="player-grid">
              {activeView === 'cashier' && (
              <div className="auth-card cashier-card shadow-lg">
                <div className="cashier-head">
                  <div>
                    <span className="eyebrow compact">Cashier</span>
                    <h2>Deposit funds</h2>
                    <p className="text-secondary mb-0">Demo deposits settle instantly. Add Cloakd API credentials to issue live checkout links.</p>
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
                            <small>{item.provider} · {item.status}</small>
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
                    {games.map((game) => (
                      <button key={game.code} type="button" className="game-tile" onClick={openSlotGame}>
                        <span className="game-badge">{game.provider}</span>
                        <strong>{game.title}</strong>
                        <small>{game.lines} lines · {game.status}</small>
                        <span className="btn btn-primary btn-sm">Open game</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeView === 'slot' && (
              <div className="auth-card slot-card shadow-lg">
                <div className="slot-cabinet">
                  <div className="slot-marquee">
                    <span>{slotSession?.title || 'Lucky Dollar'}</span>
                    <strong>{slotResult?.winCents > 0 ? `WIN ${formatMoney(slotResult.winCents)}` : '30 LINES'}</strong>
                    <small>Engine {slotSession?.slotopolStatus || 'loading'}</small>
                  </div>

                  <div className="slot-screen">
                    <div className="slot-payline" aria-hidden="true" />
                    <div className="slot-machine" aria-label="Slot reels">
                      {(slotResult?.reels || [
                        [{ icon: '7' }, { icon: 'BAR' }, { icon: '$' }],
                        [{ icon: 'A' }, { icon: '7' }, { icon: 'K' }],
                        [{ icon: '$' }, { icon: 'WILD' }, { icon: '7' }],
                        [{ icon: 'Q' }, { icon: 'BAR' }, { icon: 'A' }],
                        [{ icon: '7' }, { icon: '$' }, { icon: 'BONUS' }]
                      ]).map((reel, reelIndex) => (
                        <div className="slot-reel" key={reelIndex}>
                          {reel.map((symbol, rowIndex) => (
                            <span key={`${reelIndex}-${rowIndex}-${symbol.icon}`}>{slotSymbolIcon(symbol)}</span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="slot-console">
                    <div className="slot-meter">
                      <span>Balance</span>
                      <strong>{formatMoney(user.balanceCents)}</strong>
                    </div>
                    <div className="slot-meter">
                      <span>Last spin</span>
                      <strong>{slotResult ? formatMoney(slotResult.netCents) : '$0.00'}</strong>
                    </div>
                    <div className="slot-bet-panel">
                      <label className="form-label" htmlFor="slotBet">Stake</label>
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
                    <button className="slot-spin-button" type="button" disabled={spinning} onClick={spinSlot}>
                      {spinning ? 'Spinning' : 'Spin'}
                    </button>
                  </div>
                </div>

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
                            <small>Stake {formatMoney(item.betCents)}</small>
                          </span>
                          <span>{formatMoney(item.balanceAfterCents)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              )}

              {user.isAdmin && activeView === 'cashier' && (
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
                      <span>Current RTP {slotConfig ? `${slotConfig.rtpPercent}%` : 'loading'}</span>
                      <button className="btn btn-primary" type="submit" disabled={adminSaving}>
                        {adminSaving ? 'Saving...' : 'Save slot settings'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
              </div>
            </div>
          ) : (
            <div className="auth-card shadow-lg">
              <div className="mb-4">
                <h2>{title}</h2>
                <p className="text-secondary mb-0">Use the header to switch between login and registration.</p>
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
