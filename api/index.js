// VPN ALISHOP - Strict Sham Cash Only Subscription & Routing API
import express from 'express';
import crypto from 'crypto';
import http from 'http';
import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cnjsrlfggdviuzpgpnso.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_nlGdq-99HG3MYESfqmQQ3w_sW0KNrvf';
const PUBLIC_API_BASE = process.env.PUBLIC_API_BASE || 'https://shamcash-proxy-api.vercel.app';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();

app.set('trust proxy', true);
app.use(express.json());

// Enable CORS for web clients, Admin Dashboard, and subscription apps (Happ, v2rayNG, V2Box, etc.)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, X-HWID, x-hwid, hwid, X-Device-OS, User-Agent'
  );
  res.header(
    'Access-Control-Expose-Headers',
    'profile-title, profile-update-interval, subscription-userinfo, subscription-always-hwid-enable, subscription-auto-update-enable, subscription-auto-update-open-enable, subscriptions-expand-now, hide-settings, routing-enable, ping-type, exclude-apns-enable, exclude-local-networks-enable, per-app-proxy-mode, per-app-proxy-list, per-app-proxy-list-set, exclude-routes, exclude-routes-set, no-limit-enabled, content-disposition'
  );
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Helper function to extract client IP address reliably on Vercel / proxies
function getCallerIp(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const raw = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
    const firstIp = raw.split(',')[0].trim();
    if (firstIp) return firstIp.replace(/^::ffff:/, '');
  }

  const xVercelForwardedFor = req.headers['x-vercel-forwarded-for'];
  if (xVercelForwardedFor) {
    const raw = Array.isArray(xVercelForwardedFor) ? xVercelForwardedFor[0] : xVercelForwardedFor;
    const firstIp = raw.split(',')[0].trim();
    if (firstIp) return firstIp.replace(/^::ffff:/, '');
  }

  const xRealIp = req.headers['x-real-ip'];
  if (xRealIp) {
    const raw = Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
    if (raw.trim()) return raw.trim().replace(/^::ffff:/, '');
  }

  const remoteAddr = req.ip || req.socket?.remoteAddress || '';
  return String(remoteAddr).replace(/^::ffff:/, '').trim() || 'unknown';
}

// Helper function to extract Happ Hardware ID (X-HWID) if present
function getCallerHwid(req) {
  const rawHwid =
    req.headers['x-hwid'] ||
    req.headers['hwid'] ||
    req.headers['x-device-id'] ||
    req.query?.hwid ||
    '';
  const hwid = Array.isArray(rawHwid) ? rawHwid[0] : String(rawHwid);
  return hwid.trim();
}

// Helper function to verify client subscription and Device (HWID / IP) binding
async function verifyAndBindClient(username, callerIp, callerHwid = '') {
  if (!username || username.trim() === '') {
    return { allowed: false, reason: 'invalid_username', client: null };
  }

  const trimmedUsername = username.trim();

  // Case-insensitive username lookup
  const { data, error } = await supabase
    .from('proxy_clients')
    .select('*')
    .ilike('username', trimmedUsername)
    .maybeSingle();

  if (error || !data) {
    return { allowed: false, reason: 'not_found', client: null };
  }

  const isActive = data.is_active === true || data.is_active === 'true';

  let isNotExpired = false;
  if (data.expiry_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const clientExpiry = new Date(data.expiry_date);
    if (!String(data.expiry_date).includes('T')) {
      clientExpiry.setHours(23, 59, 59, 999);
    }

    isNotExpired = clientExpiry >= today;
  }

  const hasProxy = Boolean(data.proxy_host && data.proxy_port);

  if (!isActive || !isNotExpired || !hasProxy) {
    return { allowed: false, reason: 'inactive_or_expired', client: data };
  }

  // Determine the device identifier:
  // Prefer permanent Hardware ID (HWID:<id>) from Happ if provided; otherwise fallback to IP
  const currentDeviceId = callerHwid
    ? `HWID:${callerHwid}`
    : callerIp && callerIp !== 'unknown'
      ? callerIp
      : '';

  const registeredDevice = data.registered_ip ? String(data.registered_ip).trim() : null;

  // 1. First time binding
  if (!registeredDevice) {
    if (currentDeviceId) {
      await supabase
        .from('proxy_clients')
        .update({
          registered_ip: currentDeviceId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.id);
    }
    return { allowed: true, reason: 'bound_first_device', client: data };
  }

  // 2. If previously bound to a temporary IP, and now Happ sends a permanent HWID, upgrade to HWID lock
  if (!registeredDevice.startsWith('HWID:') && callerHwid) {
    const upgradedId = `HWID:${callerHwid}`;
    await supabase
      .from('proxy_clients')
      .update({
        registered_ip: upgradedId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id);
    return { allowed: true, reason: 'upgraded_to_hwid', client: data };
  }

  // 3. Check match against registered device (either HWID:<id> or IP)
  if (registeredDevice.startsWith('HWID:')) {
    if (callerHwid && `HWID:${callerHwid}` === registeredDevice) {
      return { allowed: true, reason: 'hwid_matched', client: data };
    }
    return { allowed: false, reason: 'hwid_mismatch', client: data };
  }

  if (callerIp === registeredDevice) {
    return { allowed: true, reason: 'ip_matched', client: data };
  }

  return { allowed: false, reason: 'ip_mismatch', client: data };
}

// Helper to unpack user:pass@host#limit=500&used=12.5&mode=... from proxy_host
function parseStoredProxyHost(rawProxyHost, fallbackUser = '', fallbackPass = '') {
  let raw = String(rawProxyHost || '').trim();
  let quotaMb = 500; // Default 500 MB allocation if not specified
  let usedMb = 0;
  let mode = 'shamcash_sy';
  let provider = 'nodemaven';
  let country = 'SY';
  let sourceId = '';
  let extUrl = '';

  if (raw.includes('#')) {
    const hashIndex = raw.indexOf('#');
    const hashPart = raw.slice(hashIndex + 1);
    raw = raw.slice(0, hashIndex).trim();
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
    if (rawMode === 'residential_custom' || rawMode === 'external_v2ray' || rawMode === 'shamcash_sy') {
      mode = rawMode;
    }
    const rawProvider = String(params.get('provider') || '').trim().toLowerCase();
    if (rawProvider === 'dataimpulse' || rawProvider === 'nodemaven') {
      provider = rawProvider;
    }
    const rawCountry = String(params.get('country') || '').trim().toUpperCase();
    if (rawCountry) {
      country = rawCountry;
    }
    if (params.has('source_id')) {
      sourceId = String(params.get('source_id') || '').trim();
    }
    if (params.has('ext_url')) {
      extUrl = String(params.get('ext_url') || '').trim();
    }
  }

  let host = raw;
  let pUser = fallbackUser ? String(fallbackUser).trim() : '';
  let pPass = fallbackPass ? String(fallbackPass).trim() : '';

  if (host.includes('@')) {
    const atIndex = host.lastIndexOf('@');
    const authPart = host.slice(0, atIndex);
    host = host.slice(atIndex + 1).trim();
    if (!pUser && authPart.includes(':')) {
      const colonIndex = authPart.indexOf(':');
      pUser = authPart.slice(0, colonIndex).trim();
      pPass = authPart.slice(colonIndex + 1).trim();
    }
  }

  if (pUser === 'Lishopsbl3') {
    pUser = 'LishopsbI3';
  }

  if (host.toLowerCase().includes('dataimpulse')) {
    provider = 'dataimpulse';
  }

  // Extract NodeMaven sub-user prefix (e.g. "Alishoop2" from "Alishoop2-country-sy-sid-...")
  // Or DataImpulse base login (e.g. "user123" from "user123__cr.us;sessid.abc")
  let subUserPrefix = pUser.trim();
  if (pUser.includes('-country-')) {
    subUserPrefix = pUser.split('-country-')[0].trim();
    if (country === 'SY') {
      const cMatch = pUser.match(/-country-([a-zA-Z]{2})/i);
      if (cMatch) country = cMatch[1].toUpperCase();
    }
  } else if (pUser.includes('__')) {
    subUserPrefix = pUser.split('__')[0].trim();
    const crMatch = pUser.match(/__cr\.([a-zA-Z]{2})/i);
    if (crMatch) country = crMatch[1].toUpperCase();
  }

  return {
    host,
    pUser,
    pPass,
    quotaMb,
    usedMb,
    subUserPrefix,
    mode,
    provider,
    country,
    sourceId,
    extUrl,
  };
}

const DEFAULT_NODEMAVEN_API_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzk0Njk3ODkxLCJpYXQiOjE3OTQ2OTYwOTEsImp0aSI6ImIyZDJlMTdlYjEwMzQ0MjE4MjMwNWNlMDc4M2Q2MTYzIiwidXNlcl9pZCI6IjVmODk1MDNhLWUxZDUtNGE5Mi1hOWQzLTRkYTRmZjNmNzRjOSJ9.4k0JY_YQyENX0pA1nHZ9Ese4y4IIEQ4kxzOt1OzbP-U';

function getNodeMavenApiKey() {
  const rawKey = (process.env.NODEMAVEN_API_KEY || DEFAULT_NODEMAVEN_API_KEY).trim();
  return rawKey.replace(/^x-api-key\s+/i, '').trim();
}

// NodeMaven live sub-user usage fetcher (queries https://api.nodemaven.com/api/v2/base/sub-users/)
async function fetchNodeMavenSubUsersMap() {
  const cleanKey = getNodeMavenApiKey();
  if (!cleanKey) return null;

  try {
    const res = await fetch('https://api.nodemaven.com/api/v2/base/sub-users/?limit=100', {
      method: 'GET',
      headers: {
        Authorization: `x-api-key ${cleanKey}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      console.error('[NODEMAVEN] API responded with status:', res.status);
      return null;
    }
    const data = await res.json();
    const list = Array.isArray(data?.payload)
      ? data.payload
      : Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.sub_users)
              ? data.sub_users
              : [];
    const map = {};
    for (const item of list) {
      const u = String(item.proxy_username || item.username || '').trim().toLowerCase();
      if (u) {
        const limitBytes = Number(item.traffic_limit ?? 0);
        const usedBytes = Number(item.used_traffic ?? item.traffic_used ?? 0);
        map[u] = {
          id: item.id,
          proxy_username: item.proxy_username || item.username,
          proxy_password: item.proxy_password || '',
          is_default_user: Boolean(item.is_default_user),
          traffic_limit_bytes: limitBytes,
          traffic_used_bytes: usedBytes,
          traffic_limit_mb: Number((limitBytes / 1000000).toFixed(2)),
          traffic_used_mb: Number((usedBytes / 1000000).toFixed(2)),
          is_traffic_limited: Boolean(item.is_traffic_limited),
        };
      }
    }
    return map;
  } catch (err) {
    console.error('[NODEMAVEN] Error fetching sub-users:', err);
    return null;
  }
}

async function fetchNodeMavenAccountBalance() {
  const cleanKey = getNodeMavenApiKey();
  if (!cleanKey) return null;
  try {
    const res = await fetch('https://api.nodemaven.com/api/v2/base/account/balance/', {
      method: 'GET',
      headers: {
        Authorization: `x-api-key ${cleanKey}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const remBytes = Number(data?.traffic_remaining ?? 0);
    return {
      traffic_remaining_bytes: remBytes,
      traffic_remaining_mb: Number((remBytes / 1000000).toFixed(2)),
      updated_at: data?.updated_at || null,
    };
  } catch {
    return null;
  }
}

const SYSTEM_ROUTING_USERNAME = '__system_routing_rules__';
const SYSTEM_EXTERNAL_V2RAY_USERNAME = '__system_external_v2ray_sources__';

// ============================================================
// EXTERNAL V2RAY SOURCES HELPERS (SSRF-Safe Probe + Storage)
// ============================================================
function isPrivateOrRestrictedHost(hostname) {
  const h = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (
    h === 'localhost' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h === 'metadata.google.internal'
  ) {
    return true;
  }
  // IPv4 private / loopback / link-local / metadata ranges
  const ipv4Match = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  // IPv6 private / link-local
  if (h.includes(':')) {
    if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('::ffff:127.')) {
      return true;
    }
  }
  return false;
}

function validateExternalSubscriptionUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return { ok: false, error: 'الرابط فارغ' };

  // Direct V2Ray links (VLESS, Trojan, VMess, Shadowsocks, Hysteria2, TUIC)
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const directV2RayRegex = /^(vless|trojan|vmess|ss|hy2|hysteria2|tuic):\/\//i;
  if (lines.length > 0 && lines.every((l) => directV2RayRegex.test(l))) {
    return { ok: true, kind: 'direct_links', links: lines };
  }

  // HTTP / HTTPS subscription URL
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'صيغة الرابط غير صالحة (يجب أن يكون رابط اشتراك https:// أو رابط vless:// / trojan://)' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'يُسمح فقط بروابط http/https أو روابط vless/trojan' };
  }
  if (isPrivateOrRestrictedHost(parsed.hostname)) {
    return { ok: false, error: 'هذا العنوان غير مسموح به لأسباب أمنية' };
  }
  return { ok: true, kind: 'http_subscription', url: parsed.toString() };
}

function parseSubscriptionUserinfoHeader(headerVal) {
  if (!headerVal || typeof headerVal !== 'string') return null;
  const result = {
    upload: 0,
    download: 0,
    total: 0,
    expire: 0,
  };
  let foundAny = false;
  const parts = headerVal.split(/[;,\s]+/);
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (!k || v === undefined) continue;
    const key = k.trim().toLowerCase();
    const num = Number(v.trim());
    if (Number.isNaN(num)) continue;
    if (key === 'upload' || key === 'download' || key === 'total' || key === 'expire') {
      result[key] = num;
      foundAny = true;
    }
  }
  if (!foundAny) return null;

  const usedBytes = Math.max(0, result.upload + result.download);
  const totalBytes = Math.max(0, result.total);
  const usedMb = Number((usedBytes / 1048576).toFixed(2));
  const totalMb = Number((totalBytes / 1048576).toFixed(2));
  const remainingMb = totalMb > 0 ? Math.max(0, Number((totalMb - usedMb).toFixed(2))) : 0;
  const usagePct = totalBytes > 0 ? Math.min(100, Math.round((usedBytes / totalBytes) * 100)) : 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const expireSoon = result.expire > 0 && result.expire - nowSec <= 3 * 86400;
  const nearLimit =
    (totalBytes > 0 && (usagePct >= 80 || remainingMb <= 500)) || expireSoon;

  return {
    ...result,
    used_bytes: usedBytes,
    used_mb: usedMb,
    total_mb: totalMb,
    remaining_mb: remainingMb,
    usage_pct: usagePct,
    near_limit: nearLimit,
    expire_soon: expireSoon,
    raw_header: headerVal.trim(),
  };
}

