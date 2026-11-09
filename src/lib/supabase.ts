import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://cnjsrlfggdviuzpgpnso.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_nlGdq-99HG3MYESfqmQQ3w_sW0KNrvf';
export const API_ROOT_URL = 'https://shamcash-proxy-api.vercel.app';
export const SUB_BASE_URL = `${API_ROOT_URL}/sub`;

export const HAPP_IOS_URL = 'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215';
export const HAPP_ANDROID_APK_URL =
  'https://github.com/Happ-proxy/happ-android/releases/latest/download/Happ.apk';

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

/**
 * Unpacks embedded "user:pass@host" from proxy_host if proxy_username/proxy_password
 * were stored inside proxy_host.
 */
export function normalizeProxyClient(raw: ProxyClient): ProxyClient {
  let host = String(raw.proxy_host || '').trim();
  let pUser = raw.proxy_username ? String(raw.proxy_username).trim() : null;
  let pPass = raw.proxy_password ? String(raw.proxy_password).trim() : null;

  if (host.includes('@')) {
    const atIndex = host.lastIndexOf('@');
    const authPart = host.slice(0, atIndex);
    host = host.slice(atIndex + 1).trim();
    if (!pUser && authPart.includes(':')) {
      const colonIndex = authPart.indexOf(':');
      pUser = authPart.slice(0, colonIndex).trim() || null;
      pPass = authPart.slice(colonIndex + 1).trim() || null;
    }
  }

  return {
    ...raw,
    proxy_host: host,
    proxy_username: pUser,
    proxy_password: pPass,
  };
}

/**
 * Packs "user:pass@host" into proxy_host when saving to a table without separate auth columns.
 */
export function packProxyHostWithAuth(
  host: string,
  username?: string | null,
  password?: string | null
): string {
  const cleanHost = host.trim().replace(/^.*@/, '');
  const u = username ? username.trim() : '';
  const p = password ? password.trim() : '';
  if (u && p) {
    return `${u}:${p}@${cleanHost}`;
  }
  return cleanHost;
}

export function getClientSubUrl(username: string): string {
  return `${SUB_BASE_URL}/${encodeURIComponent(username.trim())}`;
}

export function getClientPacUrl(username: string): string {
  return getClientSubUrl(username);
}

/**
 * Generates an encrypted Happ link (happ://crypt5/...) that hides all proxy IP/Port/Credentials
 * and disables editing/sharing inside the Happ application on iOS and Android.
 */
export async function fetchHappEncryptedLink(username: string): Promise<string> {
  const cleanUsername = username.trim();
  const targetSubUrl = `${getClientSubUrl(cleanUsername)}?client=happ`;

  // 1. Try local/same-origin API route first (/api/happ/:username)
  try {
    const localRes = await fetch(`/api/happ/${encodeURIComponent(cleanUsername)}`);
    if (localRes.ok) {
      const data = await localRes.json();
      if (data?.encrypted_link) return data.encrypted_link;
    }
  } catch {
    // fallback to remote Vercel API
  }

  // 2. Try deployed Vercel API endpoint (https://shamcash-proxy-api.vercel.app/happ/:username)
  try {
    const remoteRes = await fetch(`${API_ROOT_URL}/happ/${encodeURIComponent(cleanUsername)}`);
    if (remoteRes.ok) {
      const data = await remoteRes.json();
      if (data?.encrypted_link) return data.encrypted_link;
    }
  } catch {
    // fallback to direct Happ Crypto API
  }

  // 3. Direct call to official Happ Crypto API
  const directRes = await fetch('https://crypto.happ.su/api-v2.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: targetSubUrl }),
  });

  if (!directRes.ok) {
    throw new Error('Failed to encrypt link for Happ');
  }

  const directData = await directRes.json();
  if (!directData?.encrypted_link) {
    throw new Error('Invalid encrypted link response');
  }

  return directData.encrypted_link;
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
