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
    'profile-title, profile-update-interval, subscription-userinfo, subscription-always-hwid-enable, content-disposition'
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

// Helper to detect if a request is coming from a plain web browser (to prevent browser snooping)
function isPlainWebBrowserRequest(req) {
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  const accept = String(req.headers['accept'] || '').toLowerCase();
  const hwid = getCallerHwid(req);

  // If request has HWID or known proxy client User-Agent, allow it
  if (hwid) return false;
  if (
    ua.includes('happ') ||
    ua.includes('v2ray') ||
    ua.includes('v2box') ||
    ua.includes('hiddify') ||
    ua.includes('karing') ||
    ua.includes('sing-box') ||
    ua.includes('sfa') ||
    ua.includes('streisand') ||
    ua.includes('shadowrocket') ||
    ua.includes('clash') ||
    ua.includes('dart') ||
    ua.includes('go-http-client') ||
    ua.includes('cfnetwork') ||
    ua.includes('okhttp')
  ) {
    return false;
  }

  // If it explicitly requests text/html from a standard Mozilla/Chrome/Safari browser
  if (accept.includes('text/html') && ua.includes('mozilla/')) {
    return true;
  }

  return false;
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

  // 2. If previously bound to an IP, and now Happ sends a permanent HWID from the same IP, upgrade to HWID lock
  if (!registeredDevice.startsWith('HWID:') && callerHwid && registeredDevice === callerIp) {
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

// ============================================================
// 1. SUBSCRIPTION ENDPOINT: GET /sub/:username
// Optimized for Happ (Encrypted + HWID Lock) & v2rayNG / V2Box
// ============================================================
async function handleSubscriptionRequest(req, res) {
  const { username } = req.params;
  const callerIp = getCallerIp(req);
  const callerHwid = getCallerHwid(req);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  // Block plain web browsers from opening the raw subscription link to inspect Base64
  if (isPlainWebBrowserRequest(req) && req.query?.allow_browser !== '1') {
    return res
      .status(403)
      .send('Access Denied: Protected Subscription. Please import the encrypted happ:// code inside the Happ app.');
  }

  try {
    const result = await verifyAndBindClient(username, callerIp, callerHwid);

    if (!result.allowed || !result.client) {
      return res.status(200).send('');
    }

    const clientData = result.client;

    // 1. Extract proxy details from Supabase (supports both separate columns and user:pass@host in proxy_host)
    let host = String(clientData.proxy_host).trim();
    const port = Number(clientData.proxy_port);
    let pUser = clientData.proxy_username ? String(clientData.proxy_username).trim() : '';
    let pPass = clientData.proxy_password ? String(clientData.proxy_password).trim() : '';

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

    // 2. Encode auth section (user:pass or ":" for unauthenticated proxies)
    const rawAuth = pUser && pPass ? `${pUser}:${pPass}` : ':';
    const encodedAuth = Buffer.from(rawAuth, 'utf-8').toString('base64');

    // 3. Build URI with VPN Alishop branding
    const tag = encodeURIComponent(`VPN Alishop - ${clientData.username}`);
    const uri = `socks://${encodedAuth}@${host}:${port}#${tag}`;

    // 4. Compute expiry timestamp in Unix seconds for Happ / subscription header
    const expiryDateObj = new Date(clientData.expiry_date);
    if (!String(clientData.expiry_date).includes('T')) {
      expiryDateObj.setHours(23, 59, 59, 999);
    }
    const expireUnix = Math.floor(expiryDateObj.getTime() / 1000);

    // 5. Set Official Happ App Management & Subscription Headers
    const profileTitlePlain = `VPN Alishop - ${clientData.username}`.slice(0, 25);
    const profileTitleBase64 = Buffer.from(profileTitlePlain, 'utf-8').toString('base64');

    res.setHeader('profile-title', `base64:${profileTitleBase64}`);
    res.setHeader('profile-update-interval', '1');
    res.setHeader('subscription-always-hwid-enable', '1');
    res.setHeader(
      'subscription-userinfo',
      `upload=0; download=0; total=107374182400; expire=${expireUnix}`
    );

    // 6. Base64 encode the final subscription payload
    const finalBase64 = Buffer.from(uri, 'utf-8').toString('base64');

    return res.status(200).send(finalBase64);
  } catch (err) {
    console.error(`[SUB] Unexpected error for ${username}:`, err);
    return res.status(200).send('');
  }
}

app.get('/sub/:username', handleSubscriptionRequest);
app.get('/api/sub/:username', handleSubscriptionRequest);

// ============================================================
// 2. HAPP ENCRYPTED LINK GENERATOR: GET /happ/:username
// Calls official https://crypto.happ.su/api-v2.php to produce happ://crypt5/...
// Once imported in Happ, the user CANNOT view, edit, or share the proxy IP/Port/Credentials.
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
  const rawSubUrl = `${PUBLIC_API_BASE}/sub/${encodeURIComponent(cleanUsername)}`;

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