function detectV2RayLinksFromPayload(bodyText) {
  const raw = String(bodyText || '').trim();
  if (!raw) return { links: [], protocols: [] };

  let decoded = raw;
  const directCheck = /^(vless|trojan|vmess|ss|hy2|hysteria2|tuic):\/\//im;
  if (!directCheck.test(raw) && !raw.startsWith('{') && !raw.startsWith('[')) {
    try {
      const candidate = Buffer.from(raw.replace(/\s+/g, ''), 'base64').toString('utf-8');
      if (directCheck.test(candidate)) {
        decoded = candidate;
      }
    } catch {
      // keep raw
    }
  }

  const lines = decoded
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^(vless|trojan|vmess|ss|hy2|hysteria2|tuic):\/\//i.test(l));

  const protoSet = new Set();
  for (const l of lines) {
    const m = l.match(/^([a-z0-9]+):\/\//i);
    if (m) protoSet.add(m[1].toUpperCase());
  }
  return { links: lines, protocols: Array.from(protoSet) };
}

async function probeExternalV2RaySource(sourceUrl, timeoutMs = 8000) {
  const validation = validateExternalSubscriptionUrl(sourceUrl);
  if (!validation.ok) {
    return {
      ok: false,
      status: 'error',
      error_msg: validation.error,
      checked_at: new Date().toISOString(),
    };
  }

  if (validation.kind === 'direct_links') {
    const detected = detectV2RayLinksFromPayload(validation.links.join('\n'));
    return {
      ok: true,
      status: 'ok',
      kind: 'direct_links',
      server_count: detected.links.length,
      protocols: detected.protocols,
      userinfo: null,
      body_base64: Buffer.from(detected.links.join('\n'), 'utf-8').toString('base64'),
      checked_at: new Date().toISOString(),
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(validation.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Happ/2.0 v2rayNG/1.8.23',
        Accept: '*/*',
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        ok: false,
        status: 'error',
        error_msg: `الخادم الخارجي أعاد الحالة HTTP ${res.status}`,
        checked_at: new Date().toISOString(),
      };
    }

    const bodyText = await res.text();
    const rawUserinfoHeader = res.headers.get('subscription-userinfo') || '';
    const parsedUserinfo = parseSubscriptionUserinfoHeader(rawUserinfoHeader);
    const detected = detectV2RayLinksFromPayload(bodyText);
    const rawTitle = res.headers.get('profile-title') || '';

    return {
      ok: true,
      status: 'ok',
      kind: 'http_subscription',
      content_type: res.headers.get('content-type') || 'text/plain; charset=utf-8',
      profile_title: rawTitle,
      server_count: detected.links.length,
      protocols: detected.protocols,
      userinfo: parsedUserinfo,
      raw_body: bodyText,
      checked_at: new Date().toISOString(),
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 'error',
      error_msg:
        err?.name === 'AbortError'
          ? 'انتهت مهلة الاتصال برابط الاشتراك الخارجي'
          : 'تعذر الاتصال برابط الاشتراك الخارجي',
      checked_at: new Date().toISOString(),
    };
  }
}

async function getExternalV2RaySourcesStore() {
  try {
    const { data } = await supabase
      .from('proxy_clients')
      .select('id, proxy_host')
      .eq('username', SYSTEM_EXTERNAL_V2RAY_USERNAME)
      .maybeSingle();
    if (data && data.proxy_host) {
      const parsed = JSON.parse(data.proxy_host);
      return {
        rowId: data.id,
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      };
    }
  } catch {
    // fallback empty
  }
  return { rowId: null, sources: [] };
}

async function saveExternalV2RaySourcesStore(sourcesList) {
  const payloadStr = JSON.stringify({ sources: sourcesList || [] });
  const existing = await getExternalV2RaySourcesStore();
  if (existing.rowId) {
    await supabase
      .from('proxy_clients')
      .update({
        proxy_host: payloadStr,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.rowId);
  } else {
    await supabase.from('proxy_clients').insert([
      {
        username: SYSTEM_EXTERNAL_V2RAY_USERNAME,
        is_active: false,
        expiry_date: '2099-12-31',
        proxy_host: payloadStr,
        proxy_port: 443,
      },
    ]);
  }
}

const BASE_SHAMCASH_PROXY_DOMAINS = [
  'api.shamcash.sy',
  'api-02.shamcash.sy',
  'api-03.shamcash.sy',
  'app.shamcash.sy',
  'bank.shamcash.sy',
  'payment.shamcash.sy',
  'deeplink.shamcash.sy',
  'shamcash.sy',
  'www.shamcash.sy',
  'shamcash.org',
  'api.shamusdt.com',
];

// Static storage & Flutter/Firebase SDK startup domains captured via PCAPdroid inside ShamCash:
// Routed via 'direct' (subscriber's local internet) so they work at full speed with 0 MB proxy consumption
const BASE_DIRECT_DOMAINS = [
  'your-objectstorage.com',
  'fsn1.your-objectstorage.com',
  'api.shorebird.dev',
  'shorebird.dev',
  'firebaselogging.googleapis.com',
];

const TELECOM_SERVICE_DOMAINS = [
  'syriatel.com.sy',
  'abili.syriatel.com.sy',
  'mtnsyr.com',
  'cash.mtnsyr.com',
  'imtn.mtnsyr.com',
  'gateway.mtnsyr.com',
];

const BASE_BLOCKED_DOMAINS = [
  'download.shamcash.sy',
  'support.shamcash.sy',
  'kazawallet.com',
  'www.kazawallet.com',
  'syriancrypto.com',
  'mony.syriancrypto.com',
  'syriatel.com.sy',
  'abili.syriatel.com.sy',
  'mtnsyr.com',
  'cash.mtnsyr.com',
  'imtn.mtnsyr.com',
  'gateway.mtnsyr.com',
  'masary.money',
  'www.masary.money',
  'my.masary.money',
  'tekaticket.sy',
  'api.tekaticket.sy',
  'bankalsharq.com',
  'ebanking.bankalsharq.com',
  'syriapayment.com',
  'backend.syriapayment.com',
  'syriancash.com',
  'yamersal.com',
  'api.yamersal.com',
  'rcell.me',
  'kasroad.com',
  'auth.kasroad.com',
  'facebook.net',
  'connect.facebook.net',
  'facebook.com',
  'fbcdn.net',
  'cloudflare.com',
  'challenges.cloudflare.com',
  'dash.cloudflare.com',
  'cloudflareinsights.com',
  'googleapis.com',
  'gstatic.com',
  'google.com',
  'googletagmanager.com',
  'analytics.google.com',
  'play.google.com',
  'firebaseio.com',
  'crashlytics.com',
  'slsandbox.tech',
  'instagram.com',
  'wechat.com',
  'whatsapp.com',
  'whatsapp.net',
  'tiktok.com',
  'youtube.com',
  'googlevideo.com',
  'perfectcdn.com',
  'storage.perfectcdn.com',
  'smmraydar.com',
  'apple.com',
  'icloud.com',
  'chatgpt.com',
  'oaistatic.com',
  'sourcegraph.com',
  'grep.app',
  'apkmirror.com',
  'apkpure.com',
  'cdnfonts.com',
];

function cleanDomainName(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^(full:|domain:)/, '')
    .replace(/:\d+$/, '')
    .trim();
}

async function getDynamicRoutingConfig() {
  const defaultCfg = {
    blocked: [],
    direct: [],
    allowed: [],
    allow_support_shamcash: false,
  };
  try {
    const { data } = await supabase
      .from('proxy_clients')
      .select('id, proxy_host')
      .eq('username', SYSTEM_ROUTING_USERNAME)
      .maybeSingle();
    if (data && data.proxy_host) {
      const parsed = JSON.parse(data.proxy_host);
      return {
        id: data.id,
        blocked: Array.isArray(parsed.blocked) ? parsed.blocked.map(cleanDomainName).filter(Boolean) : [],
        direct: Array.isArray(parsed.direct) ? parsed.direct.map(cleanDomainName).filter(Boolean) : [],
        allowed: Array.isArray(parsed.allowed) ? parsed.allowed.map(cleanDomainName).filter(Boolean) : [],
        allow_support_shamcash: Boolean(parsed.allow_support_shamcash),
      };
    }
  } catch {
    // fallback to defaults
  }
  return defaultCfg;
}

async function saveDynamicRoutingConfig(newCfg) {
  const payloadStr = JSON.stringify({
    blocked: Array.from(new Set((newCfg.blocked || []).map(cleanDomainName).filter(Boolean))),
    direct: Array.from(new Set((newCfg.direct || []).map(cleanDomainName).filter(Boolean))),
    allowed: Array.from(new Set((newCfg.allowed || []).map(cleanDomainName).filter(Boolean))),
    allow_support_shamcash: Boolean(newCfg.allow_support_shamcash),
  });

  const existing = await getDynamicRoutingConfig();
  if (existing.id) {
    await supabase
      .from('proxy_clients')
      .update({
        proxy_host: payloadStr,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('proxy_clients').insert([
      {
        username: SYSTEM_ROUTING_USERNAME,
        is_active: false,
        expiry_date: '2099-12-31',
        proxy_host: payloadStr,
        proxy_port: 1080,
      },
    ]);
  }
}

function classifyDomainStatus(rawDomain, dynCfg) {
  const d = cleanDomainName(rawDomain);
  if (!d) return { category: 'external_leaked', status: 'blocked' };

  const blockedSet = new Set([
    ...BASE_BLOCKED_DOMAINS,
    ...(dynCfg?.blocked || []),
  ]);
  if (dynCfg?.allow_support_shamcash) {
    blockedSet.delete('support.shamcash.sy');
  }
  const directSet = new Set([
    ...BASE_DIRECT_DOMAINS,
    ...(dynCfg?.direct || []),
  ]);
  const allowedSet = new Set([
    ...BASE_SHAMCASH_PROXY_DOMAINS,
    ...(dynCfg?.allowed || []),
    ...(dynCfg?.allow_support_shamcash ? ['support.shamcash.sy'] : []),
  ]);

  // Explicit custom overrides take highest priority
  if ((dynCfg?.blocked || []).some((b) => d === b || d.endsWith(`.${b}`))) {
    return {
      category: d.includes('shamcash') ? 'shamcash_support' : 'external_leaked',
      status: 'blocked',
    };
  }
  if ((dynCfg?.direct || []).some((dir) => d === dir || d.endsWith(`.${dir}`))) {
    return {
      category: 'static_direct',
      status: 'routed_direct',
    };
  }
  if ((dynCfg?.allowed || []).some((al) => d === al || d.endsWith(`.${al}`))) {
    return {
      category: 'shamcash_core',
      status: 'allowed_proxy',
    };
  }

  // Check default direct
  for (const dir of directSet) {
    if (d === dir || d.endsWith(`.${dir}`)) {
      return { category: 'static_direct', status: 'routed_direct' };
    }
  }

  // Check default blocked (e.g. download.shamcash.sy, support.shamcash.sy, kazawallet.com, etc.)
  for (const blk of blockedSet) {
    if (d === blk || d.endsWith(`.${blk}`)) {
      return {
        category: d.includes('shamcash') ? 'shamcash_support' : 'external_leaked',
        status: 'blocked',
      };
    }
  }

  // Check ShamCash core allowed
  for (const al of allowedSet) {
    if (d === al || d.endsWith(`.${al}`)) {
      return { category: 'shamcash_core', status: 'allowed_proxy' };
    }
  }

  // Catch-all: blocked by Xray rule #6
  return { category: 'external_leaked', status: 'blocked' };
}

// ============================================================
// 1. SUBSCRIPTION ENDPOINT: GET /sub/:username
// Compatible with Happ (Xray JSON + HWID Lock + Instant Pause) & v2rayNG / V2Box
// ============================================================
async function handleSubscriptionRequest(req, res) {
  const { username } = req.params;
  const callerIp = getCallerIp(req);
  const callerHwid = getCallerHwid(req);
  // Always serve the strict Xray JSON configuration with ShamCash-only routing rules
  // unless ?format=raw_socks is explicitly requested, so no device ever gets an unfiltered socks:// link.
  const forceRawSocks = req.query?.format === 'raw_socks';

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const excludedDnsAndLanRoutes =
    '1.1.1.1/32, 1.0.0.1/32, 8.8.8.8/32, 8.8.4.4/32, 9.9.9.9/32, 149.112.112.112/32, 208.67.222.222/32, 208.67.220.220/32, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12';

  // Always enforce auto-update on app open & every 1 hour so pausing/stopping a client takes effect automatically
  res.setHeader('profile-update-interval', '1');
  res.setHeader('subscription-auto-update-enable', '1');
  res.setHeader('subscription-auto-update-open-enable', '1');
  res.setHeader('subscriptions-expand-now', '1');
  res.setHeader('subscription-always-hwid-enable', '1');
  res.setHeader('subscription-ping-onopen-enabled', '0');
  res.setHeader('ping-type', 'tcp');
  res.setHeader('hide-settings', '1');
  // CRITICAL FIX:
  // Set routing-enable: 0 so Happ does NOT enable its built-in Default Routing Profile ("GlobalProxy": "true"),
  // which previously overwrote our JSON routing rules and sent non-ShamCash domains (kazawallet, syriancrypto, etc.) to the proxy!
  // With routing-enable: 0, Xray-core strictly executes the routing.rules inside our JSON configuration.
  res.setHeader('routing-enable', '0');
  // Also enforce Android OS-level Per-App Proxy for ShamCash ONLY (both standard and -set overwrite header)
  res.setHeader('per-app-proxy-mode', 'on');
  res.setHeader('per-app-proxy-list', 'com.shmacash.shamcash');
  res.setHeader('per-app-proxy-list-set', 'com.shmacash.shamcash');
  res.setHeader('exclude-apns-enable', 'true');
  res.setHeader('exclude-local-networks-enable', 'true');
  res.setHeader('exclude-routes-set', excludedDnsAndLanRoutes);
  res.setHeader('exclude-routes', excludedDnsAndLanRoutes);
  res.setHeader('no-limit-enabled', '1');

  try {
    const [result, dynCfg] = await Promise.all([
      verifyAndBindClient(username, callerIp, callerHwid),
      getDynamicRoutingConfig(),
    ]);
    const clientData = result.client;
    const cleanTitleName = clientData?.username || username || 'User';
    const profileTitlePlain = `VPN Alishop - ${cleanTitleName}`.slice(0, 25);
    const profileTitleBase64 = Buffer.from(profileTitlePlain, 'utf-8').toString('base64');
    res.setHeader('profile-title', `base64:${profileTitleBase64}`);

    // Unpack proxy details and quota/usage metadata
    const parsedProxy = clientData
      ? parseStoredProxyHost(
          clientData.proxy_host,
          clientData.proxy_username,
          clientData.proxy_password
        )
      : {
          host: '',
          pUser: '',
          pPass: '',
          quotaMb: 500,
          usedMb: 0,
          subUserPrefix: '',
          mode: 'shamcash_sy',
          provider: 'nodemaven',
          country: 'SY',
          sourceId: '',
          extUrl: '',
        };

    let {
      host,
      pUser,
      pPass,
      quotaMb,
      usedMb,
      subUserPrefix,
      mode: clientMode,
      provider: clientProvider,
      country: clientCountry,
      sourceId: externalSourceId,
      extUrl: externalCustomUrl,
    } = parsedProxy;

    // For non-ShamCash modes (Residential Custom & External V2Ray VPN), disable ShamCash-only per-app restriction
    // while keeping ShamCash (shamcash_sy) 100% untouched!
    if (clientMode === 'residential_custom' || clientMode === 'external_v2ray') {
      res.setHeader('per-app-proxy-mode', 'off');
      res.removeHeader('per-app-proxy-list');
      res.removeHeader('per-app-proxy-list-set');
    }

    // Live sync with NodeMaven API (for ShamCash SY and Residential Custom on NodeMaven)
    if (clientMode !== 'external_v2ray' && clientProvider === 'nodemaven' && subUserPrefix) {
      const nmMap = await fetchNodeMavenSubUsersMap();
      const nmEntry = nmMap ? nmMap[subUserPrefix.toLowerCase()] : null;
      if (nmEntry) {
        if (nmEntry.traffic_limit_bytes > 0) {
          quotaMb = nmEntry.traffic_limit_mb;
        }
        usedMb = nmEntry.traffic_used_mb;
      }
    }

    const limitBytes = quotaMb > 0 ? Math.round(quotaMb * 1000000) : 100000000000;
    const usedBytes = Math.min(limitBytes, Math.max(0, Math.round(usedMb * 1000000)));
    const isQuotaExhausted = clientMode !== 'external_v2ray' && quotaMb > 0 && usedMb >= quotaMb;

    // CRITICAL FIX FOR PAUSE / EXPIRY / DEVICE LOCK / QUOTA EXHAUSTED:
    // Never return HTTP 403 to Happ! When Happ receives HTTP 403, it ignores the response and keeps
    // the previously cached proxy server working!
    // Instead, return HTTP 200 OK with a "blackhole" Xray JSON configuration that overwrites and
    // deletes the proxy credentials from the phone immediately.
    if (!result.allowed || !clientData || isQuotaExhausted) {
      let stopReasonAr = '⛔ تم إيقاف الاشتراك مؤقتاً - تواصل مع الإدارة';
      if (isQuotaExhausted) {
        stopReasonAr = `⛔ انتهت الباقة المخصصة (${quotaMb} MB) - يرجى التجديد`;
      } else if (result.reason === 'hwid_mismatch' || result.reason === 'ip_mismatch') {
        stopReasonAr = '⛔ الحساب مقفل على جهاز آخر';
      } else if (result.reason === 'inactive_or_expired' && clientData) {
        const isAct = clientData.is_active === true || clientData.is_active === 'true';
        stopReasonAr = isAct
          ? '⛔ انتهت صلاحية الاشتراك - يرجى التجديد'
          : '⛔ الاشتراك متوقف من قبل الإدارة';
      }

      const announceBase64 = Buffer.from(stopReasonAr, 'utf-8').toString('base64');
      res.setHeader('announce', `base64:${announceBase64}`);
      res.setHeader(
        'subscription-userinfo',
        `upload=0; download=${limitBytes}; total=${limitBytes}; expire=1000000000`
      );

      if (!forceRawSocks) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        const disabledConfig = {
          remarks: `⛔ متوقف - ${cleanTitleName}`,
          meta: {
            serverDescription: stopReasonAr,
          },
          log: {
            loglevel: 'none',
          },
          inbounds: [
            {
              tag: 'socks',
              port: 10808,
              listen: '127.0.0.1',
              protocol: 'socks',
              settings: { auth: 'noauth', udp: false },
            },
          ],
          outbounds: [
            {
              tag: 'block',
              protocol: 'blackhole',
              settings: { response: { type: 'none' } },
            },
          ],
          routing: {
            domainStrategy: 'AsIs',
            rules: [
              {
                type: 'field',
                network: 'tcp,udp',
                outboundTag: 'block',
              },
            ],
          },
        };
        return res.status(200).send(JSON.stringify([disabledConfig], null, 2));
      }

      const disabledTag = encodeURIComponent(stopReasonAr);
      const disabledUri = `socks://0.0.0.0:1#${disabledTag}`;
      return res.status(200).send(Buffer.from(disabledUri, 'utf-8').toString('base64'));
    }

    const port = Number(clientData.proxy_port);

    // 2. Compute expiry timestamp in Unix seconds for Happ / subscription header
    const expiryDateObj = new Date(clientData.expiry_date);
    if (!String(clientData.expiry_date).includes('T')) {
      expiryDateObj.setHours(23, 59, 59, 999);
    }
    const expireUnix = Math.floor(expiryDateObj.getTime() / 1000);

    res.setHeader(
      'subscription-userinfo',
      `upload=0; download=${usedBytes}; total=${limitBytes}; expire=${expireUnix}`
    );

    const tag = encodeURIComponent(`VPN Alishop - ${clientData.username}`);

    // ============================================================
    // MODE C: GENERAL VPN (EXTERNAL V2RAY / VLESS / TROJAN SOURCES)
    // ============================================================
    if (clientMode === 'external_v2ray') {
      const store = await getExternalV2RaySourcesStore();
      const matchedSource = externalSourceId
        ? store.sources.find((s) => s.id === externalSourceId)
        : null;
      const targetSourceUrl = matchedSource?.source_url || externalCustomUrl || '';

      if (!targetSourceUrl) {
        const noSourceMsg = '⛔ لم يتم ربط مصدر V2Ray خارجي بهذا المشترك بعد';
        res.setHeader('announce', `base64:${Buffer.from(noSourceMsg, 'utf-8').toString('base64')}`);
        return res.status(200).send('');
      }

      const probed = await probeExternalV2RaySource(targetSourceUrl, 8500);
      if (!probed.ok) {
        const errMsg = `⛔ تعذر جلب سيرفرات المصدر الخارجي: ${probed.error_msg || 'خطأ في الاتصال'}`;
        res.setHeader('announce', `base64:${Buffer.from(errMsg, 'utf-8').toString('base64')}`);
        return res.status(200).send('');
      }

      // Update subscriber's Subscription-Userinfo header from upstream telemetry + dynamic subscriber expiry
      if (probed.userinfo) {
        const up = probed.userinfo.upload || 0;
        const dn = probed.userinfo.download || 0;
        const tot = probed.userinfo.total || 0;
        const effectiveExpire =
          probed.userinfo.expire > 0 ? Math.min(probed.userinfo.expire, expireUnix) : expireUnix;
        res.setHeader(
          'subscription-userinfo',
          `upload=${up}; download=${dn}; total=${tot}; expire=${effectiveExpire}`
        );

        // Background-update cached telemetry on the external source record
        if (matchedSource) {
          const updatedSources = store.sources.map((s) =>
            s.id === matchedSource.id
              ? {
                  ...s,
                  server_count: probed.server_count || s.server_count || 0,
                  protocols: probed.protocols?.length ? probed.protocols : s.protocols || [],
                  userinfo: {
                    ...probed.userinfo,
                    status: 'ok',
                    checked_at: probed.checked_at,
                  },
                }
              : s
          );
          saveExternalV2RaySourcesStore(updatedSources).catch(() => {});
        }
      } else {
        res.setHeader(
          'subscription-userinfo',
          `upload=0; download=0; total=0; expire=${expireUnix}`
        );
      }

      if (probed.kind === 'direct_links') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(probed.body_base64 || '');
      }

      res.setHeader('Content-Type', probed.content_type || 'text/plain; charset=utf-8');
      return res.status(200).send(probed.raw_body || '');
    }

    // ============================================================
    // MODE B: CUSTOM RESIDENTIAL PROXY BY COUNTRY (OPEN BROWSING)
    // Supports NodeMaven & DataImpulse with Sticky Session & Quota Counter
    // ============================================================
    if (clientMode === 'residential_custom' && !forceRawSocks) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');

      const socksServer = {
        address: host,
        port: port,
      };
      if (pUser && pPass) {
        socksServer.users = [
          {
            user: pUser,
            pass: pPass,
            level: 8,
          },
        ];
      }

      const remainingMb = Math.max(0, Number((quotaMb - usedMb).toFixed(1)));
      const descriptionText =
        quotaMb > 0
          ? `${clientCountry} · متبقي ${remainingMb}MB`
          : `Residential ${clientCountry}`;

      const residentialXrayConfig = {
        remarks: `VPN Alishop [${clientCountry}] - ${clientData.username}`,
        meta: {
          serverDescription: descriptionText.slice(0, 30),
        },
        log: {
          loglevel: 'warning',
        },
        dns: {
          hosts: {
            'cloudflare-dns.com': '1.1.1.1',
            'dns.google': '8.8.8.8',
          },
          servers: ['1.1.1.1', '8.8.8.8'],
        },
        inbounds: [
          {
            tag: 'socks',
            port: 10808,
            listen: '127.0.0.1',
            protocol: 'socks',
            settings: {
              auth: 'noauth',
              udp: true,
              userLevel: 8,
            },
            sniffing: {
              enabled: true,
              destOverride: ['http', 'tls', 'quic'],
              routeOnly: false,
            },
          },
          {
            tag: 'http',
            port: 10809,
            listen: '127.0.0.1',
            protocol: 'http',
            settings: {
              userLevel: 8,
            },
            sniffing: {
              enabled: true,
              destOverride: ['http', 'tls', 'quic'],
              routeOnly: false,
            },
          },
        ],
        outbounds: [
          {
            tag: 'proxy',
            protocol: 'socks',
            settings: {
              servers: [socksServer],
            },
            streamSettings: {
              network: 'tcp',
            },
          },
          {
            tag: 'direct',
            protocol: 'freedom',
            settings: {},
          },
          {
            tag: 'block',
            protocol: 'blackhole',
            settings: {
              response: { type: 'none' },
            },
          },
        ],
        routing: {
          domainStrategy: 'AsIs',
          rules: [
            {
              type: 'field',
              port: 53,
              outboundTag: 'direct',
            },
            {
              type: 'field',
              ip: ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
              outboundTag: 'direct',
            },
            {
              type: 'field',
              network: 'tcp,udp',
              outboundTag: 'proxy',
            },
          ],
        },
      };

      return res.status(200).send(JSON.stringify([residentialXrayConfig], null, 2));
    }

    // Build dynamic Xray domain lists combining base rules + admin's dynamic rules from Smart Traffic Tracker
    const activeBlockedDomains = Array.from(
      new Set([
        ...BASE_BLOCKED_DOMAINS.filter(
          (d) => !(dynCfg.allow_support_shamcash && d === 'support.shamcash.sy')
        ),
        ...(dynCfg.blocked || []),
      ])
    ).filter((d) => !(dynCfg.allowed || []).includes(d) && !(dynCfg.direct || []).includes(d));

    const activeDirectDomains = Array.from(
      new Set([...BASE_DIRECT_DOMAINS, ...(dynCfg.direct || [])])
    ).filter((d) => !(dynCfg.blocked || []).includes(d));

    const activeAllowedDomains = Array.from(
      new Set([
        ...BASE_SHAMCASH_PROXY_DOMAINS,
        ...(dynCfg.allow_support_shamcash ? ['support.shamcash.sy'] : []),
        ...(dynCfg.allowed || []),
      ])
    ).filter((d) => !(dynCfg.blocked || []).includes(d));

    if (!forceRawSocks) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');

      const socksServer = {
        address: host,
        port: port,
      };
      if (pUser && pPass) {
        socksServer.users = [
          {
            user: pUser,
            pass: pPass,
            level: 8,
          },
        ];
      }

      const remainingMb = Math.max(0, Number((quotaMb - usedMb).toFixed(1)));
      const descriptionText =
        quotaMb > 0 ? `متبقي ${remainingMb}MB من ${quotaMb}MB` : 'ShamCash Only';

      const xrayConfig = {
        remarks: `VPN Alishop - ${clientData.username}`,
        meta: {
          serverDescription: descriptionText.slice(0, 30),
        },
        log: {
          loglevel: 'warning',
        },
        dns: {
          hosts: {
            'cloudflare-dns.com': '1.1.1.1',
            'dns.google': '8.8.8.8',
          },
          servers: ['1.1.1.1', '8.8.8.8'],
        },
        inbounds: [
          {
            tag: 'socks',
            port: 10808,
            listen: '127.0.0.1',
            protocol: 'socks',
            settings: {
              auth: 'noauth',
              udp: true,
              userLevel: 8,
            },
            sniffing: {
              enabled: true,
              destOverride: ['http', 'tls', 'quic'],
              routeOnly: false,
            },
          },
          {
            tag: 'http',
            port: 10809,
            listen: '127.0.0.1',
            protocol: 'http',
            settings: {
              userLevel: 8,
            },
            sniffing: {
              enabled: true,
              destOverride: ['http', 'tls', 'quic'],
              routeOnly: false,
            },
          },
        ],
        outbounds: [
          {
            tag: 'block',
            protocol: 'blackhole',
            settings: {
              response: {
                type: 'none',
              },
            },
          },
          {
            tag: 'direct',
            protocol: 'freedom',
            settings: {},
          },
          {
            tag: 'proxy',
            protocol: 'socks',
            settings: {
              servers: [socksServer],
            },
            streamSettings: {
              network: 'tcp',
            },
          },
        ],
        routing: {
          domainStrategy: 'AsIs',
          rules: [
            {
              type: 'field',
              port: 53,
              outboundTag: 'direct',
            },
            {
              type: 'field',
              network: 'udp',
              outboundTag: 'block',
            },
            {
              type: 'field',
              domain: activeDirectDomains.flatMap((d) => [`domain:${d}`, `full:${d}`]),
              outboundTag: 'direct',
            },
            {
              type: 'field',
              domain: activeBlockedDomains.flatMap((d) => [`domain:${d}`, `full:${d}`]),
              outboundTag: 'block',
            },
            {
              type: 'field',
              domain: activeAllowedDomains.flatMap((d) => [`domain:${d}`, `full:${d}`]),
              outboundTag: 'proxy',
            },
            {
              type: 'field',
              ip: ['191.44.71.71/32', '94.252.183.88/32'],
              outboundTag: 'proxy',
            },
            {
              type: 'field',
              network: 'tcp,udp',
              outboundTag: 'block',
            },
          ],
        },
      };

      return res.status(200).send(JSON.stringify([xrayConfig], null, 2));
    }

    // 5. Fallback raw socks format (only if ?format=raw_socks is explicitly passed)
    const rawAuth = pUser && pPass ? `${pUser}:${pPass}` : ':';
    const encodedAuth = Buffer.from(rawAuth, 'utf-8').toString('base64');
    const uri = `socks://${encodedAuth}@${host}:${port}#${tag}`;
    const finalBase64 = Buffer.from(uri, 'utf-8').toString('base64');

    return res.status(200).send(finalBase64);
  } catch (err) {
    console.error(`[SUB] Unexpected error for ${username}:`, err);
    return res.status(500).send('Server Error');
  }
}

