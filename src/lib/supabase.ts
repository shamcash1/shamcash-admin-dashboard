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
  quota_mb?: number;
  used_mb?: number;
  registered_ip?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ClientComputedStatus = 'active' | 'expired' | 'inactive';

/**
 * Unpacks embedded "user:pass@host#limit=500&used=12.5" from proxy_host if proxy_username/proxy_password
 * and quota/usage metadata were stored inside proxy_host.
 */
export function normalizeProxyClient(raw: ProxyClient): ProxyClient {
  let host = String(raw.proxy_host || '').trim();
  let pUser = raw.proxy_username ? String(raw.proxy_username).trim() : null;
  let pPass = raw.proxy_password ? String(raw.proxy_password).trim() : null;
  let quotaMb = typeof raw.quota_mb === 'number' ? raw.quota_mb : 0;
  let usedMb = typeof raw.used_mb === 'number' ? raw.used_mb : 0;

  if (host.includes('#')) {
    const hashIndex = host.indexOf('#');
    const hashPart = host.slice(hashIndex + 1);
    host = host.slice(0, hashIndex).trim();
    const params = new URLSearchParams(hashPart);
    if (params.has('limit')) {
      const parsedLimit = Number(params.get('limit'));
      if (!Number.isNaN(parsedLimit) && parsedLimit >= 0) quotaMb = parsedLimit;
    }
    if (params.has('used')) {
      const parsedUsed = Number(params.get('used'));
      if (!Number.isNaN(parsedUsed) && parsedUsed >= 0) usedMb = parsedUsed;
    }
  }

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
    quota_mb: quotaMb,
    used_mb: usedMb,
  };
}

/**
 * Packs "user:pass@host" into proxy_host when saving to Supabase.
 */
export function packProxyHostWithAuth(
  host: string,
  username?: string | null,
  password?: string | null,
  quotaMb?: number,
  usedMb?: number
): string {
  const cleanHost = host
    .trim()
    .replace(/#.*$/, '')
    .replace(/^.*@/, '');
  const u = username ? username.trim() : '';
  const p = password ? password.trim() : '';
  const base = u && p ? `${u}:${p}@${cleanHost}` : cleanHost;
  if (typeof quotaMb === 'number' && quotaMb > 0) {
    const usedVal = typeof usedMb === 'number' && !Number.isNaN(usedMb) ? Number(usedMb.toFixed(2)) : 0;
    return `${base}#limit=${quotaMb}&used=${usedVal}`;
  }
  return base;
}

export function formatDataMb(mb: number = 0): string {
  if (mb <= 0) return '0 MB';
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(2)} GB`;
  }
  return `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

export function generateNodeMavenSessionId(excludeSid?: string | null): string {
  const makeSid = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '').slice(0, 13).toLowerCase();
    }
    const hex = '0123456789abcdef';
    let out = '';
    for (let i = 0; i < 12; i++) {
      out += hex[Math.floor(Math.random() * 16)];
    }
    return `${out}4`;
  };

  let nextSid = makeSid();
  let guard = 0;
  while (excludeSid && nextSid.toLowerCase() === excludeSid.toLowerCase() && guard < 10) {
    nextSid = makeSid();
    guard++;
  }
  return nextSid;
}

/**
 * Regenerates the NodeMaven proxy username for the same sub-user by replacing the sticky session ID (-sid-...)
 * while preserving the sub-user name, country, mobile/residential type, filter, norotate flags, and password.
 */
export function regenerateNodeMavenProxyUsername(
  currentProxyUsername?: string | null,
  fallbackSubUser?: string
): {
  newProxyUsername: string;
  newSessionId: string;
  oldSessionId: string | null;
} {
  const raw = (currentProxyUsername || '').trim();
  const sidMatch = raw.match(/-sid-([a-zA-Z0-9]+)/i);
  const oldSessionId = sidMatch ? sidMatch[1] : null;
  const newSessionId = generateNodeMavenSessionId(oldSessionId);

  if (!raw) {
    const cleanFallback = (fallbackSubUser || 'user').trim().replace(/\s+/g, '');
    return {
      newProxyUsername: `${cleanFallback}-country-sy-sid-${newSessionId}-filter-medium-norotate-true`,
      newSessionId,
      oldSessionId: null,
    };
  }

  if (sidMatch) {
    const newProxyUsername = raw.replace(/-sid-[a-zA-Z0-9]+/i, `-sid-${newSessionId}`);
    return {
      newProxyUsername,
      newSessionId,
      oldSessionId,
    };
  }

  if (raw.includes('-country-')) {
    return {
      newProxyUsername: `${raw}-sid-${newSessionId}-filter-medium-norotate-true`,
      newSessionId,
      oldSessionId: null,
    };
  }

  return {
    newProxyUsername: `${raw}-country-sy-sid-${newSessionId}-filter-medium-norotate-true`,
    newSessionId,
    oldSessionId: null,
  };
}

