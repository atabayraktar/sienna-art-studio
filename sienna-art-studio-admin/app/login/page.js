'use client';
import { useState } from 'react';

export default function Login() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const f = new FormData(e.target);
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: f.get('username'), password: f.get('password') }) });
    if (r.ok) { window.location.href = '/'; return; }
    setError((await r.json()).error || 'Login failed');
    setBusy(false);
  }
  return (
    <main className="wrap login">
      <form className="card" onSubmit={submit}>
        <h1>Sienna Admin</h1>
        <p className="muted">Sign in to upload products.</p>
        <label htmlFor="u">Username</label>
        <input id="u" name="username" type="text" autoComplete="username" required />
        <label htmlFor="p">Password</label>
        <input id="p" name="password" type="password" autoComplete="current-password" required />
        {error && <p className="bad" role="alert">{error}</p>}
        <p><button disabled={busy} type="submit">{busy ? 'Signing in...' : 'Sign in'}</button></p>
      </form>
    </main>
  );
}
