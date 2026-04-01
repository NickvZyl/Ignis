const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

export const api = (path: string) => `${API_BASE}${path}`;
