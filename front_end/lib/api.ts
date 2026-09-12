import { ApiResponse } from '@/types/api';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('weathergpt_token') : null;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

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