app.get('/sub/:username', handleSubscriptionRequest);
app.get('/api/sub/:username', handleSubscriptionRequest);

// NodeMaven Live Traffic Sync Endpoint for Admin Dashboard
async function handleNodeMavenUsage(_req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const [map, account, routingConfig] = await Promise.all([
    fetchNodeMavenSubUsersMap(),
    fetchNodeMavenAccountBalance(),
    getDynamicRoutingConfig(),
  ]);
  return res.json({
    connected: Boolean(map),
    account: account || null,
    sub_users: map || {},
    routing_config: routingConfig,
  });
}

app.get('/nodemaven/usage', handleNodeMavenUsage);
app.get('/api/nodemaven/usage', handleNodeMavenUsage);

// Helper: Format Date as dd-mm-YYYY for NodeMaven statistics API
function formatNodeMavenDate(d) {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

// Helper: Fetch domain traffic breakdown for a single sub-user from NodeMaven API
async function fetchSubUserDomainStatsFromNodeMaven(subUserName, startStr, endStr) {
  const cleanKey = getNodeMavenApiKey();
  if (!cleanKey || !subUserName) return [];
  try {
    const url = `https://api.nodemaven.com/api/v2/base/statistics/domains/?proxy_username=${encodeURIComponent(
      subUserName
    )}&start=${startStr}&end=${endStr}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `x-api-key ${cleanKey}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    return rows.map((row) => ({
      domain: String(row[0] || '').trim(),
      requests: Number(row[1] || 0),
      bytes: Number(row[2] || 0),
    }));
  } catch {
    return [];
  }
}

// GET /api/nodemaven/user-domains
// Fetches live per-user or all-users domain traffic breakdown from NodeMaven API v2
// and classifies each domain (allowed_proxy, routed_direct, blocked)
async function handleNodeMavenUserDomains(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const rawUser = String(req.query?.proxy_username || '').trim();
    const isAll = req.query?.all === '1' || req.query?.all === 'true' || !rawUser;

    // Determine server date from NodeMaven or current UTC time (max 29 days window per NodeMaven API rule)
    const now = new Date();
    const start = new Date(now.getTime() - 28 * 86400 * 1000);
    const startStr = formatNodeMavenDate(start);
    const endStr = formatNodeMavenDate(now);

    const [nmMap, dynCfg] = await Promise.all([
      fetchNodeMavenSubUsersMap(),
      getDynamicRoutingConfig(),
    ]);

    if (!isAll) {
      const subPrefix = rawUser.includes('-country-')
        ? rawUser.split('-country-')[0].trim()
        : rawUser;
      const officialName =
        nmMap && nmMap[subPrefix.toLowerCase()]
          ? nmMap[subPrefix.toLowerCase()].proxy_username
          : subPrefix;

      const rawDomains = await fetchSubUserDomainStatsFromNodeMaven(officialName, startStr, endStr);
      const enriched = rawDomains
        .map((item) => {
          const info = classifyDomainStatus(item.domain, dynCfg);
          const currentAction =
            info.status === 'allowed_proxy'
              ? 'proxy'
              : info.status === 'routed_direct'
                ? 'direct'
                : 'block';
          return {
            domain: item.domain,
            requests: item.requests,
            bytes: item.bytes,
            mb: Number((item.bytes / 1000000).toFixed(3)),
            category: info.category,
            status: info.status,
            current_action: currentAction,
            is_blocked: currentAction === 'block',
            is_direct: currentAction === 'direct',
            sub_users: [officialName],
            users: [officialName],
          };
        })
        .sort((a, b) => b.bytes - a.bytes);

      const totalBytes = enriched.reduce((acc, d) => acc + d.bytes, 0);
      const totalRequests = enriched.reduce((acc, d) => acc + d.requests, 0);
      const shamcashCoreBytes = enriched
        .filter((d) => d.category === 'shamcash_core' || d.category === 'shamcash_support')
        .reduce((acc, d) => acc + d.bytes, 0);
      const staticDirectBytes = enriched
        .filter((d) => d.category === 'static_direct')
        .reduce((acc, d) => acc + d.bytes, 0);
      const leakedExternalBytes = enriched
        .filter((d) => d.category === 'external_leaked')
        .reduce((acc, d) => acc + d.bytes, 0);
      const wastedBytes = totalBytes - shamcashCoreBytes;

      const telecomMode = TELECOM_SERVICE_DOMAINS.every((td) => (dynCfg.allowed || []).includes(td))
        ? 'allow_proxy'
        : TELECOM_SERVICE_DOMAINS.every((td) => (dynCfg.direct || []).includes(td))
          ? 'direct'
          : 'block';

      return res.json({
        success: true,
        mode: 'single',
        sub_user: officialName,
        period: { start: startStr, end: endStr },
        total_mb: Number((totalBytes / 1000000).toFixed(2)),
        wasted_mb: Number((wastedBytes / 1000000).toFixed(2)),
        shamcash_mb: Number((shamcashCoreBytes / 1000000).toFixed(2)),
        summary: {
          total_mb: Number((totalBytes / 1000000).toFixed(2)),
          shamcash_core_mb: Number((shamcashCoreBytes / 1000000).toFixed(2)),
          leaked_external_mb: Number((leakedExternalBytes / 1000000).toFixed(2)),
          static_direct_mb: Number((staticDirectBytes / 1000000).toFixed(2)),
          total_requests: totalRequests,
        },
        domains: enriched,
        rules: {
          blocked_domains: dynCfg.blocked || [],
          direct_domains: dynCfg.direct || [],
          allowed_domains: dynCfg.allowed || [],
          block_support_chat: !dynCfg.allow_support_shamcash,
          telecom_mode: telecomMode,
        },
        routing_config: {
          ...dynCfg,
          base_blocked: BASE_BLOCKED_DOMAINS,
          base_direct: BASE_DIRECT_DOMAINS,
          base_allowed: BASE_SHAMCASH_PROXY_DOMAINS,
        },
      });
    }

    // Global mode: aggregate domain traffic across all sub-users in NodeMaven that have used_traffic > 0
    const activeSubUsers = Object.values(nmMap || {}).filter(
      (u) => u.traffic_used_bytes > 0 || u.is_default_user
    );

    const perUserResults = await Promise.all(
      activeSubUsers.map(async (u) => {
        const rows = await fetchSubUserDomainStatsFromNodeMaven(u.proxy_username, startStr, endStr);
        return { subUser: u.proxy_username, rows };
      })
    );

    const domainAgg = new Map();
    const userBreakdown = [];

    for (const { subUser, rows } of perUserResults) {
      let userTotalBytes = 0;
      let userWastedBytes = 0;
      const topUserDomains = [];

      for (const r of rows) {
        const info = classifyDomainStatus(r.domain, dynCfg);
        userTotalBytes += r.bytes;
        if (info.category !== 'shamcash_core' && info.category !== 'shamcash_support') {
          userWastedBytes += r.bytes;
        }
        topUserDomains.push({
          domain: r.domain,
          requests: r.requests,
          bytes: r.bytes,
          mb: Number((r.bytes / 1000000).toFixed(2)),
          category: info.category,
          status: info.status,
        });

        const key = r.domain.toLowerCase();
        const prev = domainAgg.get(key) || {
          domain: r.domain,
          requests: 0,
          bytes: 0,
          sub_users: new Set(),
          per_user: [],
        };
        prev.requests += r.requests;
        prev.bytes += r.bytes;
        prev.sub_users.add(subUser);
        prev.per_user.push({
          sub_user: subUser,
          requests: r.requests,
          mb: Number((r.bytes / 1000000).toFixed(2)),
        });
        domainAgg.set(key, prev);
      }

      if (rows.length > 0) {
        userBreakdown.push({
          sub_user: subUser,
          total_mb: Number((userTotalBytes / 1000000).toFixed(2)),
          wasted_mb: Number((userWastedBytes / 1000000).toFixed(2)),
          shamcash_mb: Number(((userTotalBytes - userWastedBytes) / 1000000).toFixed(2)),
          domains: topUserDomains.sort((a, b) => b.bytes - a.bytes),
        });
      }
    }

    const enrichedGlobal = Array.from(domainAgg.values())
      .map((item) => {
        const info = classifyDomainStatus(item.domain, dynCfg);
        const currentAction =
          info.status === 'allowed_proxy'
            ? 'proxy'
            : info.status === 'routed_direct'
              ? 'direct'
              : 'block';
        const usersArr = Array.from(item.sub_users);
        return {
          domain: item.domain,
          requests: item.requests,
          bytes: item.bytes,
          mb: Number((item.bytes / 1000000).toFixed(3)),
          category: info.category,
          status: info.status,
          current_action: currentAction,
          is_blocked: currentAction === 'block',
          is_direct: currentAction === 'direct',
          sub_users: usersArr,
          users: usersArr,
          per_user: item.per_user.sort((a, b) => b.mb - a.mb),
        };
      })
      .sort((a, b) => b.bytes - a.bytes);

    const totalBytes = enrichedGlobal.reduce((acc, d) => acc + d.bytes, 0);
    const totalRequests = enrichedGlobal.reduce((acc, d) => acc + d.requests, 0);
    const shamcashCoreBytes = enrichedGlobal
      .filter((d) => d.category === 'shamcash_core' || d.category === 'shamcash_support')
      .reduce((acc, d) => acc + d.bytes, 0);
    const staticDirectBytes = enrichedGlobal
      .filter((d) => d.category === 'static_direct')
      .reduce((acc, d) => acc + d.bytes, 0);
    const leakedExternalBytes = enrichedGlobal
      .filter((d) => d.category === 'external_leaked')
      .reduce((acc, d) => acc + d.bytes, 0);
    const wastedBytes = totalBytes - shamcashCoreBytes;

    const telecomMode = TELECOM_SERVICE_DOMAINS.every((td) => (dynCfg.allowed || []).includes(td))
      ? 'allow_proxy'
      : TELECOM_SERVICE_DOMAINS.every((td) => (dynCfg.direct || []).includes(td))
        ? 'direct'
        : 'block';

    return res.json({
      success: true,
      mode: 'all',
      period: { start: startStr, end: endStr },
      total_mb: Number((totalBytes / 1000000).toFixed(2)),
      wasted_mb: Number((wastedBytes / 1000000).toFixed(2)),
      shamcash_mb: Number((shamcashCoreBytes / 1000000).toFixed(2)),
      summary: {
        total_mb: Number((totalBytes / 1000000).toFixed(2)),
        shamcash_core_mb: Number((shamcashCoreBytes / 1000000).toFixed(2)),
        leaked_external_mb: Number((leakedExternalBytes / 1000000).toFixed(2)),
        static_direct_mb: Number((staticDirectBytes / 1000000).toFixed(2)),
        total_requests: totalRequests,
      },
      domains: enrichedGlobal,
      users_breakdown: userBreakdown.sort((a, b) => b.total_mb - a.total_mb),
      rules: {
        blocked_domains: dynCfg.blocked || [],
        direct_domains: dynCfg.direct || [],
        allowed_domains: dynCfg.allowed || [],
        block_support_chat: !dynCfg.allow_support_shamcash,
        telecom_mode: telecomMode,
      },
      routing_config: {
        ...dynCfg,
        base_blocked: BASE_BLOCKED_DOMAINS,
        base_direct: BASE_DIRECT_DOMAINS,
        base_allowed: BASE_SHAMCASH_PROXY_DOMAINS,
      },
    });
  } catch (err) {
    console.error('[NODEMAVEN-DOMAINS] Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch domain statistics' });
  }
}

