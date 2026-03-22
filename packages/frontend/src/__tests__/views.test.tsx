import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from '../router.js';
import { LoginGate } from '../components/login-gate.js';
import { useAuthStore } from '../stores/auth-store.js';

// Default API responses for known endpoints
const defaultResponses: Record<string, unknown> = {
  '/api/code-changes/history': { items: [], total: 0, limit: 50, offset: 0 },
  '/api/code-changes': { items: [], total: 0, limit: 50, offset: 0 },
  '/api/projects': [],
  '/api/members': [],
  '/api/evaluations': { items: [], total: 0, limit: 20, offset: 0 },
  '/api/workload/charts/bar': { startDate: '', endDate: '', data: [] },
  '/api/workload/charts/trend': { startDate: '', endDate: '', data: [] },
  '/api/workload/charts/heatmap': {
    startDate: '',
    endDate: '',
    members: [],
    projects: [],
    cells: [],
    maxCommits: 0,
  },
  '/api/workload': { startDate: '', endDate: '', byMember: [], byProject: [] },
  '/api/ai/status': { total: 0, completed: 0, failed: 0, processing: false },
  '/api/credentials': [],
  '/api/ai-providers': [],
  '/api/search': { changes: [], evaluations: [] },
};

function setupFetchMock(overrides: Record<string, unknown> = {}) {
  const merged = { ...defaultResponses, ...overrides };

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;

    // Check overrides first (more specific matches)
    for (const [pattern, data] of Object.entries(overrides)) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Then default responses
    for (const [pattern, data] of Object.entries(merged)) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

function renderApp(initialPath = '/') {
  window.history.pushState({}, '', initialPath);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

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

describe('Dashboard view', () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Dashboard heading', async () => {
    renderApp('/');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    });
  });

  it('shows empty state when no projects or members', async () => {
    renderApp('/');
    await waitFor(() => {
      expect(screen.getByText(/Welcome to Vantage/)).toBeInTheDocument();
    });
  });

  it('shows stat cards when data is present', async () => {
    vi.restoreAllMocks();
    setupFetchMock({
      '/api/projects': [
        {
          id: '1',
          name: 'TestProject',
          status: 'active',
          description: null,
          createdAt: '',
          updatedAt: '',
        },
      ],
      '/api/members': [{ id: '1', name: 'Alice', status: 'active', createdAt: '', updatedAt: '' }],
    });

    renderApp('/');
    await waitFor(() => {
      expect(screen.getByText('Pending Reviews')).toBeInTheDocument();
      expect(screen.getByText('Active Projects')).toBeInTheDocument();
      expect(screen.getByText('Team Members')).toBeInTheDocument();
    });
  });
});

describe('Review Queue view', () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Review Queue heading', async () => {
    renderApp('/reviews');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Review Queue' })).toBeInTheDocument();
    });
  });

  it('shows empty state when no pending items', async () => {
    renderApp('/reviews');
    await waitFor(() => {
      expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
    });
  });
});

describe('Review History view', () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Review History heading', async () => {
    renderApp('/reviews/history');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Review History' })).toBeInTheDocument();
    });
  });
});

describe('Members view', () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Members heading', async () => {
    renderApp('/members');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Members' })).toBeInTheDocument();
    });
  });

  it('shows empty state when no members', async () => {
    renderApp('/members');
    await waitFor(() => {
      expect(screen.getByText(/No members configured/)).toBeInTheDocument();
    });
  });
});

describe('Projects view', () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Projects heading', async () => {
    renderApp('/projects');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    });
  });

  it('shows empty state when no projects', async () => {
    renderApp('/projects');
    await waitFor(() => {
      expect(screen.getByText(/No projects configured/)).toBeInTheDocument();
    });
  });
});

describe('Evaluations view', () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Evaluations heading', async () => {
    renderApp('/evaluations');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Evaluations' })).toBeInTheDocument();
    });
  });

  it('shows tabs', async () => {
    renderApp('/evaluations');
    await waitFor(() => {
      expect(screen.getByText('Daily Check-Up')).toBeInTheDocument();
      expect(screen.getByText('Evaluation Log')).toBeInTheDocument();
      expect(screen.getByText('Quarterly')).toBeInTheDocument();
    });
  });
});

describe('Workload view', () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Workload heading', async () => {
    renderApp('/workload');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Workload' })).toBeInTheDocument();
    });
  });
});

describe('Settings view', () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Settings heading', async () => {
    renderApp('/settings');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    });
  });

  it('shows all sub-sections in nav', async () => {
    renderApp('/settings');
    await waitFor(() => {
      // "Projects" and "Members" appear in sidebar + settings nav + section heading,
      // so we check they appear at least twice (sidebar + settings)
      expect(screen.getAllByText('Projects').length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('Members').length).toBeGreaterThanOrEqual(2);
      // These are unique to settings
      expect(screen.getByText('Credentials')).toBeInTheDocument();
      expect(screen.getByText('AI Provider')).toBeInTheDocument();
      expect(screen.getByText('Access Password')).toBeInTheDocument();
    });
  });
});

describe('Error handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dashboard handles API errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    renderApp('/');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    });
  });

  it('Review Queue handles API errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/api/code-changes')) {
        return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    renderApp('/reviews');
    await waitFor(() => {
      expect(screen.getByText(/Failed to load review queue/)).toBeInTheDocument();
    });
  });

  it('Members view handles API errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/api/members')) {
        return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    renderApp('/members');
    await waitFor(() => {
      expect(screen.getByText(/Failed to load members/)).toBeInTheDocument();
    });
  });
});
