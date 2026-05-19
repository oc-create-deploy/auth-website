import React, { useEffect, useMemo, useState } from 'react';
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

function App() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [amount, setAmount] = useState('250');
  const [message, setMessage] = useState('');
  const [user, setUser] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [depositing, setDepositing] = useState(false);

  const token = localStorage.getItem('authToken');
  const title = mode === 'login' ? 'Access account' : 'Request membership';
  const submitLabel = mode === 'login' ? 'Sign in' : 'Register';

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

  async function loadDeposits() {
    const data = await apiRequest('/api/deposits');
    setDeposits(data.deposits || []);
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

  function logout() {
    localStorage.removeItem('authToken');
    setUser(null);
    setDeposits([]);
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
                <button type="button" className="btn btn-outline-primary btn-sm" onClick={logout}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`btn btn-sm ${mode === 'login' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setMode('login')}
                >
                  Login
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${mode === 'register' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setMode('register')}
                >
                  Register
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="auth-shell container">
        <div className="row min-vh-100 align-items-center g-4 py-5">
          <div className="col-lg-6">
            <div className="intro pe-lg-5">
              <span className="eyebrow mb-3">Private access</span>
              <h1>{user ? 'Cashier for selected members' : 'Members-only authentication'}</h1>
              <p>
                {user
                  ? 'Deposit funds, review recent cashier activity, and keep your private balance visible from the header.'
                  : 'A refined login and registration experience for exclusive digital products, backed by Express, MySQL, and a Cloakd-ready cashier.'}
              </p>
              <div className="status-grid">
                <div>
                  <strong>Cashier</strong>
                  <span>Cloakd-ready deposits</span>
                </div>
                <div>
                  <strong>Ledger</strong>
                  <span>MySQL balances</span>
                </div>
                <div>
                  <strong>Access</strong>
                  <span>JWT sessions</span>
                </div>
              </div>
            </div>
          </div>

          <div className="col-lg-6">
            {user ? (
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
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
