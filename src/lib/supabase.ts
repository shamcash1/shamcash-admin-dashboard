import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://cnjsrlfggdviuzpgpnso.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_nlGdq-99HG3MYESfqmQQ3w_sW0KNrvf';
export const SUB_BASE_URL = 'https://shamcash-proxy-api.vercel.app/sub';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export interface ProxyClient {
  id: string;
  username: string;
  is_active: boolean;
  expiry_date: string;
  proxy_host: string;
  proxy_port: number;
  proxy_username?: string | null;
  proxy_password?: string | null;
  registered_ip?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ClientComputedStatus = 'active' | 'expired' | 'inactive';

export function getClientSubUrl(username: string): string {
  return `${SUB_BASE_URL}/${encodeURIComponent(username.trim())}`;
}

export function getClientPacUrl(username: string): string {
  return getClientSubUrl(username);
}

export function getClientStatusInfo(client: ProxyClient): {
  status: ClientComputedStatus;
  label: string;
  daysText: string;
  daysDiff: number;
  isExpiringSoon: boolean;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(client.expiry_date);
  expiry.setHours(23, 59, 59, 999);

  const diffTime = expiry.getTime() - today.getTime();
  const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) - 1;

  let daysText = '';
  if (daysDiff > 0) {
    daysText = `متبقي ${daysDiff} يوم`;
  } else if (daysDiff === 0) {
    daysText = 'ينتهي اليوم';
  } else {
    daysText = `منتهي منذ ${Math.abs(daysDiff)} يوم`;
  }

  if (!client.is_active) {
    return {
      status: 'inactive',
      label: 'موقوف',
      daysText,
      daysDiff,
      isExpiringSoon: false,
    };
  }

  if (expiry < today) {
    return {
      status: 'expired',
      label: 'منتهي الصلاحية',
      daysText,
      daysDiff,
      isExpiringSoon: false,
    };
  }

  return {
    status: 'active',
    label: 'نشط',
    daysText,
    daysDiff,
    isExpiringSoon: daysDiff <= 5,
  };
}

export function addDaysToDateString(baseDateStr: string | null, daysToAdd: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let startDate = today;
  if (baseDateStr) {
    const parsed = new Date(baseDateStr);
    if (!isNaN(parsed.getTime()) && parsed > today) {
      startDate = parsed;
    }
  }

  const target = new Date(startDate);
  target.setDate(target.getDate() + daysToAdd);

  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