app.get('/nodemaven/user-domains', handleNodeMavenUserDomains);
app.get('/api/nodemaven/user-domains', handleNodeMavenUserDomains);

// POST /api/nodemaven/routing-rules
// Dynamically updates blocked / direct / allowed domains in Supabase so /sub/:username enforces them immediately
async function handleNodeMavenRoutingRules(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const {
      action,
      domain,
      allow_support_shamcash,
      block_support_chat,
      telecom_mode,
    } = req.body || {};
    const current = await getDynamicRoutingConfig();

    const blocked = new Set(current.blocked || []);
    const direct = new Set(current.direct || []);
    const allowed = new Set(current.allowed || []);
    let allowSupport = current.allow_support_shamcash;

    if (typeof allow_support_shamcash === 'boolean') {
      allowSupport = allow_support_shamcash;
    } else if (typeof block_support_chat === 'boolean') {
      allowSupport = !block_support_chat;
    }

    if (action === 'set_telecom_mode' && telecom_mode) {
      for (const td of TELECOM_SERVICE_DOMAINS) {
        blocked.delete(td);
        direct.delete(td);
        allowed.delete(td);
        if (telecom_mode === 'block') {
          blocked.add(td);
        } else if (telecom_mode === 'direct') {
          direct.add(td);
        } else if (telecom_mode === 'allow_proxy' || telecom_mode === 'allow') {
          allowed.add(td);
        }
      }
    }

    const cleanDom = cleanDomainName(domain);
    if (cleanDom && action) {
      blocked.delete(cleanDom);
      direct.delete(cleanDom);
      allowed.delete(cleanDom);

      if (cleanDom === 'support.shamcash.sy') {
        allowSupport = action === 'allow' || action === 'allow_proxy';
      }

      if (action === 'block') {
        blocked.add(cleanDom);
      } else if (action === 'direct') {
        direct.add(cleanDom);
      } else if (action === 'allow' || action === 'allow_proxy') {
        allowed.add(cleanDom);
      }
    }

    const updatedCfg = {
      blocked: Array.from(blocked),
      direct: Array.from(direct),
      allowed: Array.from(allowed),
      allow_support_shamcash: allowSupport,
    };

    await saveDynamicRoutingConfig(updatedCfg);

    const activeTelecomMode = TELECOM_SERVICE_DOMAINS.every((td) =>
      updatedCfg.allowed.includes(td)
    )
      ? 'allow_proxy'
      : TELECOM_SERVICE_DOMAINS.every((td) => updatedCfg.direct.includes(td))
        ? 'direct'
        : 'block';

    return res.json({
      success: true,
      rules: {
        blocked_domains: updatedCfg.blocked,
        direct_domains: updatedCfg.direct,
        allowed_domains: updatedCfg.allowed,
        block_support_chat: !updatedCfg.allow_support_shamcash,
        telecom_mode: activeTelecomMode,
      },
      routing_config: {
        ...updatedCfg,
        base_blocked: BASE_BLOCKED_DOMAINS,
        base_direct: BASE_DIRECT_DOMAINS,
        base_allowed: BASE_SHAMCASH_PROXY_DOMAINS,
      },
    });
  } catch (err) {
    console.error('[NODEMAVEN-ROUTING] Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update routing rules' });
  }
}

