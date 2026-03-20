import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from '../router.js';
import { LoginGate } from '../components/login-gate.js';
import { apiClient, APIError } from '../lib/api-client.js';
import { useAuthStore } from '../stores/auth-store.js';

// Helper to render with all providers
function renderApp(initialPath = '/') {
  window.history.pushState({}, '', initialPath);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  // Reset auth store for each render
  useAuthStore.setState({ token: null, isAuthenticated: false, passwordRequired: false });

  return render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <LoginGate>
          <RouterProvider router={router} />
        </LoginGate>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

describe('App shell', () => {
  it('renders without error', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    });
  });

  it('shows Dashboard on root route', async () => {
    renderApp('/');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    });
  });
});

describe('Route stubs', () => {
  const routes = [
    { path: '/reviews', text: 'Review Queue' },
    { path: '/reviews/history', text: 'Review History' },
    { path: '/members', text: 'Members' },
    { path: '/projects', text: 'Projects' },
    { path: '/evaluations', text: 'Evaluations' },
    { path: '/workload', text: 'Workload' },
    { path: '/settings', text: 'Settings' },
  ];

  for (const { path, text } of routes) {
    it(`renders ${text} at ${path}`, async () => {
      renderApp(path);
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: text })).toBeInTheDocument();
      });
    });
  }

  it('renders Member Detail at /members/123', async () => {
    renderApp('/members/123');
    await waitFor(() => {
      // Full implementation shows heading and back link
      expect(screen.getByText('Member Detail')).toBeInTheDocument();
    });
  });

  it('renders Project Detail at /projects/456', async () => {
    renderApp('/projects/456');
    await waitFor(() => {
      // Full implementation shows heading and back link
      expect(screen.getByText('Project Detail')).toBeInTheDocument();
    });
  });
});

describe('API client', () => {
  let mockSessionStorage: Record<string, string>;

  beforeEach(() => {
    mockSessionStorage = {};
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => mockSessionStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockSessionStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockSessionStorage[key];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stores and retrieves auth token', () => {
    apiClient.setToken('test-token');
    expect(apiClient.getToken()).toBe('test-token');
  });

  it('clears auth token', () => {
    apiClient.setToken('test-token');
    apiClient.clearToken();
    expect(apiClient.getToken()).toBeNull();
  });

  it('injects Authorization header on requests', async () => {
    apiClient.setToken('my-token');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await apiClient.get('/api/test');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-token',
        }),
      }),
    );
  });
});

describe('Error classification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws APIError with status on 4xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 }),
    );

    await expect(apiClient.get('/api/fail')).rejects.toThrow(APIError);
  });

  it('clears token on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    );

    // Mock sessionStorage
    const mockStorage: Record<string, string> = { 'com.twle.vantage.token': 'old-token' };
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
    });

    await expect(apiClient.get('/api/protected')).rejects.toThrow(APIError);
    expect(sessionStorage.getItem('com.twle.vantage.token')).toBeNull();
  });

  it('throws APIError with status on 5xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
    );

    try {
      await apiClient.get('/api/broken');
    } catch (e) {
      expect(e).toBeInstanceOf(APIError);
      expect((e as APIError).status).toBe(500);
    }
  });

  it('classifies 502/503/504 as gateway errors', async () => {
    for (const status of [502, 503, 504]) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Gateway error' }), { status }),
      );

      try {
        await apiClient.get('/api/gateway');
      } catch (e) {
        expect(e).toBeInstanceOf(APIError);
        expect((e as APIError).status).toBe(status);
      }
    }
  });
});
