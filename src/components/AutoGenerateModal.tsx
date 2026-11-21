import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Sparkles,
  Server,
  RefreshCw,
  ShieldCheck,
  Globe,
  Zap,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  Sliders,
} from 'lucide-react';
import {
  ProxyClient,
  ServiceMode,
  ProxyProvider,
  ExternalV2RaySource,
  COUNTRY_OPTIONS,
  getCountryInfo,
  addDaysToDateString,
  formatDataMb,
  generateSubscriberWithPrefix,
  previewNextNodeMavenSubUserName,
  createNodeMavenSubUserLive,
  buildResidentialProxyUsername,
  generateNodeMavenSessionId,
  parseProxyDetails,
} from '../lib/supabase';

export interface VerifiedIpResult {
  ok: boolean;
  exit_ip?: string;
  city?: string;
  region?: string;
  isp?: string;
  country_code?: string;
}

interface AutoGenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: ProxyClient[];
  existingNodeMavenSubUserNames: string[];
  externalSources: ExternalV2RaySource[];
  initialMode?: ServiceMode;
  onOpenExternalSources: () => void;
  onCreateClient: (
    clientData: Omit<ProxyClient, 'id' | 'created_at' | 'updated_at'>,
    verifiedIp?: VerifiedIpResult
  ) => Promise<void>;
  onSyncUsage: () => Promise<void>;
  onToast: (msg: string) => void;
}

const POPULAR_RESIDENTIAL_COUNTRIES = ['US', 'GB', 'DE', 'TR', 'AE', 'SA', 'FR', 'NL'];
const RESIDENTIAL_COUNTRY_OPTIONS = COUNTRY_OPTIONS.filter((c) => c.code !== 'AUTO');

const DI_STORAGE_KEYS = {
  baseUser: 'vpn_alishop_di_base_user_v1',
  password: 'vpn_alishop_di_password_v1',
  host: 'vpn_alishop_di_host_v1',
  port: 'vpn_alishop_di_port_v1',
  ttl: 'vpn_alishop_di_ttl_v1',
};

