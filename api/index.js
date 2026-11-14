import express from 'express';
import crypto from 'crypto';
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
    'profile-title, profile-update-interval, subscription-userinfo, subscription-always-hwid-enable, routing-enable, exclude-routes, exclude-routes-set, no-limit-enabled, content-disposition'
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

// Optional NodeMaven live sub-user usage fetcher (when NODEMAVEN_API_KEY is configured in env)
async function fetchNodeMavenSubUsersMap() {
  const apiKey = process.env.NODEMAVEN_API_KEY || '';
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.nodemaven.com/api/v2/base/sub-users/', {
      method: 'GET',
      headers: {
        Authorization: `x-api-key ${apiKey}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const list = Array.isArray(data)
      ? data
      : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.data)
          ? data.data
          : [];
    const map = {};
    for (const item of list) {
      const u = String(item.proxy_username || item.username || '').trim().toLowerCase();
      if (u) {
        map[u] = {
          id: item.id,
          proxy_username: item.proxy_username || item.username,
          traffic_limit_bytes: Number(item.traffic_limit ?? 0),
          traffic_used_bytes: Number(item.used_traffic ?? item.traffic_used ?? 0),
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

// ============================================================
// 1. SUBSCRIPTION ENDPOINT: GET /sub/:username
// Compatible with Happ (Xray JSON + HWID Lock + Instant Pause) & v2rayNG / V2Box
// ============================================================
async function handleSubscriptionRequest(req, res) {
  const { username } = req.params;
  const callerIp = getCallerIp(req);
  const callerHwid = getCallerHwid(req);
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  const isHappClient = ua.includes('happ') || Boolean(callerHwid) || req.query?.client === 'happ';

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
  res.setHeader('hide-settings', '1');
  res.setHeader('routing-enable', '0');
  res.setHeader('exclude-routes-set', excludedDnsAndLanRoutes);
  res.setHeader('exclude-routes', excludedDnsAndLanRoutes);
  res.setHeader('no-limit-enabled', '1');

  try {
    const result = await verifyAndBindClient(username, callerIp, callerHwid);
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

    // Optional live sync with NodeMaven API if NODEMAVEN_API_KEY is configured
    if (subUserPrefix && process.env.NODEMAVEN_API_KEY) {
      const nmMap = await fetchNodeMavenSubUsersMap();
      const nmEntry = nmMap ? nmMap[subUserPrefix.toLowerCase()] : null;
      if (nmEntry) {
        if (nmEntry.traffic_limit_bytes > 0) {
          quotaMb = Number((nmEntry.traffic_limit_bytes / (1024 * 1024)).toFixed(2));
        }
        usedMb = Number((nmEntry.traffic_used_bytes / (1024 * 1024)).toFixed(2));
      }
    }

    const limitBytes = quotaMb > 0 ? Math.round(quotaMb * 1024 * 1024) : 107374182400;
    const usedBytes = Math.min(limitBytes, Math.max(0, Math.round(usedMb * 1024 * 1024)));
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

      if (isHappClient) {
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

    // 4. If requested by Happ (or with HWID header), return a complete Xray JSON Array configuration
    // with ULTRA-LOW BANDWIDTH SPLIT-TUNNELING:
    // - ONLY Sham Cash API domains (*.shamcash.sy, *.shamcash.org) are routed through "proxy".
    // - Heavy APK downloads (download.shamcash.sy) and ALL other apps/system services (Google Play,
    //   Firebase, YouTube, WhatsApp, OS background sync) are routed to "direct" (0 proxy bandwidth used!).
    // - "routeOnly": false + "domainStrategy": "AsIs" ensures TLS SNI domain names are sent to the proxy.
    if (isHappClient) {
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
          ? `شام كاش فقط · متبقي ${remainingMb}MB من ${quotaMb}MB`
          : 'ShamCash Only (Ultra-Low Data)';

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
              destOverride: ['http', 'tls'],
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
              destOverride: ['http', 'tls'],
              routeOnly: false,
            },
          },
        ],
        outbounds: [
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
          {
            tag: 'block',
            protocol: 'blackhole',
            settings: {
              response: {
                type: 'none',
              },
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
              domain: [
                'full:download.shamcash.sy',
                'domain:googleapis.com',
                'domain:gstatic.com',
                'domain:google.com',
                'domain:firebaseio.com',
                'domain:crashlytics.com',
                'domain:slsandbox.tech',
              ],
              outboundTag: 'direct',
            },
            {
              type: 'field',
              domain: [
                'domain:api.shamcash.sy',
                'domain:api-02.shamcash.sy',
                'domain:api-03.shamcash.sy',
                'domain:bank.shamcash.sy',
                'domain:payment.shamcash.sy',
                'domain:support.shamcash.sy',
                'domain:deeplink.shamcash.sy',
                'domain:shamcash.sy',
                'domain:shamcash.org',
              ],
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
              outboundTag: 'direct',
            },
          ],
        },
      };

      return res.status(200).send(JSON.stringify([xrayConfig], null, 2));
    }

    // 5. Standard v2rayNG / V2Box Base64 format
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

// Optional NodeMaven Live Traffic Sync Endpoint for Admin Dashboard
app.get('/api/nodemaven/usage', async (_req, res) => {
  const map = await fetchNodeMavenSubUsersMap();
  return res.json({
    connected: Boolean(map),
    sub_users: map || {},
  });
});

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
        shExpMatch(host, "*bank.shamcash.sy*")) {
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