app.post('/nodemaven/routing-rules', handleNodeMavenRoutingRules);
app.post('/api/nodemaven/routing-rules', handleNodeMavenRoutingRules);

// POST /api/nodemaven/refill-traffic
// Resets used_traffic to 0 (and optionally updates traffic_limit) in the Parent NodeMaven Dashboard via PUT /api/v2/base/sub-users/
async function handleNodeMavenRefillTraffic(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const cleanKey = getNodeMavenApiKey();
  if (!cleanKey) {
    return res.status(500).json({ success: false, error: 'Missing NodeMaven API key' });
  }

  try {
    const {
      client_id,
      username,
      proxy_username,
      proxy_password,
      proxy_host = 'gate.nodemaven.com',
      quota_mb = 50,
    } = req.body || {};

    const rawUser = String(proxy_username || '').trim();
    const subPrefix = rawUser.includes('-country-')
      ? rawUser.split('-country-')[0].trim()
      : rawUser || String(username || '').trim();

    const nmMap = await fetchNodeMavenSubUsersMap();
    const nmSubUser = nmMap && subPrefix ? nmMap[subPrefix.toLowerCase()] : null;

    if (!nmSubUser || !nmSubUser.id) {
      return res.status(404).json({
        success: false,
        error: `المعرف الفرعي (${subPrefix}) غير مسجل في الخادم الرئيسي`,
      });
    }

    const targetQuotaMb =
      Number(quota_mb) > 0
        ? Number(quota_mb)
        : nmSubUser.traffic_limit_mb > 0
          ? nmSubUser.traffic_limit_mb
          : 50;
    const limitBytes = Math.round(targetQuotaMb * 1000000);

    // Call PUT /api/v2/base/sub-users/ with used_traffic: 0 to refill/reset traffic quota in master server
    const putRes = await fetch('https://api.nodemaven.com/api/v2/base/sub-users/', {
      method: 'PUT',
      headers: {
        Authorization: `x-api-key ${cleanKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        id: nmSubUser.id,
        proxy_username: nmSubUser.proxy_username,
        proxy_password: nmSubUser.proxy_password || proxy_password,
        is_traffic_limited: true,
        used_traffic: 0,
        traffic_limit: limitBytes,
      }),
    });

    const putData = await putRes.json().catch(() => null);
    if (!putRes.ok || !putData?.success) {
      console.error('[NODEMAVEN-REFILL] Error refilling sub-user:', putRes.status, putData);
      return res.status(400).json({
        success: false,
        error: putData?.description || 'تعذر إعادة ملء الحصة في الخادم الرئيسي',
      });
    }

    const officialPassword =
      putData?.payload?.proxy_password || nmSubUser.proxy_password || proxy_password;
    const packedHost = packServerProxyHost(
      proxy_host,
      rawUser || nmSubUser.proxy_username,
      officialPassword,
      targetQuotaMb,
      0
    );

    if (client_id) {
      await supabase
        .from('proxy_clients')
        .update({
          proxy_host: packedHost,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', client_id);
    }

    return res.json({
      success: true,
      sub_user: nmSubUser.proxy_username,
      quota_mb: targetQuotaMb,
      used_mb: 0,
      packed_host: packedHost,
    });
  } catch (err) {
    console.error('[NODEMAVEN-REFILL] Unexpected error:', err);
    return res.status(500).json({ success: false, error: 'Failed to refill traffic in NodeMaven' });
  }
}

app.post('/nodemaven/refill-traffic', handleNodeMavenRefillTraffic);
app.post('/api/nodemaven/refill-traffic', handleNodeMavenRefillTraffic);

// Helper: Generate 13-hex-char NodeMaven session ID (UUIDv4 prefix ending in 4, identical to NodeMaven dashboard)
function generateNodeMavenSid(excludeSid = '') {
  let sid = crypto.randomUUID().replace(/-/g, '').slice(0, 13).toLowerCase();
  let guard = 0;
  while (excludeSid && sid === String(excludeSid).toLowerCase() && guard < 10) {
    sid = crypto.randomUUID().replace(/-/g, '').slice(0, 13).toLowerCase();
    guard++;
  }
  return sid;
}

// Helper: Build canonical proxy username string for NodeMaven or DataImpulse with dynamic country & sticky session
function buildNodeMavenProxyUsername(rawProxyUsername, officialSubUserName, newSid, countryCode = 'sy', provider = 'nodemaven') {
  const raw = String(rawProxyUsername || '').trim();
  const cc = String(countryCode || 'sy').trim().toLowerCase() || 'sy';

  if (provider === 'dataimpulse' || raw.includes('__cr.') || raw.includes(';sessid.')) {
    const baseLogin = (raw.includes('__') ? raw.split('__')[0].trim() : raw) || officialSubUserName || 'user';
    const existingCountryMatch = raw.match(/__cr\.([a-zA-Z]{2})/i);
    const targetCc = countryCode ? cc : (existingCountryMatch ? existingCountryMatch[1].toLowerCase() : 'us');
    const existingTtlMatch = raw.match(/;sessttl\.(\d+)/i);
    const ttl = existingTtlMatch ? existingTtlMatch[1] : '60';
    return `${baseLogin}__cr.${targetCc};sessid.${newSid.slice(0, 10)};sessttl.${ttl}`;
  }

  const baseSubUser =
    officialSubUserName ||
    (raw.includes('-country-') ? raw.split('-country-')[0].trim() : raw) ||
    'user';

  if (!raw) {
    return `${baseSubUser}-country-${cc}-sid-${newSid}-filter-medium-norotate-true`;
  }

  let updated = raw;
  if (updated.includes('-country-') && officialSubUserName) {
    const restAfterSubUser = updated.slice(updated.indexOf('-country-'));
    updated = `${officialSubUserName}${restAfterSubUser}`;
  }

  if (countryCode && /-country-[a-zA-Z]{2}/i.test(updated)) {
    updated = updated.replace(/-country-[a-zA-Z]{2}/i, `-country-${cc}`);
  }

  if (/-sid-[a-zA-Z0-9]+/i.test(updated)) {
    return updated.replace(/-sid-[a-zA-Z0-9]+/i, `-sid-${newSid}`);
  }

  if (updated.includes('-country-')) {
    return `${updated}-sid-${newSid}-filter-medium-norotate-true`;
  }

  return `${baseSubUser}-country-${cc}-sid-${newSid}-filter-medium-norotate-true`;
}

// Helper: Live probe through proxy HTTP gateway to activate the session & get its real Exit IP
function probeNodeMavenProxyExitIp(proxyUsername, proxyPassword, proxyHost = 'gate.nodemaven.com', timeoutMs = 6500) {
  return new Promise((resolve) => {
    const cleanHost = String(proxyHost || 'gate.nodemaven.com')
      .replace(/#.*$/, '')
      .replace(/^.*@/, '')
      .trim() || 'gate.nodemaven.com';
    const isDataImpulse = cleanHost.toLowerCase().includes('dataimpulse');
    const probePort = isDataImpulse ? 823 : 8080;
    const auth = Buffer.from(`${proxyUsername}:${proxyPassword}`).toString('base64');

    const req = http.request(
      {
        host: cleanHost,
        port: probePort,
        method: 'GET',
        path: 'http://ip-api.com/json?fields=status,country,countryCode,regionName,city,isp,query',
        headers: {
          Host: 'ip-api.com',
          'Proxy-Authorization': `Basic ${auth}`,
          'User-Agent': 'curl/8.5.0',
          Connection: 'close',
        },
        timeout: timeoutMs,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed && parsed.status === 'success' && parsed.query) {
              return resolve({
                ok: true,
                exit_ip: parsed.query,
                country: parsed.country || '',
                country_code: parsed.countryCode || 'SY',
                region: parsed.regionName || '',
                city: parsed.city || '',
                isp: parsed.isp || '',
              });
            }
          } catch {
            // ignore parse errors
          }
          return resolve({ ok: false });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false });
    });
    req.on('error', () => {
      resolve({ ok: false });
    });
    req.end();
  });
}

// Helper: Pack user:pass@host#limit=...&used=...&mode=... for Supabase storage
function packServerProxyHost(host, username, password, quotaMb, usedMb, meta = {}) {
  const cleanHost = String(host || 'gate.nodemaven.com')
    .trim()
    .replace(/#.*$/, '')
    .replace(/^.*@/, '');
  const u = username ? String(username).trim() : '';
  const p = password ? String(password).trim() : '';
  const base = u && p ? `${u}:${p}@${cleanHost}` : cleanHost;
  const params = new URLSearchParams();
  if (typeof quotaMb === 'number' && quotaMb > 0) {
    const usedVal = typeof usedMb === 'number' && !Number.isNaN(usedMb) ? Number(usedMb.toFixed(2)) : 0;
    params.set('limit', String(quotaMb));
    params.set('used', String(usedVal));
  }
  if (meta?.mode && meta.mode !== 'shamcash_sy') {
    params.set('mode', String(meta.mode));
    if (meta.provider) params.set('provider', String(meta.provider));
    if (meta.country) params.set('country', String(meta.country).toUpperCase());
    if (meta.sourceId) params.set('source_id', String(meta.sourceId));
    if (meta.extUrl) params.set('ext_url', String(meta.extUrl));
  }
  const qs = params.toString();
  return qs ? `${base}#${qs}` : base;
}

// POST /api/nodemaven/regenerate
// 1. Queries NodeMaven Sub-Users API to verify official sub-user credentials & password from the master dashboard
// 2. Generates a new NodeMaven session (-sid-...) and activates/verifies it live on gate.nodemaven.com
// 3. Guarantees a working Exit IP (and different from previous_ip if provided) and updates Supabase
async function handleNodeMavenRegenerate(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const {
      client_id,
      username,
      proxy_username,
      proxy_password,
      proxy_host = 'gate.nodemaven.com',
      quota_mb = 0,
      used_mb = 0,
      previous_ip = '',
      service_mode = 'shamcash_sy',
      proxy_provider = 'nodemaven',
      country_code = '',
    } = req.body || {};

    const rawUser = String(proxy_username || '').trim();
    const isDataImpulse =
      proxy_provider === 'dataimpulse' ||
      String(proxy_host || '').toLowerCase().includes('dataimpulse') ||
      rawUser.includes('__cr.');

    const subPrefix = isDataImpulse
      ? rawUser.includes('__')
        ? rawUser.split('__')[0].trim()
        : rawUser
      : rawUser.includes('-country-')
        ? rawUser.split('-country-')[0].trim()
        : rawUser || String(username || '').trim();

    const oldSidMatch = isDataImpulse
      ? rawUser.match(/;sessid\.([a-zA-Z0-9]+)/i)
      : rawUser.match(/-sid-([a-zA-Z0-9]+)/i);
    const oldSid = oldSidMatch ? oldSidMatch[1] : '';

    const detectedCountryMatch = isDataImpulse
      ? rawUser.match(/__cr\.([a-zA-Z]{2})/i)
      : rawUser.match(/-country-([a-zA-Z]{2})/i);
    const effectiveCountry =
      String(country_code || '').trim().toLowerCase() ||
      (detectedCountryMatch ? detectedCountryMatch[1].toLowerCase() : 'sy');

    // 1. Sync with live NodeMaven Sub-Users API when provider is NodeMaven
    const nmMap = !isDataImpulse ? await fetchNodeMavenSubUsersMap() : null;
    const nmSubUser = nmMap && subPrefix ? nmMap[subPrefix.toLowerCase()] : null;

    const officialSubUserName = nmSubUser ? nmSubUser.proxy_username : subPrefix;
    const officialPassword =
      (nmSubUser && nmSubUser.proxy_password) || String(proxy_password || '').trim();

    let chosenSid = generateNodeMavenSid(oldSid);
    let chosenProxyUsername = buildNodeMavenProxyUsername(
      rawUser,
      officialSubUserName,
      chosenSid,
      effectiveCountry,
      isDataImpulse ? 'dataimpulse' : 'nodemaven'
    );
    let probeResult = { ok: false };

    // 2. Activate & verify the new proxy session live on gateway (up to 3 attempts if node is slow or same IP)
    if (officialPassword) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const candidateSid = attempt === 0 ? chosenSid : generateNodeMavenSid(chosenSid);
        const candidateUsername = buildNodeMavenProxyUsername(
          rawUser,
          officialSubUserName,
          candidateSid,
          effectiveCountry,
          isDataImpulse ? 'dataimpulse' : 'nodemaven'
        );
        const check = await probeNodeMavenProxyExitIp(
          candidateUsername,
          officialPassword,
          proxy_host,
          5500
        );
        if (check.ok) {
          chosenSid = candidateSid;
          chosenProxyUsername = candidateUsername;
          probeResult = check;
          if (!previous_ip || check.exit_ip !== previous_ip) {
            break;
          }
        }
      }
    }

    // 3. Persist updated proxy string in Supabase (preserving mode/provider/country metadata!)
    const finalQuotaMb =
      nmSubUser && nmSubUser.traffic_limit_bytes > 0 ? nmSubUser.traffic_limit_mb : Number(quota_mb || 0);
    const finalUsedMb =
      nmSubUser && nmSubUser.traffic_used_bytes >= 0 ? nmSubUser.traffic_used_mb : Number(used_mb || 0);

    const packedHost = packServerProxyHost(
      proxy_host,
      chosenProxyUsername,
      officialPassword,
      finalQuotaMb,
      finalUsedMb,
      {
        mode: service_mode,
        provider: isDataImpulse ? 'dataimpulse' : 'nodemaven',
        country: effectiveCountry.toUpperCase(),
      }
    );

    if (client_id) {
      await supabase
        .from('proxy_clients')
        .update({
          proxy_host: packedHost,
          updated_at: new Date().toISOString(),
        })
        .eq('id', client_id);
    }

    return res.json({
      success: true,
      synced_with_nodemaven: Boolean(nmSubUser),
      sub_user: officialSubUserName,
      new_proxy_username: chosenProxyUsername,
      proxy_password: officialPassword,
      new_session_id: chosenSid,
      old_session_id: oldSid || null,
      packed_host: packedHost,
      quota_mb: finalQuotaMb,
      used_mb: finalUsedMb,
      live_check: probeResult,
    });
  } catch (err) {
    console.error('[NODEMAVEN-REGEN] Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to regenerate proxy' });
  }
}