export function parseProxyDetails(client: ProxyClient): {
  cleanHost: string;
  subUser: string | null;
  sessionId: string | null;
  countryCode: string | null;
  isNodeMaven: boolean;
  hasAuth: boolean;
  fullProxyUsername: string;
} {
  const cleanHost = String(client.proxy_host || '').replace(/#.*$/, '').replace(/^.*@/, '').trim();
  const rawUser = client.proxy_username ? String(client.proxy_username).trim() : '';
  const isNodeMaven = cleanHost.toLowerCase().includes('nodemaven');
  const hasAuth = Boolean(rawUser && client.proxy_password);

  if (!rawUser) {
    return {
      cleanHost,
      subUser: null,
      sessionId: null,
      countryCode: null,
      isNodeMaven,
      hasAuth,
      fullProxyUsername: '',
    };
  }

  let subUser = rawUser;
  let sessionId: string | null = null;
  let countryCode: string | null = null;

  if (rawUser.includes('-country-')) {
    subUser = rawUser.split('-country-')[0].trim();
    const countryMatch = rawUser.match(/-country-([a-zA-Z]{2})/i);
    if (countryMatch) countryCode = countryMatch[1].toUpperCase();
  }
  const sidMatch = rawUser.match(/-sid-([a-zA-Z0-9]+)/i);
  if (sidMatch) sessionId = sidMatch[1];

  return {
    cleanHost,
    subUser,
    sessionId,
    countryCode,
    isNodeMaven,
    hasAuth,
    fullProxyUsername: rawUser,
  };
}

export function generateSubscriberWithPrefix(
  rawPrefix: string,
  existingUsernames: string[] = []
): string {
  const cleaned = (rawPrefix || 'alishop')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '') || 'alishop';

  // If user typed a specific name that doesn't exist yet, or wants sequential numbering:
  const existingSet = new Set(existingUsernames.map((u) => u.toLowerCase()));
  const basePrefix = cleaned.replace(/[0-9]+$/, '') || cleaned;

  for (let i = 1; i <= 9999; i++) {
    const candidate = `${basePrefix}${i}`;
    if (!existingSet.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return `${basePrefix}_${Date.now().toString().slice(-4)}`;
}

/**
 * Computes the next valid NodeMaven Sub-User name (>= 9 chars, ^[a-zA-Z0-9_]*$)
 * matching the parent dashboard's sequential naming (e.g. Ammarmedia -> Ammarmedia6, Alishop -> Alishop_01)
 */
export function previewNextNodeMavenSubUserName(
  rawPrefix: string,
  existingSubUsers: string[] = []
): string {
  let clean = String(rawPrefix || 'Ammarmedia')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');
  if (!clean) clean = 'Ammarmedia';

  const existingSet = new Set(existingSubUsers.map((u) => u.toLowerCase()));

  if (clean.length >= 9 && !existingSet.has(clean.toLowerCase()) && /[0-9]$/.test(clean)) {
    return clean;
  }

  const basePrefix = clean.replace(/[0-9]+$/, '') || clean;

  for (let i = 0; i <= 9999; i++) {
    let candidate = `${basePrefix}${i}`;
    if (candidate.length < 9) {
      const padLen = 9 - basePrefix.length;
      const paddedNum = String(i === 0 ? 1 : i).padStart(Math.max(2, padLen), '0');
      candidate = `${basePrefix}_${paddedNum}`.replace(/__+/g, '_');
      if (candidate.length < 9) {
        candidate = `${basePrefix}00${paddedNum}`.slice(0, 12);
      }
    }
    if (!existingSet.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `${basePrefix}_${Math.floor(10000 + Math.random() * 90000)}`;
}

export async function createNodeMavenSubUserLive(params: {
  proxy_prefix: string;
  quota_mb: number;
  proxy_host?: string;
}): Promise<{
  success: boolean;
  sub_user?: string;
  full_proxy_username?: string;
  proxy_password?: string;
  session_id?: string;
  quota_mb?: number;
  live_check?: {
    ok: boolean;
    exit_ip?: string;
    city?: string;
    isp?: string;
  };
  error?: string;
}> {
  const endpoints = [
    '/api/nodemaven/create-subuser',
    `${API_ROOT_URL}/api/nodemaven/create-subuser`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (res.ok && data?.success && data?.full_proxy_username) {
        return data;
      }
      if (data?.error) {
        return { success: false, error: data.error };
      }
    } catch {
      // try next endpoint
    }
  }

  return {
    success: false,
    error: 'تعذر الاتصال بـ API اللوحة الأم NodeMaven لإنشاء البروكسي الجديد',
  };
}

export function getQrCodeImageUrl(encryptedLink: string, size = 500): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=16&data=${encodeURIComponent(
    encryptedLink
  )}`;
}

export function buildCustomerActivationMessage(
  client: ProxyClient,
  encryptedLink: string,
  platform: 'android' | 'ios'
): string {
  const statusInfo = getClientStatusInfo(client);
  const quotaText =
    client.quota_mb && client.quota_mb > 0 ? formatDataMb(client.quota_mb) : 'مفتوحة (شام كاش)';
  const appLine =
    platform === 'android'
      ? `🤖 *رابط تحميل تطبيق Happ (أندرويد):*\n${HAPP_ANDROID_APK_URL}`
      : `🍎 *رابط تحميل تطبيق Happ (آيفون - App Store):*\n${HAPP_IOS_URL}`;

  return [
    `🛡️ *VPN ALISHOP — تفعيل شام كاش*`,
    `━━━━━━━━━━━━━━━━━━`,
    `👤 *المشترك:* ${client.username}`,
    `📦 *الباقة المخصصة:* ${quotaText}`,
    `📅 *الصلاحية:* ${client.expiry_date} (${statusInfo.daysText})`,
    ``,
    appLine,
    ``,
    `🔑 *كود التفعيل المشفر (انسخه والصقه داخل التطبيق أو امسح الباركود المرفق):*`,
    encryptedLink,
  ].join('\n');
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
