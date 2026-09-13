import { ApiResponse } from '@/types/api';

const getBaseUrl = (): string => {
  const rawUrl = process.env.NEXT_PUBLIC_API_URL || 'https://weathergpt-owqw.onrender.com';
  return rawUrl.replace(/\/+$/, '');
};

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('weathergpt_token') : null;
  const baseUrl = getBaseUrl();
  const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullUrl = `${baseUrl}${formattedEndpoint}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      ...options,
      headers,
    });
  } catch (err: any) {
    console.error(`[API Error] Failed to fetch from ${fullUrl}:`, err);
    throw new Error(
      `Failed to connect to backend server (${fullUrl}). Please ensure NEXT_PUBLIC_API_URL environment variable is configured correctly and CORS is enabled.`
    );
  }

  const payload = await response.json();

  if (!response.ok) {
    const errorMsg =
      (Array.isArray(payload.message) ? payload.message.join(', ') : payload.message) ||
      payload.error ||
      'API Request failed';
    throw new Error(errorMsg);
  }

  // If response is already an ApiResponse envelope with data
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data) {
    return payload as ApiResponse<T>;
  }

  // Wrap raw server response in ApiResponse
  return {
    success: true,
    statusCode: response.status,
    message: 'Success',
    data: payload as T,
    errors: null,
    timestamp: new Date().toISOString(),
  };
}