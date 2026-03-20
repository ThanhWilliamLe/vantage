/**
 * API client with auth token management and error classification.
 * Wraps fetch for all backend communication.
 */

export class APIError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API error ${status}`);
    this.name = 'APIError';
  }
}

class APIClient {
  private baseUrl = '';

  getToken(): string | null {
    return sessionStorage.getItem('com.twle.vantage.token');
  }

  setToken(token: string): void {
    sessionStorage.setItem('com.twle.vantage.token', token);
  }

  clearToken(): void {
    sessionStorage.removeItem('com.twle.vantage.token');
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) {
      h['Authorization'] = `Bearer ${token}`;
    }
    return h;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const opts: RequestInit = {
      method,
      headers: this.headers(),
    };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${this.baseUrl}${path}`, opts);

    if (!res.ok) {
      let errorBody: unknown;
      try {
        errorBody = await res.json();
      } catch {
        errorBody = { message: res.statusText };
      }

      if (res.status === 401) {
        this.clearToken();
        window.location.hash = '#/login';
      }

      throw new APIError(res.status, errorBody);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    return res.json() as Promise<T>;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async del(path: string): Promise<void> {
    return this.request<void>('DELETE', path);
  }

  async getCsv(path: string): Promise<Blob> {
    const headers: Record<string, string> = { Accept: 'text/csv' };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, { headers });

    if (!res.ok) {
      let errorBody: unknown;
      try {
        errorBody = await res.json();
      } catch {
        errorBody = { message: res.statusText };
      }
      throw new APIError(res.status, errorBody);
    }

    return res.blob();
  }
}

export const apiClient = new APIClient();
