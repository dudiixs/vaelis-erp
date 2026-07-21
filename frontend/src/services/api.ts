const BASE_URL = 'http://localhost:8080';

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number>;
}

class ApiService {
  private token: string | null = localStorage.getItem('token');
  private impersonateTenantId: string | null = localStorage.getItem('impersonate_tenant_id');
  private impersonateUserId: string | null = localStorage.getItem('impersonate_user_id');

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  getToken() {
    return this.token;
  }

  setImpersonation(tenantId: string | null, userId: string | null) {
    this.impersonateTenantId = tenantId;
    this.impersonateUserId = userId;
    if (tenantId) {
      localStorage.setItem('impersonate_tenant_id', tenantId);
    } else {
      localStorage.removeItem('impersonate_tenant_id');
    }
    if (userId) {
      localStorage.setItem('impersonate_user_id', userId);
    } else {
      localStorage.removeItem('impersonate_user_id');
    }
  }

  getImpersonation() {
    return {
      tenantId: this.impersonateTenantId,
      userId: this.impersonateUserId,
    };
  }

  logout() {
    this.setToken(null);
    this.setImpersonation(null, null);
    localStorage.clear();
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    if (options.params) {
      Object.keys(options.params).forEach(key => 
        url.searchParams.append(key, String(options.params![key]))
      );
    }

    const headers = new Headers(options.headers || {});
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
    if (this.impersonateTenantId) {
      headers.set('X-Impersonate-Tenant-ID', this.impersonateTenantId);
    }
    if (this.impersonateUserId) {
      headers.set('X-Impersonate-User-ID', this.impersonateUserId);
    }
    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const config: RequestInit = {
      ...options,
      headers,
    };

    const response = await fetch(url.toString(), config);
    if (!response.ok) {
      let errorMsg = `Erro HTTP! Código: ${response.status}`;
      try {
        const errJson = await response.json();
        errorMsg = errJson.message || errJson.error || errorMsg;
      } catch (_) {}
      throw new Error(errorMsg);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  get<T>(path: string, options?: RequestOptions) {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: any, options?: RequestOptions) {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  put<T>(path: string, body?: any, options?: RequestOptions) {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  delete<T>(path: string, options?: RequestOptions) {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiService();