app.post('/nodemaven/regenerate', handleNodeMavenRegenerate);
app.post('/api/nodemaven/regenerate', handleNodeMavenRegenerate);

// POST /api/nodemaven/check-proxy
// Checks the live Exit IP, City, and ISP of a subscriber's current proxy on gate.nodemaven.com
async function handleNodeMavenCheckProxy(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const { proxy_username, proxy_password, proxy_host = 'gate.nodemaven.com' } = req.body || {};
    if (!proxy_username || !proxy_password) {
      return res.status(400).json({ ok: false, error: 'Missing proxy credentials' });
    }
    const check = await probeNodeMavenProxyExitIp(proxy_username, proxy_password, proxy_host, 6500);
    return res.json(check);
  } catch (err) {
    console.error('[NODEMAVEN-CHECK] Error:', err);
    return res.status(500).json({ ok: false });
  }
}

app.post('/nodemaven/check-proxy', handleNodeMavenCheckProxy);
app.post('/api/nodemaven/check-proxy', handleNodeMavenCheckProxy);

// Helper: Generate a valid NodeMaven Sub-User name (>= 9 chars, ^[a-zA-Z0-9_]*$) from a chosen prefix
function buildValidNodeMavenSubUserName(rawPrefix, existingMap = {}) {
  let clean = String(rawPrefix || 'Alishop')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');
  if (!clean) clean = 'Alishop';

  // Check if user typed a full name that is already >= 9 chars and doesn't exist yet
  if (clean.length >= 9 && !existingMap[clean.toLowerCase()]) {
    return clean;
  }

  // Strip trailing digits to find base prefix for sequential numbering (e.g. Ammarmedia -> Ammarmedia6)
  const basePrefix = clean.replace(/[0-9]+$/, '') || clean;

  for (let i = 1; i <= 9999; i++) {
    let candidate = `${basePrefix}${i}`;
    // NodeMaven requires minimum 9 characters for proxy_username
    if (candidate.length < 9) {
      const padLen = 9 - basePrefix.length;
      const paddedNum = String(i).padStart(Math.max(2, padLen), '0');
      candidate = `${basePrefix}_${paddedNum}`.replace(/__+/g, '_');
      if (candidate.length < 9) {
        candidate = `${basePrefix}00${paddedNum}`.slice(0, 12);
      }
    }
    if (!existingMap[candidate.toLowerCase()]) {
      return candidate;
    }
  }

  const rand = Math.floor(10000 + Math.random() * 90000);
  return `${basePrefix}_${rand}`;
}

