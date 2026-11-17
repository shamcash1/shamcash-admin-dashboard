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
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

// Helper to unpack user:pass@host#limit=500&used=12.5 from proxy_host
function parseStoredProxyHost(rawProxyHost, fallbackUser = '', fallbackPass = '') {
  let raw = String(rawProxyHost || '').trim();
  let quotaMb = 500; // Default 500 MB allocation if not specified
  let usedMb = 0;

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

  // Extract NodeMaven sub-user prefix (e.g. "Alishoop2" from "Alishoop2-country-sy-sid-...")
  const subUserPrefix = pUser.includes('-country-')
    ? pUser.split('-country-')[0].trim()
    : pUser.trim();

  return { host, pUser, pPass, quotaMb, usedMb, subUserPrefix };
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
      : { host: '', pUser: '', pPass: '', quotaMb: 500, usedMb: 0, subUserPrefix: '' };

    let { host, pUser, pPass, quotaMb, usedMb, subUserPrefix } = parsedProxy;

    // Live sync with NodeMaven API
    if (subUserPrefix) {
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
    const isQuotaExhausted = quotaMb > 0 && usedMb >= quotaMb;

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

// Helper: Build canonical NodeMaven proxy username string synced with official Sub-User name from NodeMaven API
function buildNodeMavenProxyUsername(rawProxyUsername, officialSubUserName, newSid) {
  const raw = String(rawProxyUsername || '').trim();
  const baseSubUser =
    officialSubUserName ||
    (raw.includes('-country-') ? raw.split('-country-')[0].trim() : raw) ||
    'user';

  if (!raw) {
    return `${baseSubUser}-country-sy-sid-${newSid}-filter-medium-norotate-true`;
  }

  let updated = raw;
  if (updated.includes('-country-') && officialSubUserName) {
    const restAfterSubUser = updated.slice(updated.indexOf('-country-'));
    updated = `${officialSubUserName}${restAfterSubUser}`;
  }

  if (/-sid-[a-zA-Z0-9]+/i.test(updated)) {
    return updated.replace(/-sid-[a-zA-Z0-9]+/i, `-sid-${newSid}`);
  }

  if (updated.includes('-country-')) {
    return `${updated}-sid-${newSid}-filter-medium-norotate-true`;
  }

  return `${baseSubUser}-country-sy-sid-${newSid}-filter-medium-norotate-true`;
}

// Helper: Live probe through gate.nodemaven.com:8080 to activate the session on NodeMaven & get its real Exit IP
function probeNodeMavenProxyExitIp(proxyUsername, proxyPassword, proxyHost = 'gate.nodemaven.com', timeoutMs = 6500) {
  return new Promise((resolve) => {
    const cleanHost = String(proxyHost || 'gate.nodemaven.com')
      .replace(/#.*$/, '')
      .replace(/^.*@/, '')
      .trim() || 'gate.nodemaven.com';
    const auth = Buffer.from(`${proxyUsername}:${proxyPassword}`).toString('base64');

    const req = http.request(
      {
        host: cleanHost,
        port: 8080,
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

// Helper: Pack user:pass@host#limit=...&used=... for Supabase storage
function packServerProxyHost(host, username, password, quotaMb, usedMb) {
  const cleanHost = String(host || 'gate.nodemaven.com')
    .trim()
    .replace(/#.*$/, '')
    .replace(/^.*@/, '');
  const u = username ? String(username).trim() : '';
  const p = password ? String(password).trim() : '';
  const base = u && p ? `${u}:${p}@${cleanHost}` : cleanHost;
  if (typeof quotaMb === 'number' && quotaMb > 0) {
    const usedVal = typeof usedMb === 'number' && !Number.isNaN(usedMb) ? Number(usedMb.toFixed(2)) : 0;
    return `${base}#limit=${quotaMb}&used=${usedVal}`;
  }
  return base;
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
    } = req.body || {};

    const rawUser = String(proxy_username || '').trim();
    const subPrefix = rawUser.includes('-country-')
      ? rawUser.split('-country-')[0].trim()
      : rawUser || String(username || '').trim();

    const oldSidMatch = rawUser.match(/-sid-([a-zA-Z0-9]+)/i);
    const oldSid = oldSidMatch ? oldSidMatch[1] : '';

    // 1. Sync with live NodeMaven Sub-Users API so sub-user & password match the master NodeMaven dashboard
    const nmMap = await fetchNodeMavenSubUsersMap();
    const nmSubUser = nmMap && subPrefix ? nmMap[subPrefix.toLowerCase()] : null;

    const officialSubUserName = nmSubUser ? nmSubUser.proxy_username : subPrefix;
    const officialPassword =
      (nmSubUser && nmSubUser.proxy_password) || String(proxy_password || '').trim();

    let chosenSid = generateNodeMavenSid(oldSid);
    let chosenProxyUsername = buildNodeMavenProxyUsername(rawUser, officialSubUserName, chosenSid);
    let probeResult = { ok: false };

    // 2. Activate & verify the new proxy session live on gate.nodemaven.com (up to 3 attempts if node is slow or same IP)
    if (officialPassword) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const candidateSid = attempt === 0 ? chosenSid : generateNodeMavenSid(chosenSid);
        const candidateUsername = buildNodeMavenProxyUsername(
          rawUser,
          officialSubUserName,
          candidateSid
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

    // 3. Persist updated proxy string in Supabase
    const finalQuotaMb =
      nmSubUser && nmSubUser.traffic_limit_bytes > 0 ? nmSubUser.traffic_limit_mb : Number(quota_mb || 0);
    const finalUsedMb =
      nmSubUser && nmSubUser.traffic_used_bytes >= 0 ? nmSubUser.traffic_used_mb : Number(used_mb || 0);

    const packedHost = packServerProxyHost(
      proxy_host,
      chosenProxyUsername,
      officialPassword,
      finalQuotaMb,
      finalUsedMb
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
    } = req.body || {};

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
    const fullProxyUsername = `${officialSubUser}-country-sy-sid-${newSid}-filter-medium-norotate-true`;

    // Probe gate.nodemaven.com to activate the Syrian session immediately
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
      quota_mb: isLimited ? limitMbNum : 0,
      live_check: liveCheck,
    });
  } catch (err) {
    console.error('[NODEMAVEN-CREATE] Unexpected error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create NodeMaven sub-user' });
  }
}

app.post('/nodemaven/create-subuser', handleNodeMavenCreateSubUser);
app.post('/api/nodemaven/create-subuser', handleNodeMavenCreateSubUser);

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
