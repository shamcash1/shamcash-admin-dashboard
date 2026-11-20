import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://cnjsrlfggdviuzpgpnso.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_nlGdq-99HG3MYESfqmQQ3w_sW0KNrvf';
export const API_ROOT_URL = 'https://shamcash-proxy-api.vercel.app';
export const SUB_BASE_URL = `${API_ROOT_URL}/sub`;

export const HAPP_IOS_URL = 'https://apps.apple.com/us/app/happ-proxy-utility/id6504287215';
export const HAPP_ANDROID_APK_URL =
  'https://github.com/Happ-proxy/happ-android/releases/latest/download/Happ.apk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export type ServiceMode = 'shamcash_sy' | 'residential_custom' | 'external_v2ray';
export type ProxyProvider = 'nodemaven' | 'dataimpulse';

export const SYSTEM_ROUTING_RULES_USERNAME = '__system_routing_rules__';
export const SYSTEM_EXTERNAL_V2RAY_USERNAME = '__system_external_v2ray_sources__';

export interface CountryOption {
  code: string;
  nameAr: string;
  nameEn: string;
  flag: string;
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'SY', nameAr: 'سوريا', nameEn: 'Syria', flag: '🇸🇾' },
  { code: 'US', nameAr: 'الولايات المتحدة', nameEn: 'United States', flag: '🇺🇸' },
  { code: 'GB', nameAr: 'المملكة المتحدة', nameEn: 'United Kingdom', flag: '🇬🇧' },
  { code: 'DE', nameAr: 'ألمانيا', nameEn: 'Germany', flag: '🇩🇪' },
  { code: 'FR', nameAr: 'فرنسا', nameEn: 'France', flag: '🇫🇷' },
  { code: 'NL', nameAr: 'هولندا', nameEn: 'Netherlands', flag: '🇳🇱' },
  { code: 'TR', nameAr: 'تركيا', nameEn: 'Turkey', flag: '🇹🇷' },
  { code: 'AE', nameAr: 'الإمارات', nameEn: 'UAE', flag: '🇦🇪' },
  { code: 'SA', nameAr: 'السعودية', nameEn: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'QA', nameAr: 'قطر', nameEn: 'Qatar', flag: '🇶🇦' },
  { code: 'KW', nameAr: 'الكويت', nameEn: 'Kuwait', flag: '🇰🇼' },
  { code: 'EG', nameAr: 'مصر', nameEn: 'Egypt', flag: '🇪🇬' },
  { code: 'JO', nameAr: 'الأردن', nameEn: 'Jordan', flag: '🇯🇴' },
  { code: 'LB', nameAr: 'لبنان', nameEn: 'Lebanon', flag: '🇱🇧' },
  { code: 'IQ', nameAr: 'العراق', nameEn: 'Iraq', flag: '🇮🇶' },
  { code: 'CA', nameAr: 'كندا', nameEn: 'Canada', flag: '🇨🇦' },
  { code: 'IT', nameAr: 'إيطاليا', nameEn: 'Italy', flag: '🇮🇹' },
  { code: 'ES', nameAr: 'إسبانيا', nameEn: 'Spain', flag: '🇪🇸' },
  { code: 'CH', nameAr: 'سويسرا', nameEn: 'Switzerland', flag: '🇨🇭' },
  { code: 'SE', nameAr: 'السويد', nameEn: 'Sweden', flag: '🇸🇪' },
  { code: 'SG', nameAr: 'سنغافورة', nameEn: 'Singapore', flag: '🇸🇬' },
  { code: 'JP', nameAr: 'اليابان', nameEn: 'Japan', flag: '🇯🇵' },
  { code: 'AU', nameAr: 'أستراليا', nameEn: 'Australia', flag: '🇦🇺' },
  { code: 'AUTO', nameAr: 'متعدد الدول', nameEn: 'Global / Multi', flag: '🌐' },
];

export function getCountryInfo(code?: string | null): CountryOption {
  const normalized = String(code || '').trim().toUpperCase();
  const found = COUNTRY_OPTIONS.find((c) => c.code === normalized);
  if (found) return found;
  if (normalized && normalized.length === 2) {
    return { code: normalized, nameAr: normalized, nameEn: normalized, flag: '🌍' };
  }
  return { code: 'AUTO', nameAr: 'متعدد الدول', nameEn: 'Global', flag: '🌐' };
}