// POST /api/nodemaven/create-subuser
// Creates a brand-new Sub-User from scratch inside the master NodeMaven dashboard via API v2
// and generates its Syrian proxy string (<sub_user>-country-sy-sid-<sid>-filter-medium-norotate-true)
async function handleNodeMavenCreateSubUser(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const cleanKey = getNodeMavenApiKey();
  if (!cleanKey) {
    return res.status(500).json({ success: false, error: 'Missing NodeMaven API key' });
  }

  try {
    const {
      proxy_prefix = 'Alishop',
      quota_mb = 50,
      proxy_host = 'gate.nodemaven.com',
      country_code = 'sy',
    } = req.body || {};

    const cc = String(country_code || 'sy').trim().toLowerCase() || 'sy';
    const nmMap = (await fetchNodeMavenSubUsersMap()) || {};
    const newSubUserName = buildValidNodeMavenSubUserName(proxy_prefix, nmMap);
    // NodeMaven password requirement: >= 9 chars, alphanumeric/underscore (13 hex chars ending in 4 matches NodeMaven standard)
    const newProxyPassword = `${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toLowerCase()}4`;

    const limitMbNum = Number(quota_mb);
    const isLimited = !Number.isNaN(limitMbNum) && limitMbNum > 0;
    const limitBytes = isLimited ? Math.round(limitMbNum * 1000000) : undefined;

    const createPayload = {
      proxy_username: newSubUserName,
      proxy_password: newProxyPassword,
      is_traffic_limited: isLimited,
      ...(isLimited ? { traffic_limit: limitBytes } : {}),
    };

    const nmRes = await fetch('https://api.nodemaven.com/api/v2/base/sub-users/', {
      method: 'POST',
      headers: {
        Authorization: `x-api-key ${cleanKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(createPayload),
    });

    const nmData = await nmRes.json().catch(() => null);
    if (!nmRes.ok || !nmData?.success) {
      console.error('[NODEMAVEN-CREATE] Error creating sub-user:', nmRes.status, nmData);
      return res.status(400).json({
        success: false,
        error: nmData?.description || 'تعذر إنشاء البروكسي في الخادم الرئيسي',
        details: nmData?.errors || {},
      });
    }

    const createdPayload = nmData.payload || {};
    const officialSubUser = createdPayload.proxy_username || newSubUserName;
    const officialPassword = createdPayload.proxy_password || newProxyPassword;
    const newSid = generateNodeMavenSid();
    const fullProxyUsername = `${officialSubUser}-country-${cc}-sid-${newSid}-filter-medium-norotate-true`;

    // Probe gateway to activate the sticky session immediately
    const liveCheck = await probeNodeMavenProxyExitIp(
      fullProxyUsername,
      officialPassword,
      proxy_host,
      5500
    );

    return res.status(201).json({
      success: true,
      sub_user_id: createdPayload.id || null,
      sub_user: officialSubUser,
      full_proxy_username: fullProxyUsername,
      proxy_password: officialPassword,
      session_id: newSid,
      country_code: cc.toUpperCase(),
      quota_mb: isLimited ? limitMbNum : 0,
      live_check: liveCheck,
    });
  } catch (err) {
    console.error('[NODEMAVEN-CREATE] Unexpected error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create sub-user' });
  }
}

app.post('/nodemaven/create-subuser', handleNodeMavenCreateSubUser);
app.post('/api/nodemaven/create-subuser', handleNodeMavenCreateSubUser);

// ============================================================
// 1B. EXTERNAL V2RAY SOURCES MANAGEMENT & USERINFO PROBING API
// ============================================================
async function handleGetExternalV2RaySources(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const shouldRefresh = req.query?.refresh === '1' || req.query?.refresh === 'true';
    const store = await getExternalV2RaySourcesStore();
    let sources = store.sources;

    if (shouldRefresh && sources.length > 0) {
      const refreshed = await Promise.all(
        sources.map(async (src) => {
          const probed = await probeExternalV2RaySource(src.source_url, 7000);
          return {
            ...src,
            server_count: probed.ok ? probed.server_count || src.server_count || 0 : src.server_count || 0,
            protocols: probed.ok && probed.protocols?.length ? probed.protocols : src.protocols || [],
            userinfo: probed.ok
              ? probed.userinfo
                ? { ...probed.userinfo, status: 'ok', checked_at: probed.checked_at }
                : { status: 'no_header', checked_at: probed.checked_at }
              : {
                  ...(src.userinfo || {}),
                  status: 'error',
                  error_msg: probed.error_msg,
                  checked_at: probed.checked_at,
                },
          };
        })
      );
      sources = refreshed;
      await saveExternalV2RaySourcesStore(sources);
    }

    return res.json({ success: true, sources });
  } catch (err) {
    console.error('[EXT-V2RAY] GET error:', err);
    return res.status(500).json({ success: false, error: 'تعذر جلب المصادر الخارجية' });
  }
}

async function handleSaveExternalV2RaySource(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const { id, name, source_url, country_code = 'AUTO', notes = '' } = req.body || {};
    const cleanName = String(name || '').trim();
    const cleanUrl = String(source_url || '').trim();
    const cleanCountry = String(country_code || 'AUTO').trim().toUpperCase() || 'AUTO';

    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال اسم المصدر الخارجي' });
    }
    const validation = validateExternalSubscriptionUrl(cleanUrl);
    if (!validation.ok) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    const probed = await probeExternalV2RaySource(cleanUrl, 7500);
    const store = await getExternalV2RaySourcesStore();
    const sourceId = id && String(id).trim() ? String(id).trim() : `v2src_${crypto.randomUUID().slice(0, 8)}`;

    const entry = {
      id: sourceId,
      name: cleanName,
      source_url: cleanUrl,
      kind: validation.kind,
      country_code: cleanCountry,
      notes: String(notes || '').trim(),
      server_count: probed.ok ? probed.server_count || 0 : 0,
      protocols: probed.ok && probed.protocols?.length ? probed.protocols : [],
      userinfo: probed.ok
        ? probed.userinfo
          ? { ...probed.userinfo, status: 'ok', checked_at: probed.checked_at }
          : { status: 'no_header', checked_at: probed.checked_at }
        : {
            status: 'error',
            error_msg: probed.error_msg,
            checked_at: probed.checked_at,
          },
      created_at:
        store.sources.find((s) => s.id === sourceId)?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const existsIdx = store.sources.findIndex((s) => s.id === sourceId);
    const nextSources =
      existsIdx >= 0
        ? store.sources.map((s) => (s.id === sourceId ? entry : s))
        : [entry, ...store.sources];

    await saveExternalV2RaySourcesStore(nextSources);
    return res.json({ success: true, source: entry, sources: nextSources });
  } catch (err) {
    console.error('[EXT-V2RAY] POST error:', err);
    return res.status(500).json({ success: false, error: 'تعذر حفظ المصدر الخارجي' });
  }
}

async function handleDeleteExternalV2RaySource(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const targetId = String(req.params?.id || '').trim();
    if (!targetId) {
      return res.status(400).json({ success: false, error: 'معرف المصدر غير صالح' });
    }
    const store = await getExternalV2RaySourcesStore();
    const nextSources = store.sources.filter((s) => s.id !== targetId);
    await saveExternalV2RaySourcesStore(nextSources);
    return res.json({ success: true, sources: nextSources });
  } catch (err) {
    console.error('[EXT-V2RAY] DELETE error:', err);
    return res.status(500).json({ success: false, error: 'تعذر حذف المصدر الخارجي' });
  }
}

async function handleProbeExternalV2Ray(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const { source_url, source_id } = req.body || {};
    let targetUrl = String(source_url || '').trim();
    const store = await getExternalV2RaySourcesStore();

    if (!targetUrl && source_id) {
      const found = store.sources.find((s) => s.id === source_id);
      if (found) targetUrl = found.source_url;
    }

    const probed = await probeExternalV2RaySource(targetUrl, 8000);

    if (source_id) {
      const nextSources = store.sources.map((s) =>
        s.id === source_id
          ? {
              ...s,
              server_count: probed.ok ? probed.server_count || s.server_count || 0 : s.server_count || 0,
              protocols: probed.ok && probed.protocols?.length ? probed.protocols : s.protocols || [],
              userinfo: probed.ok
                ? probed.userinfo
                  ? { ...probed.userinfo, status: 'ok', checked_at: probed.checked_at }
                  : { status: 'no_header', checked_at: probed.checked_at }
                : {
                    ...(s.userinfo || {}),
                    status: 'error',
                    error_msg: probed.error_msg,
                    checked_at: probed.checked_at,
                  },
            }
          : s
      );
      await saveExternalV2RaySourcesStore(nextSources);
      return res.json({
        success: probed.ok,
        probe: {
          status: probed.status,
          kind: probed.kind,
          server_count: probed.server_count || 0,
          protocols: probed.protocols || [],
          userinfo: probed.userinfo || null,
          error_msg: probed.error_msg || null,
          checked_at: probed.checked_at,
        },
        sources: nextSources,
      });
    }

    return res.json({
      success: probed.ok,
      probe: {
        status: probed.status,
        kind: probed.kind,
        server_count: probed.server_count || 0,
        protocols: probed.protocols || [],
        userinfo: probed.userinfo || null,
        error_msg: probed.error_msg || null,
        checked_at: probed.checked_at,
      },
    });
  } catch (err) {
    console.error('[EXT-V2RAY] PROBE error:', err);
    return res.status(500).json({ success: false, error: 'تعذر فحص رابط المصدر الخارجي' });
  }
}

app.get('/external-v2ray/sources', handleGetExternalV2RaySources);
app.get('/api/external-v2ray/sources', handleGetExternalV2RaySources);
app.post('/external-v2ray/sources', handleSaveExternalV2RaySource);
app.post('/api/external-v2ray/sources', handleSaveExternalV2RaySource);
app.delete('/external-v2ray/sources/:id', handleDeleteExternalV2RaySource);
app.delete('/api/external-v2ray/sources/:id', handleDeleteExternalV2RaySource);
app.post('/external-v2ray/probe', handleProbeExternalV2Ray);
app.post('/api/external-v2ray/probe', handleProbeExternalV2Ray);

// ============================================================
// 2. HAPP ENCRYPTED LINK GENERATOR: GET /happ/:username
// Calls official https://crypto.happ.su/api-v2.php to produce happ://crypt5/...
// ============================================================
const HAPP_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAlBetA0wjbaj+h7oJ/d/h
pNrXvAcuhOdFGEFcfCxSWyLzWk4SAQ05gtaEGZyetTax2uqagi9HT6lapUSUe2S8
nMLJf5K+LEs9TYrhhBdx/B0BGahA+lPJa7nUwp7WfUmSF4hir+xka5ApHjzkAQn6
cdG6FKtSPgq1rYRPd1jRf2maEHwiP/e/jqdXLPP0SFBjWTMt/joUDgE7v/IGGB0L
Q7mGPAlgmxwUHVqP4bJnZ//5sNLxWMjtYHOYjaV+lixNSfhFM3MdBndjpkmgSfmg
D5uYQYDL29TDk6Eu+xetUEqry8ySPjUbNWdDXCglQWMxDGjaqYXMWgxBA1UKjUBW
wbgr5yKTJ7mTqhlYEC9D5V/LOnKd6pTSvaMxkHXwk8hBWvUNWAxzAf5JZ7EVE3jt
0j682+/hnmL/hymUE44yMG1gCcWvSpB3BTlKoMnl4yrTakmdkbASeFRkN3iMRewa
IenvMhzJh1fq7xwX94otdd5eLB2vRFavrnhOcN2JJAkKTnx9dwQwFpGEkg+8U613
+Tfm/f82l56fFeoFN98dD2mUFLFZoeJ5CG81ZeXrH83niI0joX7rtoAZIPWzq3Y1
Zb/Zq+kK2hSIhphY172Uvs8X2Qp2ac9UoTPM71tURsA9IvPNvUwSIo/aKlX5KE3I
VE0tje7twWXL5Gb1sfcXRzsCAwEAAQ==
-----END PUBLIC KEY-----`;

async function encryptUrlForHapp(targetUrl) {
  try {
    const response = await fetch('https://crypto.happ.su/api-v2.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl }),
    });
    if (response.ok) {
      const data = await response.json();
      if (data && data.encrypted_link) {
        return data.encrypted_link;
      }
    }
  } catch (err) {
    console.error('[HAPP-CRYPT] Remote API fallback triggered:', err);
  }

  // Fallback local RSA-4096 encryption (happ://crypt4/)
  const encryptedBuffer = crypto.publicEncrypt(
    {
      key: HAPP_RSA_PUBLIC_KEY,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(targetUrl, 'utf-8')
  );
  return `happ://crypt4/${encryptedBuffer.toString('base64')}`;
}

async function handleHappEncryptRequest(req, res) {
  const { username } = req.params;
  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const cleanUsername = username.trim();
  const rawSubUrl = `${PUBLIC_API_BASE}/sub/${encodeURIComponent(cleanUsername)}?client=happ`;

  try {
    const encryptedLink = await encryptUrlForHapp(rawSubUrl);
    return res.status(200).json({
      username: cleanUsername,
      sub_url: rawSubUrl,
      encrypted_link: encryptedLink,
    });
  } catch (err) {
    console.error(`[HAPP-CRYPT] Error encrypting for ${cleanUsername}:`, err);
    return res.status(500).json({ error: 'Failed to generate Happ encrypted link' });
  }
}

app.get('/happ/:username', handleHappEncryptRequest);
app.get('/api/happ/:username', handleHappEncryptRequest);

// ============================================================
// 3. LEGACY PAC ENDPOINT: GET /pac/:username
// ============================================================
function getDirectPac() {
  return 'function FindProxyForURL(url, host) { return "DIRECT"; }\n';
}

function getShamCashPac(proxyHost, proxyPort) {
  return `function FindProxyForURL(url, host) {
    if (shExpMatch(host, "*api.shamcash.sy*") || 
        shExpMatch(host, "*bank.shamcash.sy*") ||
        shExpMatch(host, "*payment.shamcash.sy*") ||
        shExpMatch(host, "*app.shamcash.sy*")) {
        return "PROXY ${proxyHost}:${proxyPort}";
    }
    return "DIRECT";
}
`;
}

async function handlePacRequest(req, res) {
  const { username } = req.params;
  const callerIp = getCallerIp(req);
  const callerHwid = getCallerHwid(req);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  try {
    const result = await verifyAndBindClient(username, callerIp, callerHwid);
    if (!result.allowed || !result.client) {
      return res.send(getDirectPac());
    }
    return res.send(getShamCashPac(result.client.proxy_host, result.client.proxy_port));
  } catch (err) {
    console.error(`[PAC] Unexpected error for ${username}:`, err);
    return res.send(getDirectPac());
  }
}

app.get('/pac/:username', handlePacRequest);
app.get('/api/pac/:username', handlePacRequest);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'shamcash-proxy-api',
    endpoints: ['/sub/:username', '/happ/:username', '/pac/:username'],
    device_binding: 'hwid_and_ip_enabled',
    caller_ip: getCallerIp(req),
    caller_hwid: getCallerHwid(req) || null,
    timestamp: new Date().toISOString(),
  });
});

export default app;
