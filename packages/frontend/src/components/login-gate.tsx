import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../stores/auth-store.js';
import { apiClient } from '../lib/api-client.js';

interface LoginGateProps {
  children: React.ReactNode;
}

export function LoginGate({ children }: LoginGateProps) {
  const { isAuthenticated, passwordRequired, setToken } = useAuthStore();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!passwordRequired || isAuthenticated) {
    return <>{children}</>;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiClient.post<{ token: string }>('/api/auth/login', { password });
      setToken(res.token);
    } catch {
      setError('Invalid password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div data-testid="login-gate" className="flex items-center justify-center h-screen bg-base">
      <div className="w-full max-w-sm p-6 bg-surface border border-border rounded-lg">
        <h1 className="text-lg font-semibold text-text-primary mb-1">Vantage</h1>
        <p className="text-sm text-text-secondary mb-6">Enter the access password to continue.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-3 py-2 bg-surface-raised border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
            autoFocus
          />
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="mt-4 w-full py-2 bg-accent text-white text-sm rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