export interface ExternalV2RayUserinfo {
  status?: 'ok' | 'no_header' | 'error';
  upload?: number;
  download?: number;
  total?: number;
  expire?: number;
  used_bytes?: number;
  used_mb?: number;
  total_mb?: number;
  remaining_mb?: number;
  usage_pct?: number;
  near_limit?: boolean;
  expire_soon?: boolean;
  raw_header?: string;
  error_msg?: string | null;
  checked_at?: string;
}

export interface ExternalV2RaySource {
  id: string;
  name: string;
  source_url: string;
  kind?: 'http_subscription' | 'direct_links';
  country_code?: string;
  notes?: string;
  server_count?: number;
  protocols?: string[];
  userinfo?: ExternalV2RayUserinfo | null;
  created_at?: string;
  updated_at?: string;
}

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
  service_mode?: ServiceMode;
  proxy_provider?: ProxyProvider;
  country_code?: string;
  external_source_id?: string | null;
  external_custom_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ClientComputedStatus = 'active' | 'expired' | 'inactive';

export function isSystemConfigUsername(username?: string | null): boolean {
  const u = String(username || '').trim();
  return u === SYSTEM_ROUTING_RULES_USERNAME || u === SYSTEM_EXTERNAL_V2RAY_USERNAME;
}

/**
 * Unpacks embedded "user:pass@host#limit=500&used=12.5&mode=...&provider=...&country=..."
 * from proxy_host while remaining 100% backward-compatible with legacy ShamCash rows.
 */