function readStorage(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

export const AutoGenerateModal: React.FC<AutoGenerateModalProps> = ({
  isOpen,
  onClose,
  clients,
  existingNodeMavenSubUserNames,
  externalSources,
  initialMode = 'shamcash_sy',
  onOpenExternalSources,
  onCreateClient,
  onSyncUsage,
  onToast,
}) => {
  // Active Service Mode
  const [serviceMode, setServiceMode] = useState<ServiceMode>(initialMode);

  // Mode 1 & Mode 2 (NodeMaven) Sub-User Prefix
  const [nmProxyPrefix, setNmProxyPrefix] = useState<string>(() =>
    readStorage('shamcash_NmProxyPrefix_v1', 'Ammarmedia')
  );

  // Mode 2 (Custom Residential) Provider, Country, DataImpulse config
  const [proxyProvider, setProxyProvider] = useState<ProxyProvider>('nodemaven');
  const [countryCode, setCountryCode] = useState<string>('US');
  const [diBaseUser, setDiBaseUser] = useState<string>(() =>
    readStorage(DI_STORAGE_KEYS.baseUser, '')
  );
  const [diPassword, setDiPassword] = useState<string>(() =>
    readStorage(DI_STORAGE_KEYS.password, '')
  );
  const [diHost, setDiHost] = useState<string>(() =>
    readStorage(DI_STORAGE_KEYS.host, 'gw.dataimpulse.com')
  );
  const [diPort, setDiPort] = useState<string>(() => readStorage(DI_STORAGE_KEYS.port, '10000'));
  const [diStickyTtl, setDiStickyTtl] = useState<string>(() =>
    readStorage(DI_STORAGE_KEYS.ttl, '30')
  );
  const [previewDiSid, setPreviewDiSid] = useState<string>(() =>
    generateNodeMavenSessionId().slice(0, 10)
  );

  // Mode 3 (External V2Ray) Source / Custom Direct Link
  const [externalSourceId, setExternalSourceId] = useState<string>('');
  const [useCustomExternalUrl, setUseCustomExternalUrl] = useState<boolean>(false);
  const [externalCustomUrl, setExternalCustomUrl] = useState<string>('');
  const [v2rayCountryCode, setV2rayCountryCode] = useState<string>('AUTO');

  // Common Subscriber Identity, Quota & Duration
  const [subscriberPrefix, setSubscriberPrefix] = useState<string>(() =>
    readStorage('shamcash_PreferredPrefix_v1', 'alishop')
  );
  const [customSubscriberName, setCustomSubscriberName] = useState<string>('');
  const [quotaMb, setQuotaMb] = useState<string>('50');
  const [durationDays, setDurationDays] = useState<number>(30);

  // Submission state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize modal state cleanly when opened
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    const startMode: ServiceMode = initialMode || 'shamcash_sy';
    setServiceMode(startMode);
    setDurationDays(30);
    setQuotaMb(startMode === 'residential_custom' ? '500' : '50');
    setPreviewDiSid(generateNodeMavenSessionId().slice(0, 10));

    // Generate next available subscriber name
    const nextSubName = generateSubscriberWithPrefix(
      subscriberPrefix,
      clients.map((c) => c.username)
    );
    setCustomSubscriberName(nextSubName);

    // Pre-fill DataImpulse credentials from any existing DataImpulse subscriber if localStorage is empty
    if (!diBaseUser || !diPassword) {
      const existingDi = clients.find(
        (c) => c.service_mode === 'residential_custom' && c.proxy_provider === 'dataimpulse'
      );
      if (existingDi) {
        const parsed = parseProxyDetails(existingDi);
        if (!diBaseUser && parsed.subUser) setDiBaseUser(parsed.subUser);
        if (!diPassword && existingDi.proxy_password) setDiPassword(existingDi.proxy_password);
        if (existingDi.proxy_host) setDiHost(existingDi.proxy_host);
        if (existingDi.proxy_port) setDiPort(String(existingDi.proxy_port));
      }
    }

    // Pre-select first healthy (or first available) external V2Ray source
    if (externalSources.length > 0) {
      const healthySource =
        externalSources.find((s) => !s.userinfo?.near_limit && !s.userinfo?.expire_soon) ||
        externalSources[0];
      setExternalSourceId(healthySource.id);
      setV2rayCountryCode(healthySource.country_code || 'AUTO');
      setUseCustomExternalUrl(false);
    } else {
      setExternalSourceId('');
      setV2rayCountryCode('AUTO');
    }
    setExternalCustomUrl('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Keep externalSourceId in sync if sources are added while modal is open
  useEffect(() => {
    if (!isOpen) return;
    if (!externalSourceId && externalSources.length > 0 && !useCustomExternalUrl) {
      const first = externalSources[0];
      setExternalSourceId(first.id);
      setV2rayCountryCode(first.country_code || 'AUTO');
    }
  }, [externalSources, externalSourceId, useCustomExternalUrl, isOpen]);

  // Preview next NodeMaven Sub-User name
  const previewNodeMavenSubUser = useMemo(() => {
    return previewNextNodeMavenSubUserName(nmProxyPrefix, existingNodeMavenSubUserNames);
  }, [nmProxyPrefix, existingNodeMavenSubUserNames]);

  // Preview DataImpulse proxy string
  const previewDataImpulseString = useMemo(() => {
    const cleanBase = (diBaseUser || 'di_login').trim().split('__')[0] || 'di_login';
    const ttl = Math.max(1, Math.min(120, Number(diStickyTtl) || 30));
    return buildResidentialProxyUsername(
      'dataimpulse',
      cleanBase,
      countryCode,
      previewDiSid,
      ttl
    ).fullProxyUsername;
  }, [diBaseUser, countryCode, previewDiSid, diStickyTtl]);

  const selectedExternalSource = useMemo(
    () => externalSources.find((s) => s.id === externalSourceId) || null,
    [externalSources, externalSourceId]
  );

  if (!isOpen) return null;

  const handleModeSwitch = (nextMode: ServiceMode) => {
    setError(null);
    setServiceMode(nextMode);
    if (nextMode === 'shamcash_sy') {
      if (Number(quotaMb) >= 500 || !quotaMb) setQuotaMb('50');
    } else if (nextMode === 'residential_custom') {
      if (Number(quotaMb) <= 100 || !quotaMb) setQuotaMb('500');
      if (!countryCode || countryCode === 'AUTO') setCountryCode('US');
    }
  };

  const handleNmProxyPrefixChange = (nextVal: string) => {
    setNmProxyPrefix(nextVal);
    writeStorage('shamcash_NmProxyPrefix_v1', nextVal.trim() || 'Ammarmedia');
  };

  const handleSubscriberPrefixGenerate = (prefixToUse: string) => {
    setSubscriberPrefix(prefixToUse);
    writeStorage('shamcash_PreferredPrefix_v1', prefixToUse.trim() || 'alishop');
    const generated = generateSubscriberWithPrefix(
      prefixToUse,
      clients.map((c) => c.username)
    );
    setCustomSubscriberName(generated);
  };

  const handleDiFieldChange = (field: keyof typeof DI_STORAGE_KEYS, value: string) => {
    writeStorage(DI_STORAGE_KEYS[field], value.trim());
    if (field === 'baseUser') setDiBaseUser(value);
    else if (field === 'password') setDiPassword(value);
    else if (field === 'host') setDiHost(value);
    else if (field === 'port') setDiPort(value);
    else if (field === 'ttl') setDiStickyTtl(value);
  };

  const handleExternalSourceSelect = (sourceId: string) => {
    setExternalSourceId(sourceId);
    const found = externalSources.find((s) => s.id === sourceId);
    if (found?.country_code) {
      setV2rayCountryCode(found.country_code);
    }
  };

  const activeBadgeCountry = getCountryInfo(
    serviceMode === 'shamcash_sy'
      ? 'SY'
      : serviceMode === 'residential_custom'
      ? countryCode
      : v2rayCountryCode
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const trimmedSubName = customSubscriberName.trim().replace(/\s+/g, '_');
    if (!trimmedSubName) {
      setError('يرجى إدخال أو توليد اسم المشترك الذي سيُضاف في لوحتك.');
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedSubName)) {
      setError('اسم المشترك يقبل أحرف إنجليزية وأرقام فقط (بدون مسافات أو رموز خاصة).');
      return;
    }
    const isDuplicate = clients.some(
      (c) => c.username.toLowerCase() === trimmedSubName.toLowerCase()
    );
    if (isDuplicate) {
      setError('اسم المشترك موجود مسبقاً في لوحتك، يرجى تغييره أو الضغط على «توليد رقم تالي».');
      return;
    }

    const expiryDate = addDaysToDateString(null, durationDays);

    // =========================================================================
    // MODE 1: SHAMCASH (SYRIA ONLY) — 100% ORIGINAL UNTOUCHED LOGIC
    // =========================================================================
    if (serviceMode === 'shamcash_sy') {
      setSubmitting(true);
      try {
        const host = 'gate.nodemaven.com';
        const port = 1080;
        const requestedQuotaMb = Math.max(1, Number(quotaMb) || 50);

        const nmCreated = await createNodeMavenSubUserLive({
          proxy_prefix: previewNodeMavenSubUser,
          quota_mb: requestedQuotaMb,
          proxy_host: host,
          country_code: 'sy',
        });

        if (!nmCreated.success || !nmCreated.full_proxy_username || !nmCreated.proxy_password) {
          setError(nmCreated.error || 'تعذر إنشاء يوزر البروكسي الجديد في الخادم الرئيسي.');
          return;
        }

        await onCreateClient(
          {
            username: trimmedSubName,
            is_active: true,
            expiry_date: expiryDate,
            proxy_host: host,
            proxy_port: port,
            proxy_username: nmCreated.full_proxy_username,
            proxy_password: nmCreated.proxy_password,
            quota_mb: nmCreated.quota_mb ?? requestedQuotaMb,
            used_mb: 0,
            service_mode: 'shamcash_sy',
            proxy_provider: 'nodemaven',
            country_code: 'SY',
          },
          nmCreated.live_check?.ok ? nmCreated.live_check : undefined
        );

        await onSyncUsage();
        onClose();
        onToast(
          `تم إنشاء بروكسي شام كاش (${nmCreated.sub_user}) وإضافة المشترك (${trimmedSubName}) بنجاح!`
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // =========================================================================
    // MODE 2: CUSTOM RESIDENTIAL PROXY (BY PROVIDER & COUNTRY + OPEN BROWSING)
    // =========================================================================
    if (serviceMode === 'residential_custom') {
      const targetCountry = (countryCode || 'US').toUpperCase();
      const targetCountryInfo = getCountryInfo(targetCountry);
      const requestedQuotaMb = Math.max(1, Number(quotaMb) || 500);

      if (proxyProvider === 'nodemaven') {
        setSubmitting(true);
        try {
          const host = 'gate.nodemaven.com';
          const port = 1080;

          const nmCreated = await createNodeMavenSubUserLive({
            proxy_prefix: previewNodeMavenSubUser,
            quota_mb: requestedQuotaMb,
            proxy_host: host,
            country_code: targetCountry.toLowerCase(),
          });

          if (!nmCreated.success || !nmCreated.full_proxy_username || !nmCreated.proxy_password) {
            setError(nmCreated.error || 'تعذر إنشاء البروكسي المنزلي الجديد في خادم NodeMaven.');
            return;
          }

          await onCreateClient(
            {
              username: trimmedSubName,
              is_active: true,
              expiry_date: expiryDate,
              proxy_host: host,
              proxy_port: port,
              proxy_username: nmCreated.full_proxy_username,
              proxy_password: nmCreated.proxy_password,
              quota_mb: nmCreated.quota_mb ?? requestedQuotaMb,
              used_mb: 0,
              service_mode: 'residential_custom',
              proxy_provider: 'nodemaven',
              country_code: targetCountry,
            },
            nmCreated.live_check?.ok ? nmCreated.live_check : undefined
          );

          await onSyncUsage();
          onClose();
          const ipNote =
            nmCreated.live_check?.ok && nmCreated.live_check.exit_ip
              ? ` · IP: ${nmCreated.live_check.exit_ip}`
              : '';
          onToast(
            `تم توليد بروكسي منزلي ${targetCountryInfo.flag} ${targetCountryInfo.nameAr} لـ ${trimmedSubName}${ipNote}`
          );
        } finally {
          setSubmitting(false);
        }
        return;
      }

      // DataImpulse Auto Sticky Session Generation
      const cleanBaseUser = diBaseUser.trim();
      const cleanPass = diPassword.trim();
      const cleanHost = diHost.trim() || 'gw.dataimpulse.com';
      const parsedPort = Number(diPort) || 10000;
      const ttl = Math.max(1, Math.min(120, Number(diStickyTtl) || 30));

      if (!cleanBaseUser || !cleanPass) {
        setError('يرجى إدخال معرف وكلمة مرور حساب DataImpulse لتوليد الجلسة الثابتة تلقائياً.');
        return;
      }

      setSubmitting(true);
      try {
        const built = buildResidentialProxyUsername(
          'dataimpulse',
          cleanBaseUser,
          targetCountry,
          undefined,
          ttl
        );

        // Attempt a fast live exit IP check so the operator sees verified IP immediately
        let verifiedIp: VerifiedIpResult | undefined;
        try {
          const endpoints = [
            '/api/nodemaven/check-proxy',
            'https://shamcash-proxy-api.vercel.app/api/nodemaven/check-proxy',
          ];
          for (const ep of endpoints) {
            const probeRes = await fetch(ep, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                proxy_username: built.fullProxyUsername,
                proxy_password: cleanPass,
                proxy_host: cleanHost,
              }),
            });
            if (probeRes.ok) {
              const probeJson = await probeRes.json();
              if (probeJson?.ok && probeJson?.exit_ip) {
                verifiedIp = {
                  ok: true,
                  exit_ip: probeJson.exit_ip,
                  city: probeJson.city,
                  region: probeJson.region,
                  isp: probeJson.isp,
                  country_code: probeJson.country_code,
                };
              }
              break;
            }
          }
        } catch {
          // Non-blocking: still create subscriber if live probe times out
        }

        await onCreateClient(
          {
            username: trimmedSubName,
            is_active: true,
            expiry_date: expiryDate,
            proxy_host: cleanHost,
            proxy_port: parsedPort,
            proxy_username: built.fullProxyUsername,
            proxy_password: cleanPass,
            quota_mb: requestedQuotaMb,
            used_mb: 0,
            service_mode: 'residential_custom',
            proxy_provider: 'dataimpulse',
            country_code: targetCountry,
          },
          verifiedIp
        );

        onClose();
        const ipNote = verifiedIp?.exit_ip ? ` · IP: ${verifiedIp.exit_ip}` : '';
        onToast(
          `تم توليد جلسة DataImpulse (${targetCountryInfo.flag} ${targetCountryInfo.nameAr}) لـ ${trimmedSubName}${ipNote}`
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // =========================================================================
    // MODE 3: GENERAL VPN (EXTERNAL V2RAY SOURCES)
    // =========================================================================
    if (serviceMode === 'external_v2ray') {
      const customLink = externalCustomUrl.trim();
      if (useCustomExternalUrl) {
        if (!customLink) {
          setError('يرجى لصق رابط اشتراك خارجي (https://...) أو رابط VLESS / Trojan مباشر.');
          return;
        }
        if (!/^(https?:\/\/|vless:\/\/|trojan:\/\/|vmess:\/\/|ss:\/\/)/i.test(customLink)) {
          setError('الرابط غير صالح؛ يجب أن يبدأ بـ https:// أو vless:// أو trojan:// أو vmess:// أو ss://');
          return;
        }
      } else if (!externalSourceId) {
        setError('يرجى اختيار مصدر V2Ray خارجي أو التبديل إلى خيار الرابط المباشر المخصص.');
        return;
      }

      setSubmitting(true);
      try {
        const finalCountry = (v2rayCountryCode || 'AUTO').toUpperCase();
        const countryInfo = getCountryInfo(finalCountry);

        await onCreateClient({
          username: trimmedSubName,
          is_active: true,
          expiry_date: expiryDate,
          proxy_host: 'external-v2ray.local',
          proxy_port: 443,
          proxy_username: null,
          proxy_password: null,
          quota_mb: 0,
          used_mb: 0,
          service_mode: 'external_v2ray',
          proxy_provider: 'nodemaven',
          country_code: finalCountry,
          external_source_id: useCustomExternalUrl ? null : externalSourceId,
          external_custom_url: useCustomExternalUrl ? customLink : null,
        });

        onClose();
        onToast(
          `تم توليد اشتراك VPN عام V2Ray (${countryInfo.flag} ${countryInfo.nameAr}) لـ ${trimmedSubName} لمدة ${durationDays} يوم!`
        );
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl bg-[#0E131F] border border-slate-800/90 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                التوليد التلقائي السريع للمشتركين
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                اختر نوع الباقة ليتم توليد الاشتراك وتجهيز رابط Happ تلقائياً بدقة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-lg transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* 0. Service Mode Selector (3 Packages) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-bold text-slate-300">
                اختر وضع التوليد التلقائي (نوع الباقة):
              </label>
              {/* Live Package & Country Badge Preview */}
              <div className="flex items-center gap-1.5">
                {serviceMode === 'shamcash_sy' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-700/60 text-[10px] font-bold text-emerald-300">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span>شام كاش · 🇸🇾 سوريا (SY)</span>
                  </span>
                )}
                {serviceMode === 'residential_custom' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-950/80 border border-sky-700/60 text-[10px] font-bold text-sky-300">
                    <Globe className="w-3 h-3 text-sky-400" />
                    <span>
                      بروكسي منزلي · {activeBadgeCountry.flag} {activeBadgeCountry.nameAr} (
                      {activeBadgeCountry.code})
                    </span>
                  </span>
                )}
                {serviceMode === 'external_v2ray' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-950/80 border border-violet-700/60 text-[10px] font-bold text-violet-300">
                    <Zap className="w-3 h-3 text-violet-400" />
                    <span>
                      VPN عام V2Ray · {activeBadgeCountry.flag} {activeBadgeCountry.nameAr}
                    </span>
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Mode 1: ShamCash SY */}
              <button
                type="button"
                onClick={() => handleModeSwitch('shamcash_sy')}
                className={`p-3 rounded-xl border text-right transition-all ${
                  serviceMode === 'shamcash_sy'
                    ? 'bg-emerald-950/60 border-emerald-500/80 shadow-sm shadow-emerald-950/60'
                    : 'bg-[#070A10] border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>شام كاش (سوريا)</span>
                  </span>
                  <span className="text-[11px]">🇸🇾</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  توليد بروكسي سوري + حظر العناوين الصارم (الوضع الأصلي)
                </p>
              </button>

              {/* Mode 2: Custom Residential Proxy */}
              <button
                type="button"
                onClick={() => handleModeSwitch('residential_custom')}
                className={`p-3 rounded-xl border text-right transition-all ${
                  serviceMode === 'residential_custom'
                    ? 'bg-sky-950/60 border-sky-500/80 shadow-sm shadow-sky-950/60'
                    : 'bg-[#070A10] border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-sky-300">
                    <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>بروكسي منزلي مخصص</span>
                  </span>
                  <span className="text-[11px]">🌍</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  تصفح مفتوح · اختيار المزود والدولة + Sticky Session
                </p>
              </button>

              {/* Mode 3: External V2Ray VPN */}
              <button
                type="button"
                onClick={() => handleModeSwitch('external_v2ray')}
                className={`p-3 rounded-xl border text-right transition-all ${
                  serviceMode === 'external_v2ray'
                    ? 'bg-violet-950/60 border-violet-500/80 shadow-sm shadow-violet-950/60'
                    : 'bg-[#070A10] border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-violet-300">
                    <Zap className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span>VPN عام (V2Ray)</span>
                  </span>
                  <span className="text-[11px]">⚡</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  توزيع من مصادر V2Ray الخارجية بمدة صلاحية مستقلة
                </p>
              </button>
            </div>
          </div>

          {/* ================================================================= */}
          {/* SECTION 1 (MODE-SPECIFIC ENGINE CONFIGURATION)                     */}
          {/* ================================================================= */}

          {/* MODE 1: SHAMCASH SYRIA ONLY (100% ORIGINAL FLOW) */}
          {serviceMode === 'shamcash_sy' && (
            <div className="p-4 rounded-xl bg-[#070A10] border border-emerald-800/50 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-emerald-400" />
                  <span>1. بادئة معرف البروكسي السوري في الخادم الرئيسي</span>
                </label>
                <span className="text-[10px] font-mono text-slate-400" dir="ltr">
                  SY · ≥ 9 chars
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <input
                  type="text"
                  value={nmProxyPrefix}
                  onChange={(e) => handleNmProxyPrefixChange(e.target.value)}
                  placeholder="Ammarmedia أو Alishop"
                  dir="ltr"
                  className="flex-1 bg-[#0E131F] border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-sm font-mono font-bold text-white placeholder-slate-600 focus:outline-none transition-colors"
                />
                <div className="grid grid-cols-2 sm:flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleNmProxyPrefixChange('Ammarmedia')}
                    className="px-2.5 py-2 rounded-xl bg-[#0E131F] hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-slate-300"
                    dir="ltr"
                  >
                    Ammarmedia
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNmProxyPrefixChange('Alishop')}
                    className="px-2.5 py-2 rounded-xl bg-[#0E131F] hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-emerald-300"
                    dir="ltr"
                  >
                    Alishop
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                <span className="text-slate-400">المعرف الفرعي الجديد في الخادم الرئيسي:</span>
                <span
                  className="font-mono text-sm font-extrabold text-amber-400 bg-amber-950/40 border border-amber-700/50 px-2.5 py-0.5 rounded-lg"
                  dir="ltr"
                >
                  {previewNodeMavenSubUser}
                </span>
              </div>

              <div
                className="text-[11px] font-mono text-slate-400 bg-[#0B0F19] border border-slate-800/80 rounded-lg px-2.5 py-1.5 overflow-x-auto whitespace-nowrap"
                dir="ltr"
              >
                <span className="text-emerald-300 font-bold">{previewNodeMavenSubUser}</span>
                <span className="text-slate-400">
                  -country-sy-sid-xxxxxxxxxxxxx-filter-medium-norotate-true
                </span>
              </div>
            </div>
          )}

          {/* MODE 2: CUSTOM RESIDENTIAL PROXY (PROVIDER + COUNTRY + STICKY SESSION) */}
          {serviceMode === 'residential_custom' && (
            <div className="p-4 rounded-xl bg-[#070A10] border border-sky-800/50 space-y-3.5">
              {/* Provider & Country Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Provider Selection */}
                <div>
                  <label className="block text-xs font-bold text-sky-300 mb-1.5">
                    1. مزود البروكسي المنزلي
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setProxyProvider('nodemaven')}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-colors ${
                        proxyProvider === 'nodemaven'
                          ? 'bg-sky-950/80 border-sky-500 text-sky-200'
                          : 'bg-[#0E131F] border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      NodeMaven
                    </button>
                    <button
                      type="button"
                      onClick={() => setProxyProvider('dataimpulse')}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-colors ${
                        proxyProvider === 'dataimpulse'
                          ? 'bg-sky-950/80 border-sky-500 text-sky-200'
                          : 'bg-[#0E131F] border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      DataImpulse
                    </button>
                  </div>
                </div>

                {/* Country Dropdown */}
                <div>
                  <label className="block text-xs font-bold text-sky-300 mb-1.5">
                    2. الدولة المطلوبة للاتصال
                  </label>
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="w-full bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none transition-colors"
                  >
                    {RESIDENTIAL_COUNTRY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.nameAr} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Popular Country Quick Picks */}
              <div className="flex items-center flex-wrap gap-1.5">
                {POPULAR_RESIDENTIAL_COUNTRIES.map((code) => {
                  const info = getCountryInfo(code);
                  const active = countryCode === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setCountryCode(code)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors flex items-center gap-1 ${
                        active
                          ? 'bg-sky-600/30 border-sky-500 text-sky-200'
                          : 'bg-[#0E131F] border-slate-800/90 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>{info.flag}</span>
                      <span>{info.nameAr}</span>
                    </button>
                  );
                })}
              </div>

              {/* Provider-Specific Generator Settings */}
              {proxyProvider === 'nodemaven' ? (
                <div className="space-y-2.5 pt-2.5 border-t border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-sky-400" />
                      <span>بادئة المعرف الفرعي (يُنشأ تلقائياً عبر API)</span>
                    </label>
                    <span
                      className="font-mono text-xs font-extrabold text-sky-300 bg-sky-950/50 border border-sky-700/50 px-2 py-0.5 rounded-lg"
                      dir="ltr"
                    >
                      {previewNodeMavenSubUser}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                      type="text"
                      value={nmProxyPrefix}
                      onChange={(e) => handleNmProxyPrefixChange(e.target.value)}
                      placeholder="Ammarmedia أو Alishop"
                      dir="ltr"
                      className="flex-1 bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-white focus:outline-none"
                    />
                    <div className="grid grid-cols-2 sm:flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleNmProxyPrefixChange('Ammarmedia')}
                        className="px-2 py-1.5 rounded-lg bg-[#0E131F] hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-slate-300"
                        dir="ltr"
                      >
                        Ammarmedia
                      </button>
                      <button
                        type="button"
                        onClick={() => handleNmProxyPrefixChange('Alishop')}
                        className="px-2 py-1.5 rounded-lg bg-[#0E131F] hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-sky-300"
                        dir="ltr"
                      >
                        Alishop
                      </button>
                    </div>
                  </div>

                  <div
                    className="text-[11px] font-mono text-slate-400 bg-[#0B0F19] border border-slate-800/80 rounded-lg px-2.5 py-1.5 overflow-x-auto whitespace-nowrap"
                    dir="ltr"
                  >
                    <span className="text-sky-300 font-bold">{previewNodeMavenSubUser}</span>
                    <span className="text-amber-300 font-bold">
                      -country-{countryCode.toLowerCase()}
                    </span>
                    <span className="text-slate-400">
                      -sid-xxxxxxxxxxxxx-filter-medium-norotate-true
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 pt-2.5 border-t border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-sky-400" />
                      <span>بيانات حساب DataImpulse (تُحفظ تلقائياً للتوليد السريع)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewDiSid(generateNodeMavenSessionId().slice(0, 10))}
                      className="text-[10px] text-sky-300 hover:text-sky-200 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>تجديد الجلسة</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <span className="block text-[10px] text-slate-400 mb-1">
                        معرف DataImpulse الأساسي (Login):
                      </span>
                      <input
                        type="text"
                        value={diBaseUser}
                        onChange={(e) => handleDiFieldChange('baseUser', e.target.value)}
                        placeholder="e.g. a1b2c3d4e5"
                        dir="ltr"
                        className="w-full bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-1.5 text-xs font-mono text-white placeholder-slate-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 mb-1">
                        كلمة المرور (Password):
                      </span>
                      <input
                        type="text"
                        value={diPassword}
                        onChange={(e) => handleDiFieldChange('password', e.target.value)}
                        placeholder="كلمة مرور DataImpulse"
                        dir="ltr"
                        className="w-full bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-1.5 text-xs font-mono text-white placeholder-slate-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div className="col-span-2 sm:col-span-1">
                      <span className="block text-[10px] text-slate-400 mb-1">الخادم (Host):</span>
                      <input
                        type="text"
                        value={diHost}
                        onChange={(e) => handleDiFieldChange('host', e.target.value)}
                        dir="ltr"
                        className="w-full bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-2.5 py-1.5 text-[11px] font-mono text-slate-200 focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 mb-1">المنفذ (Port):</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={diPort}
                          onChange={(e) => handleDiFieldChange('port', e.target.value)}
                          dir="ltr"
                          className="w-full bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-2 py-1.5 text-[11px] font-mono text-slate-200 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleDiFieldChange('port', diPort === '10000' ? '823' : '10000')
                          }
                          className="px-1.5 py-1.5 rounded-lg bg-[#0E131F] border border-slate-800 text-[10px] font-mono text-sky-300 shrink-0"
                          title="تبديل بين SOCKS5 (10000) و HTTP (823)"
                        >
                          {diPort === '10000' ? 'S5' : 'HTTP'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 mb-1">
                        ثبات الجلسة (دقيقة):
                      </span>
                      <select
                        value={diStickyTtl}
                        onChange={(e) => handleDiFieldChange('ttl', e.target.value)}
                        className="w-full bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-2 py-1.5 text-[11px] font-mono text-sky-200 focus:outline-none"
                      >
                        <option value="10">10m</option>
                        <option value="30">30m</option>
                        <option value="60">60m</option>
                        <option value="120">120m</option>
                      </select>
                    </div>
                  </div>

                  <div
                    className="text-[11px] font-mono text-sky-300 bg-[#0B0F19] border border-slate-800/80 rounded-lg px-2.5 py-1.5 overflow-x-auto whitespace-nowrap"
                    dir="ltr"
                  >
                    {previewDataImpulseString}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1.5 text-[11px] text-sky-300/90 bg-sky-950/35 border border-sky-800/40 rounded-lg px-3 py-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>
                  تصفح مفتوح لجميع المواقع والتطبيقات بدون حظر · جلسة ثابتة (Sticky Session) · عداد
                  حصة وإيقاف تلقائي.
                </span>
              </div>
            </div>
          )}

          {/* MODE 3: GENERAL VPN (EXTERNAL V2RAY SOURCES) */}
          {serviceMode === 'external_v2ray' && (
            <div className="p-4 rounded-xl bg-[#070A10] border border-violet-800/50 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-xs font-bold text-violet-300 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-violet-400" />
                  <span>1. مصدر سيرفرات V2Ray الخارجي (VLESS / Trojan)</span>
                </label>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setUseCustomExternalUrl((prev) => !prev)}
                    className="px-2.5 py-1 rounded-lg bg-[#0E131F] hover:bg-slate-800 border border-slate-700 text-[11px] font-semibold text-violet-300 transition-colors"
                  >
                    {useCustomExternalUrl ? 'اختيار من المصادر المحفوظة' : 'أو لصق رابط مباشر مخصص'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenExternalSources();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-violet-950/70 hover:bg-violet-800 border border-violet-700/70 text-[11px] font-semibold text-violet-200 flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>إدارة المصادر</span>
                  </button>
                </div>
              </div>

              {!useCustomExternalUrl ? (
                externalSources.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[#0E131F] border border-dashed border-violet-800/60 text-center space-y-2">
                    <p className="text-xs text-slate-300">
                      لا توجد مصادر V2Ray خارجية مضافة بعد في قسم «مصادر V2Ray».
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenExternalSources();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold"
                      >
                        إضافة مصدر V2Ray الآن
                      </button>
                      <button
                        type="button"
                        onClick={() => setUseCustomExternalUrl(true)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                      >
                        لصق رابط مباشر
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto pl-0.5">
                    {externalSources.map((src) => {
                      const isSelected = externalSourceId === src.id;
                      const srcCountry = getCountryInfo(src.country_code || 'AUTO');
                      const ui = src.userinfo;
                      const hasWarning = Boolean(ui?.near_limit || ui?.expire_soon);
                      return (
                        <button
                          key={src.id}
                          type="button"
                          onClick={() => handleExternalSourceSelect(src.id)}
                          className={`w-full text-right p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'bg-violet-950/60 border-violet-500'
                              : 'bg-[#0E131F] border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-white truncate">
                                {src.name}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-300">
                                {srcCountry.flag} {srcCountry.nameAr}
                              </span>
                              {typeof src.server_count === 'number' && src.server_count > 0 && (
                                <span className="text-[10px] font-mono text-violet-300 bg-violet-950/60 border border-violet-800/50 px-1.5 py-0.5 rounded">
                                  {src.server_count} خادم
                                </span>
                              )}
                              {hasWarning && (
                                <span className="text-[10px] font-bold text-amber-300 bg-amber-950/70 border border-amber-700/60 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  <span>قرب النفاد</span>
                                </span>
                              )}
                            </div>
                            {ui && ui.total_mb && ui.total_mb > 0 && (
                              <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-slate-400">
                                <span>
                                  المتبقي: {formatDataMb(ui.remaining_mb || 0)} /{' '}
                                  {formatDataMb(ui.total_mb)}
                                </span>
                                <span
                                  className={
                                    (ui.usage_pct || 0) >= 80
                                      ? 'text-amber-400 font-bold'
                                      : 'text-emerald-400'
                                  }
                                >
                                  ({ui.usage_pct || 0}%)
                                </span>
                              </div>
                            )}
                          </div>
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              isSelected ? 'border-violet-400 bg-violet-500' : 'border-slate-600'
                            }`}
                          >
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                <div>
                  <span className="block text-[11px] text-slate-400 mb-1">
                    رابط اشتراك خارجي (https://...) أو رابط VLESS / Trojan مباشر:
                  </span>
                  <textarea
                    rows={2}
                    value={externalCustomUrl}
                    onChange={(e) => setExternalCustomUrl(e.target.value)}
                    placeholder="https://sub.example.com/api/... أو vless://... أو trojan://..."
                    dir="ltr"
                    className="w-full bg-[#0E131F] border border-slate-800 focus:border-violet-500 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none resize-none"
                  />
                </div>
              )}

              {/* Selected Source Warning Banner */}
              {!useCustomExternalUrl &&
                selectedExternalSource?.userinfo &&
                (selectedExternalSource.userinfo.near_limit ||
                  selectedExternalSource.userinfo.expire_soon) && (
                  <div className="p-2.5 rounded-lg bg-amber-950/50 border border-amber-700/60 text-amber-200 text-[11px] flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>
                      تنبيه: هذا المصدر قارب على النفاد أو الانتهاء (مستهلك{' '}
                      {selectedExternalSource.userinfo.usage_pct || 0}%).
                    </span>
                  </div>
                )}

              {/* Country Badge Selector for V2Ray Subscriber */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                <label className="text-[11px] font-semibold text-slate-300">
                  شارة الدولة / المنطقة الظاهرة على بطاقة المشترك:
                </label>
                <select
                  value={v2rayCountryCode}
                  onChange={(e) => setV2rayCountryCode(e.target.value)}
                  className="bg-[#0E131F] border border-slate-800 focus:border-violet-500 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white focus:outline-none"
                >
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.nameAr} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* SECTION 2: SUBSCRIBER NAME & AUTO-PREFIX GENERATOR                */}
          {/* ================================================================= */}
          <div className="p-4 rounded-xl bg-[#070A10] border border-slate-800/90 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-1.5">
              <label className="text-xs font-bold text-slate-200">
                {serviceMode === 'shamcash_sy'
                  ? '2. اسم المشترك الذي سيُضاف لديك في اللوحة'
                  : 'اسم المشترك في لوحة VPN ALISHOP'}
              </label>
              <div className="flex items-center gap-1.5">
                {(serviceMode === 'shamcash_sy' ||
                  (serviceMode === 'residential_custom' && proxyProvider === 'nodemaven')) && (
                  <button
                    type="button"
                    onClick={() => setCustomSubscriberName(previewNodeMavenSubUser)}
                    className="px-2 py-0.5 rounded bg-emerald-950/70 hover:bg-emerald-800 text-[11px] font-semibold text-emerald-300 border border-emerald-700/60"
                  >
                    مطابقة مع اسم البروكسي
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleSubscriberPrefixGenerate(subscriberPrefix)}
                  className="px-2 py-0.5 rounded bg-[#0E131F] hover:bg-slate-800 text-[11px] font-semibold text-sky-300 border border-slate-700 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>توليد رقم تالي</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2">
                <span className="block text-[11px] text-slate-400 mb-1">
                  الاسم النهائي للمشترك في لوحتك:
                </span>
                <input
                  type="text"
                  value={customSubscriberName}
                  onChange={(e) => setCustomSubscriberName(e.target.value)}
                  placeholder="alishop1 أو اسم الزبون"
                  dir="ltr"
                  className="w-full bg-[#0E131F] border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-sm font-mono font-bold text-white placeholder-slate-600 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <span className="block text-[11px] text-slate-400 mb-1">
                  بادئة التوليد السريع:
                </span>
                <input
                  type="text"
                  value={subscriberPrefix}
                  onChange={(e) => handleSubscriberPrefixGenerate(e.target.value)}
                  placeholder="alishop"
                  dir="ltr"
                  className="w-full bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-2.5 py-2 text-xs font-mono text-sky-300 placeholder-slate-600 focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* SECTION 3: QUOTA (FOR PROXY MODES) & SUBSCRIPTION DURATION        */}
          {/* ================================================================= */}
          <div
            className={`grid grid-cols-1 ${
              serviceMode === 'external_v2ray' ? '' : 'sm:grid-cols-2'
            } gap-3`}
          >
            {serviceMode !== 'external_v2ray' && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  حصة البيانات المخصصة للمشترك (MB)
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input
                    type="number"
                    min={1}
                    value={quotaMb}
                    onChange={(e) => setQuotaMb(e.target.value)}
                    dir="ltr"
                    className="w-20 bg-[#070A10] border border-slate-800 focus:border-emerald-500 rounded-xl px-2.5 py-2 text-xs font-mono font-bold text-white focus:outline-none"
                  />
                  {(serviceMode === 'residential_custom' ? [250, 500, 1024, 5120] : [50, 100, 500]).map(
                    (mb) => (
                      <button
                        key={mb}
                        type="button"
                        onClick={() => setQuotaMb(String(mb))}
                        className={`px-2 py-2 rounded-xl text-[11px] font-mono font-semibold border transition-colors ${
                          Number(quotaMb) === mb
                            ? serviceMode === 'residential_custom'
                              ? 'bg-sky-950/70 border-sky-600 text-sky-300'
                              : 'bg-emerald-950/70 border-emerald-600 text-emerald-300'
                            : 'bg-[#070A10] border-slate-800 text-slate-400 hover:text-white'
                        }`}
                        dir="ltr"
                      >
                        {mb >= 1024 ? `${mb / 1024}GB` : `${mb}MB`}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                {serviceMode === 'external_v2ray'
                  ? 'مدة صلاحية الاشتراك الديناميكية (تتحكم بإيقاف الاشتراك تلقائياً)'
                  : 'مدة صلاحية الاشتراك'}
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: '7 أيام', days: 7 },
                  { label: '30 يوم', days: 30 },
                  { label: '90 يوم', days: 90 },
                  { label: 'سنة', days: 365 },
                ].map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => setDurationDays(preset.days)}
                    className={`py-2 px-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                      durationDays === preset.days
                        ? serviceMode === 'external_v2ray'
                          ? 'bg-violet-950/70 border-violet-500 text-violet-200'
                          : serviceMode === 'residential_custom'
                          ? 'bg-sky-950/70 border-sky-500 text-sky-200'
                          : 'bg-emerald-950/70 border-emerald-600 text-emerald-300'
                        : 'bg-[#070A10] border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Actions Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800/70 hover:bg-slate-800 rounded-xl transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50 ${
                serviceMode === 'residential_custom'
                  ? 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                  : serviceMode === 'external_v2ray'
                  ? 'bg-violet-500 hover:bg-violet-400 text-white'
                  : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {submitting
                  ? 'جاري التوليد والمزامنة...'
                  : serviceMode === 'shamcash_sy'
                  ? 'إنشاء بروكسي شام كاش السوري + إضافة المشترك'
                  : serviceMode === 'residential_custom'
                  ? `توليد بروكسي منزلي (${activeBadgeCountry.code}) + إضافة المشترك`
                  : 'توليد اشتراك VPN عام V2Ray + إضافة المشترك'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
