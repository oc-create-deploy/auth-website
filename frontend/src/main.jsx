import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles.css';

const apiUrl = import.meta.env.VITE_API_URL || '';

function App() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const title = mode === 'login' ? 'Welcome back' : 'Create account';
  const submitLabel = mode === 'login' ? 'Sign in' : 'Register';

  const passwordHint = useMemo(() => {
    if (mode === 'login') {
      return '';
    }

    return password.length >= 8 ? 'Password length looks good.' : 'Use at least 8 characters.';
  }, [mode, password]);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch(`${apiUrl}/api/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Request failed.');
      }

      localStorage.setItem('authToken', data.token);
      setUser(data.user);
      setMessage(mode === 'login' ? 'Signed in successfully.' : 'Account created successfully.');
      setPassword('');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem('authToken');
    setUser(null);
    setMessage('Signed out.');
  }

  return (
    <main className="auth-page">
      <section className="auth-shell container">
        <div className="row min-vh-100 align-items-center g-4 py-4">
          <div className="col-lg-6">
            <div className="intro pe-lg-5">
              <span className="eyebrow mb-3">Private access</span>
              <h1>Members-only authentication</h1>
              <p>
                A refined login and registration experience for exclusive digital products, backed by Express and MySQL.
              </p>
              <div className="status-grid">
                <div>
                  <strong>Frontend</strong>
                  <span>Tailored interface</span>
                </div>
                <div>
                  <strong>Backend</strong>
                  <span>Secure API</span>
                </div>
                <div>
                  <strong>Database</strong>
                  <span>Private records</span>
                </div>
              </div>
            </div>
          </div>

          <div className="col-lg-6">
            <div className="auth-card shadow-lg">
              <div className="d-flex justify-content-between align-items-start gap-3 mb-4">
                <div>
                  <h2>{user ? 'Account' : title}</h2>
                  <p className="text-secondary mb-0">
                    {user ? 'You are signed in.' : 'Use your email and password to continue.'}
                  </p>
                </div>
                {!user && (
                  <div className="btn-group" role="group" aria-label="Authentication mode">
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
                  </div>
                )}
              </div>

              {user ? (
                <div className="signed-in">
                  <div className="account-line">
                    <span>Email</span>
                    <strong>{user.email}</strong>
                  </div>
                  <button type="button" className="btn btn-outline-dark w-100 mt-4" onClick={logout}>
                    Sign out
                  </button>
                </div>
              ) : (
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
              )}

              {message && (
                <div className="alert alert-info mt-4 mb-0" role="status">
                  {message}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