export function normalizeProxyClient(raw: ProxyClient): ProxyClient {
  let host = String(raw.proxy_host || '').trim();
  let pUser = raw.proxy_username ? String(raw.proxy_username).trim() : null;
  let pPass = raw.proxy_password ? String(raw.proxy_password).trim() : null;
  let quotaMb = typeof raw.quota_mb === 'number' ? raw.quota_mb : 0;
  let usedMb = typeof raw.used_mb === 'number' ? raw.used_mb : 0;
  let serviceMode: ServiceMode = raw.service_mode || 'shamcash_sy';
  let proxyProvider: ProxyProvider = raw.proxy_provider || 'nodemaven';
  let countryCode = raw.country_code ? String(raw.country_code).trim().toUpperCase() : '';
  let externalSourceId: string | null = raw.external_source_id ?? null;
  let externalCustomUrl: string | null = raw.external_custom_url ?? null;

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
    const rawMode = String(params.get('mode') || '').trim();
    if (
      rawMode === 'shamcash_sy' ||
      rawMode === 'residential_custom' ||
      rawMode === 'external_v2ray'
    ) {
      serviceMode = rawMode;
    }
    const rawProvider = String(params.get('provider') || '').trim().toLowerCase();
    if (rawProvider === 'nodemaven' || rawProvider === 'dataimpulse') {
      proxyProvider = rawProvider;
    }
    const rawCountry = String(params.get('country') || '').trim().toUpperCase();
    if (rawCountry) {
      countryCode = rawCountry;
    }
    if (params.has('source_id')) {
      externalSourceId = String(params.get('source_id') || '').trim() || null;
    }
    if (params.has('ext_url')) {
      externalCustomUrl = String(params.get('ext_url') || '').trim() || null;
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

  if (host.toLowerCase().includes('dataimpulse') || (pUser && pUser.includes('__cr.'))) {
    proxyProvider = 'dataimpulse';
  }

  if (!countryCode && pUser) {
    const nmMatch = pUser.match(/-country-([a-zA-Z]{2})/i);
    const diMatch = pUser.match(/__cr\.([a-zA-Z]{2})/i);
    if (nmMatch) countryCode = nmMatch[1].toUpperCase();
    else if (diMatch) countryCode = diMatch[1].toUpperCase();
  }

  if (!countryCode) {
    countryCode = serviceMode === 'external_v2ray' ? 'AUTO' : 'SY';
  }

  return {
    ...raw,
    proxy_host: host,
    proxy_username: pUser,
    proxy_password: pPass,
    quota_mb: quotaMb,
    used_mb: usedMb,
    service_mode: serviceMode,
    proxy_provider: proxyProvider,
    country_code: countryCode,
    external_source_id: externalSourceId,
    external_custom_url: externalCustomUrl,
  };
}

/**
 * Packs "user:pass@host#limit=...&used=..." into proxy_host when saving to Supabase.
 * CRITICAL: For 'shamcash_sy', preserves the EXACT original format with zero extra fragment keys.
 */
export function packProxyHostWithAuth(
  host: string,
  username?: string | null,
  password?: string | null,
  quotaMb?: number,
  usedMb?: number,
  meta?: {
    service_mode?: ServiceMode;
    proxy_provider?: ProxyProvider;
    country_code?: string;
    external_source_id?: string | null;
    external_custom_url?: string | null;
  }
): string {
  const cleanHost = host
    .trim()
    .replace(/#.*$/, '')
    .replace(/^.*@/, '');
  const u = username ? username.trim() : '';
  const p = password ? password.trim() : '';
  const base = u && p ? `${u}:${p}@${cleanHost}` : cleanHost;

  const mode = meta?.service_mode || 'shamcash_sy';
  if (mode === 'shamcash_sy') {
    if (typeof quotaMb === 'number' && quotaMb > 0) {
      const usedVal =
        typeof usedMb === 'number' && !Number.isNaN(usedMb) ? Number(usedMb.toFixed(2)) : 0;
      return `${base}#limit=${quotaMb}&used=${usedVal}`;
    }
    return base;
  }

  const params = new URLSearchParams();
  if (typeof quotaMb === 'number' && quotaMb > 0) {
    const usedVal =
      typeof usedMb === 'number' && !Number.isNaN(usedMb) ? Number(usedMb.toFixed(2)) : 0;
    params.set('limit', String(quotaMb));
    params.set('used', String(usedVal));
  }
  params.set('mode', mode);
  if (mode === 'residential_custom') {
    params.set('provider', meta?.proxy_provider || 'nodemaven');
    params.set('country', (meta?.country_code || 'US').toUpperCase());
  } else if (mode === 'external_v2ray') {
    params.set('country', (meta?.country_code || 'AUTO').toUpperCase());
    if (meta?.external_source_id) params.set('source_id', meta.external_source_id);
    if (meta?.external_custom_url) params.set('ext_url', meta.external_custom_url);
  }

  const qs = params.toString();
  return qs ? `${base}#${qs}` : base;
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
 * Builds a dynamic Sticky Session username for either NodeMaven or DataImpulse in custom residential mode.
 */
export function buildResidentialProxyUsername(
  provider: ProxyProvider,
  baseUser: string,
  countryCode: string,
  sessionId?: string,
  ttlMinutes = 60
): { fullProxyUsername: string; sessionId: string } {
  const cc = (countryCode || 'US').trim().toLowerCase().slice(0, 2) || 'us';
  const rawBase = String(baseUser || 'user').trim();
  const cleanBase = rawBase.includes('-country-')
    ? rawBase.split('-country-')[0].trim()
    : rawBase.includes('__')
    ? rawBase.split('__')[0].trim()
    : rawBase;

  if (provider === 'dataimpulse') {
    const sid = (sessionId || generateNodeMavenSessionId()).slice(0, 10);
    const safeTtl = Math.max(1, Math.min(120, Math.round(ttlMinutes || 60)));
    return {
      fullProxyUsername: `${cleanBase}__cr.${cc};sessid.${sid};sessttl.${safeTtl}`,
      sessionId: sid,
    };
  }

  const sid = sessionId || generateNodeMavenSessionId();
  return {
    fullProxyUsername: `${cleanBase}-country-${cc}-sid-${sid}-filter-medium-norotate-true`,
    sessionId: sid,
  };
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

/**
 * Provider-aware Sticky Session regenerator for Residential Custom mode (NodeMaven or DataImpulse).
 */
export function regenerateProxyUsernameForMode(
  provider: ProxyProvider,
  currentProxyUsername?: string | null,
  fallbackSubUser?: string,
  countryCode = 'US',
  ttlMinutes = 60
): {
  newProxyUsername: string;
  newSessionId: string;
  oldSessionId: string | null;
} {
  const raw = (currentProxyUsername || '').trim();
  const cc = (countryCode || 'US').trim().toLowerCase().slice(0, 2) || 'us';

  if (provider === 'dataimpulse') {
    const oldMatch = raw.match(/;sessid\.([a-zA-Z0-9]+)/i);
    const oldSessionId = oldMatch ? oldMatch[1] : null;
    const newSessionId = generateNodeMavenSessionId(oldSessionId).slice(0, 10);
    const baseUser = raw.includes('__')
      ? raw.split('__')[0].trim()
      : raw || (fallbackSubUser || 'user').trim().replace(/\s+/g, '');
    const ttlMatch = raw.match(/;sessttl\.(\d+)/i);
    const ttl = ttlMatch ? Number(ttlMatch[1]) : ttlMinutes;
    return {
      newProxyUsername: `${baseUser}__cr.${cc};sessid.${newSessionId};sessttl.${ttl}`,
      newSessionId,
      oldSessionId,
    };
  }

  const oldMatch = raw.match(/-sid-([a-zA-Z0-9]+)/i);
  const oldSessionId = oldMatch ? oldMatch[1] : null;
  const newSessionId = generateNodeMavenSessionId(oldSessionId);
  const baseUser = raw.includes('-country-')
    ? raw.split('-country-')[0].trim()
    : raw.includes('__')
    ? raw.split('__')[0].trim()
    : raw || (fallbackSubUser || 'user').trim().replace(/\s+/g, '');

  return {
    newProxyUsername: `${baseUser}-country-${cc}-sid-${newSessionId}-filter-medium-norotate-true`,
    newSessionId,
    oldSessionId,
  };
}

export function parseProxyDetails(client: ProxyClient): {
  cleanHost: string;
  subUser: string | null;
  sessionId: string | null;
  countryCode: string | null;
  isNodeMaven: boolean;
  isDataImpulse: boolean;
  provider: ProxyProvider;
  serviceMode: ServiceMode;
  hasAuth: boolean;
  fullProxyUsername: string;
} {
  const cleanHost = String(client.proxy_host || '').replace(/#.*$/, '').replace(/^.*@/, '').trim();
  const rawUser = client.proxy_username ? String(client.proxy_username).trim() : '';
  const serviceMode: ServiceMode = client.service_mode || 'shamcash_sy';
  const isDataImpulse =
    client.proxy_provider === 'dataimpulse' ||
    cleanHost.toLowerCase().includes('dataimpulse') ||
    rawUser.includes('__cr.');
  const isNodeMaven = !isDataImpulse && cleanHost.toLowerCase().includes('nodemaven');
  const provider: ProxyProvider = isDataImpulse ? 'dataimpulse' : 'nodemaven';
  const hasAuth = Boolean(rawUser && client.proxy_password);

  if (!rawUser) {
    return {
      cleanHost,
      subUser: null,
      sessionId: null,
      countryCode: client.country_code || (serviceMode === 'external_v2ray' ? 'AUTO' : 'SY'),
      isNodeMaven,
      isDataImpulse,
      provider,
      serviceMode,
      hasAuth,
      fullProxyUsername: '',
    };
  }

  let subUser = rawUser;
  let sessionId: string | null = null;
  let countryCode: string | null = client.country_code || null;

  if (rawUser.includes('__')) {
    subUser = rawUser.split('__')[0].trim();
    const diCountry = rawUser.match(/__cr\.([a-zA-Z]{2})/i);
    if (diCountry) countryCode = diCountry[1].toUpperCase();
    const diSid = rawUser.match(/;sessid\.([a-zA-Z0-9]+)/i);
    if (diSid) sessionId = diSid[1];
  } else if (rawUser.includes('-country-')) {
    subUser = rawUser.split('-country-')[0].trim();
    const countryMatch = rawUser.match(/-country-([a-zA-Z]{2})/i);
    if (countryMatch) countryCode = countryMatch[1].toUpperCase();
    const sidMatch = rawUser.match(/-sid-([a-zA-Z0-9]+)/i);
    if (sidMatch) sessionId = sidMatch[1];
  } else {
    const sidMatch = rawUser.match(/-sid-([a-zA-Z0-9]+)/i);
    if (sidMatch) sessionId = sidMatch[1];
  }

  return {
    cleanHost,
    subUser,
    sessionId,
    countryCode: countryCode || (serviceMode === 'external_v2ray' ? 'AUTO' : 'SY'),
    isNodeMaven,
    isDataImpulse,
    provider,
    serviceMode,
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
  country_code?: string;
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
    error: 'تعذر الاتصال بالخادم الرئيسي لإنشاء البروكسي الجديد',
  };
}

// ============================================================
// External V2Ray Sources API Helpers
// ============================================================
export async function fetchExternalV2RaySources(refresh = false): Promise<{
  success: boolean;
  sources: ExternalV2RaySource[];
  error?: string;
}> {
  const suffix = refresh ? '?refresh=1' : '';
  const endpoints = [
    `/api/external-v2ray/sources${suffix}`,
    `${API_ROOT_URL}/api/external-v2ray/sources${suffix}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.success && Array.isArray(data.sources)) {
        return { success: true, sources: data.sources };
      }
    } catch {
      // try next endpoint
    }
  }
  return { success: false, sources: [], error: 'تعذر جلب مصادر V2Ray الخارجية' };
}

export async function saveExternalV2RaySource(payload: {
  id?: string;
  name: string;
  source_url: string;
  country_code?: string;
  notes?: string;
}): Promise<{
  success: boolean;
  source?: ExternalV2RaySource;
  sources?: ExternalV2RaySource[];
  error?: string;
}> {
  const endpoints = [
    '/api/external-v2ray/sources',
    `${API_ROOT_URL}/api/external-v2ray/sources`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        return data;
      }
      if (data?.error) {
        return { success: false, error: data.error };
      }
    } catch {
      // try next endpoint
    }
  }
  return { success: false, error: 'تعذر حفظ المصدر الخارجي' };
}

export async function deleteExternalV2RaySource(id: string): Promise<{
  success: boolean;
  sources?: ExternalV2RaySource[];
  error?: string;
}> {
  const encodedId = encodeURIComponent(id);
  const endpoints = [
    `/api/external-v2ray/sources/${encodedId}`,
    `${API_ROOT_URL}/api/external-v2ray/sources/${encodedId}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data?.success) {
        return data;
      }
      if (data?.error) {
        return { success: false, error: data.error };
      }
    } catch {
      // try next endpoint
    }
  }
  return { success: false, error: 'تعذر حذف المصدر الخارجي' };
}

export async function probeExternalV2RaySourceApi(params: {
  source_url?: string;
  source_id?: string;
}): Promise<{
  success: boolean;
  probe?: {
    status: string;
    kind?: string;
    server_count: number;
    protocols: string[];
    userinfo: ExternalV2RayUserinfo | null;
    error_msg: string | null;
    checked_at: string;
  };
  sources?: ExternalV2RaySource[];
  error?: string;
}> {
  const endpoints = [
    '/api/external-v2ray/probe',
    `${API_ROOT_URL}/api/external-v2ray/probe`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (res.ok && data) {
        return data;
      }
      if (data?.error) {
        return { success: false, error: data.error };
      }
    } catch {
      // try next endpoint
    }
  }
  return { success: false, error: 'تعذر فحص الرابط الخارجي' };
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
  const mode = client.service_mode || 'shamcash_sy';
  const country = getCountryInfo(client.country_code || 'SY');

  const appLine =
    platform === 'android'
      ? `🤖 *رابط تحميل تطبيق Happ (أندرويد):*\n${HAPP_ANDROID_APK_URL}`
      : `🍎 *رابط تحميل تطبيق Happ (آيفون - App Store):*\n${HAPP_IOS_URL}`;

  if (mode === 'shamcash_sy') {
    const quotaText =
      client.quota_mb && client.quota_mb > 0 ? formatDataMb(client.quota_mb) : 'مفتوحة (شام كاش)';
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

  if (mode === 'residential_custom') {
    const quotaText =
      client.quota_mb && client.quota_mb > 0 ? formatDataMb(client.quota_mb) : 'مفتوحة';
    return [
      `🌍 *VPN ALISHOP — بروكسي منزلي مخصص (${country.flag} ${country.nameAr})*`,
      `━━━━━━━━━━━━━━━━━━`,
      `👤 *المشترك:* ${client.username}`,
      `🌐 *الدولة المخصصة:* ${country.flag} ${country.nameAr} (${country.code})`,
      `📦 *الباقة المخصصة:* ${quotaText}`,
      `📅 *الصلاحية:* ${client.expiry_date} (${statusInfo.daysText})`,
      ``,
      appLine,
      ``,
      `🔑 *كود التفعيل المشفر (انسخه والصقه داخل التطبيق أو امسح الباركود المرفق):*`,
      encryptedLink,
    ].join('\n');
  }

  return [
    `⚡ *VPN ALISHOP — اشتراك VPN عام (${country.flag} ${country.nameAr})*`,
    `━━━━━━━━━━━━━━━━━━`,
    `👤 *المشترك:* ${client.username}`,
    `🌐 *السيرفر / الدولة:* ${country.flag} ${country.nameAr}`,
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
