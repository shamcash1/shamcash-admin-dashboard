import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Server,
  User,
  AlertCircle,
  Lock,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Globe,
  Zap,
  HardDrive,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import {
  COUNTRY_OPTIONS,
  ExternalV2RaySource,
  ProxyClient,
  ProxyProvider,
  ServiceMode,
  addDaysToDateString,
  buildResidentialProxyUsername,
  formatDataMb,
  getCountryInfo,
  regenerateNodeMavenProxyUsername,
  regenerateProxyUsernameForMode,
} from '../lib/supabase';

interface ClientModalProps {
  isOpen: boolean;
  mode: 'add' | 'edit';
  initialClient?: ProxyClient | null;
  existingUsernames: string[];
  externalSources: ExternalV2RaySource[];
  defaultProxyHost?: string;
  defaultProxyPort?: number;
  defaultProxyUsername?: string;
  defaultProxyPassword?: string;
  onClose: () => void;
  onOpenExternalSources: () => void;
  onSubmit: (
    clientData: Omit<ProxyClient, 'id' | 'created_at' | 'updated_at'>,
    id?: string
  ) => Promise<void>;
}

const RESIDENTIAL_COUNTRIES = COUNTRY_OPTIONS.filter((c) => c.code !== 'AUTO');

export const ClientModal: React.FC<ClientModalProps> = ({
  isOpen,
  mode,
  initialClient,
  existingUsernames,
  externalSources,
  defaultProxyHost = 'gate.nodemaven.com',
  defaultProxyPort = 1080,
  defaultProxyUsername = '',
  defaultProxyPassword = '',
  onClose,
  onOpenExternalSources,
  onSubmit,
}) => {
  const [serviceMode, setServiceMode] = useState<ServiceMode>('shamcash_sy');
  const [username, setUsername] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [expiryDate, setExpiryDate] = useState(() => addDaysToDateString(null, 30));

  // Proxy fields (ShamCash SY & Residential Custom)
  const [proxyProvider, setProxyProvider] = useState<ProxyProvider>('nodemaven');
  const [countryCode, setCountryCode] = useState<string>('SY');
  const [proxyHost, setProxyHost] = useState(defaultProxyHost);
  const [proxyPort, setProxyPort] = useState<string>(String(defaultProxyPort));
  const [proxyUsername, setProxyUsername] = useState(defaultProxyUsername);
  const [proxyPassword, setProxyPassword] = useState(defaultProxyPassword);
  const [quotaMb, setQuotaMb] = useState<string>('500');
  const [stickyTtl, setStickyTtl] = useState<string>('60');

  // External V2Ray fields
  const [externalSourceId, setExternalSourceId] = useState<string>('');
  const [useCustomExtUrl, setUseCustomExtUrl] = useState<boolean>(false);
  const [externalCustomUrl, setExternalCustomUrl] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (mode === 'edit' && initialClient) {
      const initMode: ServiceMode = initialClient.service_mode || 'shamcash_sy';
      setServiceMode(initMode);
      setUsername(initialClient.username);
      setIsActive(initialClient.is_active);
      setExpiryDate(initialClient.expiry_date);
      setProxyProvider(initialClient.proxy_provider || 'nodemaven');
      setCountryCode(
        initialClient.country_code || (initMode === 'external_v2ray' ? 'AUTO' : 'SY')
      );
      setProxyHost(initialClient.proxy_host || defaultProxyHost);
      setProxyPort(String(initialClient.proxy_port || defaultProxyPort));
      setProxyUsername(initialClient.proxy_username || '');
      setProxyPassword(initialClient.proxy_password || '');
      setQuotaMb(String(initialClient.quota_mb ?? (initMode === 'residential_custom' ? 500 : 0)));
      const ttlMatch = (initialClient.proxy_username || '').match(/;sessttl\.(\d+)/i);
      setStickyTtl(ttlMatch ? ttlMatch[1] : '60');
      setExternalSourceId(initialClient.external_source_id || externalSources[0]?.id || '');
      setExternalCustomUrl(initialClient.external_custom_url || '');
      setUseCustomExtUrl(
        Boolean(initialClient.external_custom_url && !initialClient.external_source_id)
      );
    } else {
      setServiceMode('shamcash_sy');
      setUsername('');
      setIsActive(true);
      setExpiryDate(addDaysToDateString(null, 30));
      setProxyProvider('nodemaven');
      setCountryCode('SY');
      setProxyHost(defaultProxyHost);
      setProxyPort(String(defaultProxyPort));
      setProxyUsername(defaultProxyUsername);
      setProxyPassword(defaultProxyPassword);
      setQuotaMb('500');
      setStickyTtl('60');
      setExternalSourceId(externalSources[0]?.id || '');
      setExternalCustomUrl('');
      setUseCustomExtUrl(false);
    }
  }, [
    isOpen,
    mode,
    initialClient,
    defaultProxyHost,
    defaultProxyPort,
    defaultProxyUsername,
    defaultProxyPassword,
    externalSources,
  ]);

  if (!isOpen) return null;

  const trimmedUsername = username.trim().replace(/\s+/g, '_');

  const handleSelectMode = (nextMode: ServiceMode) => {
    setError(null);
    setServiceMode(nextMode);
    if (nextMode === 'shamcash_sy') {
      setCountryCode('SY');
      setProxyProvider('nodemaven');
      if (proxyHost === 'v2ray.external' || proxyHost.includes('dataimpulse')) {
        setProxyHost(defaultProxyHost);
        setProxyPort(String(defaultProxyPort));
      }
    } else if (nextMode === 'residential_custom') {
      const nextCountry = countryCode === 'AUTO' || !countryCode ? 'US' : countryCode;
      setCountryCode(nextCountry);
      if (proxyHost === 'v2ray.external' || !proxyHost) {
        setProxyHost(proxyProvider === 'dataimpulse' ? 'gw.dataimpulse.com' : 'gate.nodemaven.com');
        setProxyPort(proxyProvider === 'dataimpulse' ? '824' : '1080');
      }
      if (!Number(quotaMb) || Number(quotaMb) <= 0) {
        setQuotaMb('500');
      }
      if (proxyUsername.trim()) {
        const built = buildResidentialProxyUsername(
          proxyProvider,
          proxyUsername,
          nextCountry,
          undefined,
          Number(stickyTtl) || 60
        );
        setProxyUsername(built.fullProxyUsername);
      }
    } else if (nextMode === 'external_v2ray') {
      const chosenSrc =
        externalSources.find((s) => s.id === externalSourceId) || externalSources[0];
      if (chosenSrc) {
        setExternalSourceId(chosenSrc.id);
        setCountryCode(chosenSrc.country_code || 'AUTO');
      } else {
        setCountryCode('AUTO');
      }
    }
  };

  const handleProviderChange = (nextProvider: ProxyProvider) => {
    setProxyProvider(nextProvider);
    if (nextProvider === 'dataimpulse') {
      setProxyHost('gw.dataimpulse.com');
      setProxyPort('824');
    } else {
      setProxyHost('gate.nodemaven.com');
      setProxyPort('1080');
    }
    const baseUser = proxyUsername.trim() || trimmedUsername || 'user';
    const built = buildResidentialProxyUsername(
      nextProvider,
      baseUser,
      countryCode === 'AUTO' ? 'US' : countryCode,
      undefined,
      Number(stickyTtl) || 60
    );
    setProxyUsername(built.fullProxyUsername);
  };

  const handleCountryChangeResidential = (nextCountry: string) => {
    setCountryCode(nextCountry);
    if (proxyUsername.trim()) {
      const built = buildResidentialProxyUsername(
        proxyProvider,
        proxyUsername,
        nextCountry,
        undefined,
        Number(stickyTtl) || 60
      );
      setProxyUsername(built.fullProxyUsername);
    }
  };

  const handleRegenerateStickyResidential = () => {
    const { newProxyUsername } = regenerateProxyUsernameForMode(
      proxyProvider,
      proxyUsername,
      trimmedUsername || 'user',
      countryCode === 'AUTO' ? 'US' : countryCode,
      Number(stickyTtl) || 60
    );
    setProxyUsername(newProxyUsername);
  };

  const handleQuickDuration = (days: number) => {
    const base = mode === 'edit' ? expiryDate : null;
    setExpiryDate(addDaysToDateString(base, days));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!trimmedUsername) {
      setError('يرجى إدخال اسم المشترك.');
      return;
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
      setError('اسم المشترك يقبل أحرف إنجليزية وأرقام فقط.');
      return;
    }

    const isDuplicate = existingUsernames.some(
      (u) =>
        u.toLowerCase() === trimmedUsername.toLowerCase() &&
        (mode === 'add' || initialClient?.username.toLowerCase() !== trimmedUsername.toLowerCase())
    );
    if (isDuplicate) {
      setError('اسم المشترك مسجل مسبقاً.');
      return;
    }

    if (!expiryDate) {
      setError('يرجى تحديد تاريخ الانتهاء.');
      return;
    }

    if (serviceMode === 'external_v2ray') {
      if (!useCustomExtUrl && !externalSourceId) {
        setError('يرجى اختيار مصدر V2Ray خارجي من القائمة أو إدخال رابط مباشر.');
        return;
      }
      if (useCustomExtUrl && !externalCustomUrl.trim()) {
        setError('يرجى لصق رابط اشتراك V2Ray (https://...) أو رابط vless:// / trojan://.');
        return;
      }

      setSubmitting(true);
      try {
        await onSubmit(
          {
            username: trimmedUsername,
            is_active: isActive,
            expiry_date: expiryDate,
            proxy_host: 'v2ray.external',
            proxy_port: 443,
            proxy_username: null,
            proxy_password: null,
            quota_mb: 0,
            used_mb: 0,
            service_mode: 'external_v2ray',
            proxy_provider: 'nodemaven',
            country_code: countryCode || 'AUTO',
            external_source_id: useCustomExtUrl ? null : externalSourceId,
            external_custom_url: useCustomExtUrl ? externalCustomUrl.trim() : null,
          },
          initialClient?.id
        );
        onClose();
      } catch (err: any) {
        setError(err.message || 'تعذر حفظ البيانات.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // ShamCash SY & Residential Custom validation
    if (!proxyHost.trim()) {
      setError('يرجى إدخال عنوان البروكسي.');
      return;
    }

    const portNum = Number(proxyPort);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setError('منفذ البروكسي غير صالح.');
      return;
    }

    const parsedQuota =
      serviceMode === 'residential_custom'
        ? Math.max(0, Number(quotaMb) || 0)
        : initialClient?.quota_mb ?? 0;

    setSubmitting(true);
    try {
      await onSubmit(
        {
          username: trimmedUsername,
          is_active: isActive,
          expiry_date: expiryDate,
          proxy_host: proxyHost.trim(),
          proxy_port: portNum,
          proxy_username: proxyUsername.trim() ? proxyUsername.trim() : null,
          proxy_password: proxyPassword.trim() ? proxyPassword.trim() : null,
          quota_mb: parsedQuota,
          used_mb: initialClient?.used_mb ?? 0,
          service_mode: serviceMode,
          proxy_provider: serviceMode === 'shamcash_sy' ? 'nodemaven' : proxyProvider,
          country_code: serviceMode === 'shamcash_sy' ? 'SY' : countryCode || 'US',
          external_source_id: null,
          external_custom_url: null,
        },
        initialClient?.id
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'تعذر حفظ البيانات.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedExternalSource = externalSources.find((s) => s.id === externalSourceId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-xl bg-[#0E131F] border border-slate-800/90 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        dir="rtl"
      >
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-800/80 shrink-0">
          <h2 className="text-sm font-bold text-white">
            {mode === 'add' ? 'إضافة مشترك جديد' : `تعديل المشترك · ${initialClient?.username}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* 3-Mode Service Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              نوع الباقة ووضع التشغيل
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSelectMode('shamcash_sy')}
                className={`p-2.5 rounded-xl border text-right transition-all flex items-center sm:flex-col sm:items-start gap-2.5 sm:gap-1 ${
                  serviceMode === 'shamcash_sy'
                    ? 'bg-emerald-950/60 border-emerald-500/80 text-white shadow-sm shadow-emerald-950/50'
                    : 'bg-[#070A10] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <ShieldCheck
                    className={`w-4 h-4 shrink-0 ${
                      serviceMode === 'shamcash_sy' ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  />
                  <span>شام كاش (سوريا فقط)</span>
                </div>
                <span className="text-[10px] text-slate-400 leading-tight">
                  الوضع الأصلي · حظر صارم · 🇸🇾 SY
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectMode('residential_custom')}
                className={`p-2.5 rounded-xl border text-right transition-all flex items-center sm:flex-col sm:items-start gap-2.5 sm:gap-1 ${
                  serviceMode === 'residential_custom'
                    ? 'bg-sky-950/60 border-sky-500/80 text-white shadow-sm shadow-sky-950/50'
                    : 'bg-[#070A10] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <Globe
                    className={`w-4 h-4 shrink-0 ${
                      serviceMode === 'residential_custom' ? 'text-sky-400' : 'text-slate-500'
                    }`}
                  />
                  <span>بروكسي منزلي مخصص</span>
                </div>
                <span className="text-[10px] text-slate-400 leading-tight">
                  حسب الدولة · Sticky · تصفح مفتوح
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectMode('external_v2ray')}
                className={`p-2.5 rounded-xl border text-right transition-all flex items-center sm:flex-col sm:items-start gap-2.5 sm:gap-1 ${
                  serviceMode === 'external_v2ray'
                    ? 'bg-violet-950/60 border-violet-500/80 text-white shadow-sm shadow-violet-950/50'
                    : 'bg-[#070A10] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <Zap
                    className={`w-4 h-4 shrink-0 ${
                      serviceMode === 'external_v2ray' ? 'text-violet-400' : 'text-slate-500'
                    }`}
                  />
                  <span>VPN عام (V2Ray)</span>
                </div>
                <span className="text-[10px] text-slate-400 leading-tight">
                  VLESS / Trojan خارجي · مدة زمنية
                </span>
              </button>
            </div>
          </div>

          {/* Username & Status */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                اسم المشترك
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="client_name"
                  dir="ltr"
                  className="w-full bg-[#070A10] border border-slate-800 focus:border-emerald-500 rounded-xl pr-9 pl-3 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none transition-colors"
                  autoFocus={mode === 'add'}
                />
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-400 mb-1.5">الحالة</span>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`w-full h-[42px] px-3 rounded-xl border text-xs font-semibold flex items-center justify-center transition-colors ${
                  isActive
                    ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300'
                    : 'bg-[#070A10] border-slate-800 text-slate-400'
                }`}
              >
                {isActive ? 'نشط' : 'موقوف'}
              </button>
            </div>
          </div>

          {/* Expiry Date */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-400">تاريخ الانتهاء</label>
              <div className="flex items-center gap-1">
                {[
                  { label: '+7ي', days: 7 },
                  { label: '+30ي', days: 30 },
                  { label: '+90ي', days: 90 },
                  { label: '+سنة', days: 365 },
                ].map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => handleQuickDuration(preset.days)}
                    className="px-2 py-0.5 text-[11px] font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                dir="ltr"
                className="w-full bg-[#070A10] border border-slate-800 focus:border-emerald-500 rounded-xl pr-9 pl-3 py-2.5 text-sm font-mono tabular-nums text-white focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* MODE 1: SHAMCASH SY (100% ORIGINAL FIELDS UNTOUCHED) */}
          {serviceMode === 'shamcash_sy' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    عنوان البروكسي (Host / IP)
                  </label>
                  <div className="relative">
                    <Server className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={proxyHost}
                      onChange={(e) => setProxyHost(e.target.value)}
                      placeholder="gate.nodemaven.com"
                      dir="ltr"
                      className="w-full bg-[#070A10] border border-slate-800 focus:border-emerald-500 rounded-xl pr-9 pl-3 py-2.5 text-sm font-mono tabular-nums text-white placeholder-slate-600 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">المنفذ</label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={proxyPort}
                    onChange={(e) => setProxyPort(e.target.value)}
                    placeholder="1080"
                    dir="ltr"
                    className="w-full bg-[#070A10] border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-sm font-mono tabular-nums text-white placeholder-slate-600 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label className="block text-xs font-medium text-slate-400">
                      معرف جلسة البروكسي الكامل (Proxy Session Username)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const { newProxyUsername } = regenerateNodeMavenProxyUsername(
                          proxyUsername,
                          username || 'user'
                        );
                        setProxyUsername(newProxyUsername);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-700/70 text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
                      title="إعادة توليد البروكسي لنفس المستخدم مع بقاء كلمة المرور كما هي"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>إعادة توليد البروكسي</span>
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={proxyUsername}
                      onChange={(e) => setProxyUsername(e.target.value)}
                      placeholder="Alishoop2-country-sy-sid-..."
                      dir="ltr"
                      className="w-full bg-[#070A10] border border-slate-800 focus:border-emerald-500 rounded-xl pr-9 pl-3 py-2.5 text-xs font-mono text-white placeholder-slate-600 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    باسورد البروكسي (يبقى ثابتاً عند إعادة التوليد)
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={proxyPassword}
                      onChange={(e) => setProxyPassword(e.target.value)}
                      placeholder="اختياري"
                      dir="ltr"
                      className="w-full bg-[#070A10] border border-slate-800 focus:border-emerald-500 rounded-xl pr-9 pl-3 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* MODE 2: CUSTOM RESIDENTIAL PROXY (BY COUNTRY + PROVIDER + STICKY SESSION + OPEN BROWSING) */}
          {serviceMode === 'residential_custom' && (
            <div className="p-4 rounded-2xl bg-[#070A10] border border-sky-800/60 space-y-3.5">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
                <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-sky-400" />
                  <span>إعدادات البروكسي المنزلي المخصص (Sticky Session · تصفح مفتوح)</span>
                </span>
              </div>

              {/* Provider & Country Dropdowns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    مزود البروكسي المنزلي
                  </label>
                  <select
                    value={proxyProvider}
                    onChange={(e) => handleProviderChange(e.target.value as ProxyProvider)}
                    className="w-full bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-2.5 text-xs font-semibold text-white focus:outline-none transition-colors"
                  >
                    <option value="nodemaven">NodeMaven (gate.nodemaven.com · 1080)</option>
                    <option value="dataimpulse">DataImpulse (gw.dataimpulse.com · 824)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    الدولة المطلوبة (Target Country)
                  </label>
                  <select
                    value={countryCode === 'AUTO' ? 'US' : countryCode}
                    onChange={(e) => handleCountryChangeResidential(e.target.value)}
                    className="w-full bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-2.5 text-xs font-semibold text-white focus:outline-none transition-colors"
                  >
                    {RESIDENTIAL_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.nameAr} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Host & Port */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    عنوان البوابة (Host)
                  </label>
                  <input
                    type="text"
                    value={proxyHost}
                    onChange={(e) => setProxyHost(e.target.value)}
                    dir="ltr"
                    className="w-full bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    المنفذ (SOCKS5)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={proxyPort}
                    onChange={(e) => setProxyPort(e.target.value)}
                    dir="ltr"
                    className="w-full bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Sticky Session Username + Generator */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-[11px] font-medium text-slate-400">
                    معرف جلسة Sticky Session ({proxyProvider === 'dataimpulse' ? 'DataImpulse' : 'NodeMaven'})
                  </label>
                  <button
                    type="button"
                    onClick={handleRegenerateStickyResidential}
                    className="px-2.5 py-1 rounded-lg bg-sky-950/80 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-700/70 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>توليد جلسة Sticky جديدة</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={proxyUsername}
                  onChange={(e) => setProxyUsername(e.target.value)}
                  placeholder={
                    proxyProvider === 'dataimpulse'
                      ? 'login__cr.us;sessid.a1b2c3d4e5;sessttl.60'
                      : 'subuser-country-us-sid-xxxxxxxxxxxxx-filter-medium-norotate-true'
                  }
                  dir="ltr"
                  className="w-full bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none"
                />
              </div>

              {/* Password + Optional DataImpulse TTL */}
              <div className={`grid ${proxyProvider === 'dataimpulse' ? 'grid-cols-3' : 'grid-cols-1'} gap-3`}>
                <div className={proxyProvider === 'dataimpulse' ? 'col-span-2' : ''}>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    كلمة مرور البروكسي (Password)
                  </label>
                  <input
                    type="text"
                    value={proxyPassword}
                    onChange={(e) => setProxyPassword(e.target.value)}
                    placeholder="كلمة مرور المزود"
                    dir="ltr"
                    className="w-full bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none"
                  />
                </div>
                {proxyProvider === 'dataimpulse' && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      ثبات الجلسة (دقيقة)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={stickyTtl}
                      onChange={(e) => {
                        setStickyTtl(e.target.value);
                        if (proxyUsername.trim()) {
                          const built = buildResidentialProxyUsername(
                            'dataimpulse',
                            proxyUsername,
                            countryCode === 'AUTO' ? 'US' : countryCode,
                            undefined,
                            Number(e.target.value) || 60
                          );
                          setProxyUsername(built.fullProxyUsername);
                        }
                      }}
                      dir="ltr"
                      className="w-full bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Quota MB with Presets */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                    <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                    <span>حصة البيانات المخصصة (MB) · إيقاف تلقائي عند النفاد</span>
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    value={quotaMb}
                    onChange={(e) => setQuotaMb(e.target.value)}
                    dir="ltr"
                    className="w-24 bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none"
                  />
                  {[100, 500, 1024, 5120].map((mb) => (
                    <button
                      key={mb}
                      type="button"
                      onClick={() => setQuotaMb(String(mb))}
                      className={`px-2.5 py-2 rounded-xl text-[11px] font-mono font-semibold border transition-colors ${
                        Number(quotaMb) === mb
                          ? 'bg-sky-950/70 border-sky-500 text-sky-300'
                          : 'bg-[#0E131F] border-slate-800 text-slate-400 hover:text-white'
                      }`}
                      dir="ltr"
                    >
                      {formatDataMb(mb)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-[11px] text-sky-300/80 bg-sky-950/30 border border-sky-900/50 rounded-xl px-3 py-2">
                يتم توجيه كامل التصفح عبر الدولة المختارة (تجاوز حظر العناوين) مع الإبقاء على عداد الحصة، قفل الجهاز HWID، الإيقاف التلقائي، ورابط Happ المشفر.
              </div>
            </div>
          )}

          {/* MODE 3: GENERAL VPN (EXTERNAL V2RAY / VLESS / TROJAN) */}
          {serviceMode === 'external_v2ray' && (
            <div className="p-4 rounded-2xl bg-[#070A10] border border-violet-800/60 space-y-3.5">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
                <span className="text-xs font-bold text-violet-300 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-violet-400" />
                  <span>ربط المشترك بمصدر VPN خارجي (VLESS / Trojan)</span>
                </span>
                <button
                  type="button"
                  onClick={onOpenExternalSources}
                  className="px-2.5 py-1 rounded-lg bg-violet-950/70 hover:bg-violet-600 border border-violet-700/60 text-violet-200 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>إدارة المصادر</span>
                </button>
              </div>

              {/* Toggle Saved Source vs Custom Direct Link */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setUseCustomExtUrl(false)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                    !useCustomExtUrl
                      ? 'bg-violet-950/70 border-violet-500 text-violet-200'
                      : 'bg-[#0E131F] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  اختيار من المصادر المحفوظة ({externalSources.length})
                </button>
                <button
                  type="button"
                  onClick={() => setUseCustomExtUrl(true)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                    useCustomExtUrl
                      ? 'bg-violet-950/70 border-violet-500 text-violet-200'
                      : 'bg-[#0E131F] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  إدخال رابط مخصص مباشر
                </button>
              </div>

              {!useCustomExtUrl ? (
                <div className="space-y-2.5">
                  {externalSources.length === 0 ? (
                    <div className="p-3 rounded-xl bg-[#0E131F] border border-slate-800 text-center space-y-2">
                      <p className="text-xs text-slate-400">
                        لا توجد مصادر V2Ray خارجية مضافة بعد. أضف مصدراً أولاً أو استخدم رابطاً مخصصاً.
                      </p>
                      <button
                        type="button"
                        onClick={onOpenExternalSources}
                        className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold"
                      >
                        + إضافة مصدر V2Ray خارجي الآن
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          المصدر الخارجي (سيرفر / رابط اشتراك)
                        </label>
                        <select
                          value={externalSourceId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            setExternalSourceId(nextId);
                            const found = externalSources.find((s) => s.id === nextId);
                            if (found?.country_code) setCountryCode(found.country_code);
                          }}
                          className="w-full bg-[#0E131F] border border-slate-800 focus:border-violet-500 rounded-xl px-3 py-2.5 text-xs font-semibold text-white focus:outline-none"
                        >
                          {externalSources.map((src) => {
                            const c = getCountryInfo(src.country_code);
                            const pctText =
                              src.userinfo?.total_mb && src.userinfo.total_mb > 0
                                ? ` · ${src.userinfo.usage_pct ?? 0}% مستهلك`
                                : '';
                            const warn = src.userinfo?.near_limit ? ' ⚠️ قرب النفاد' : '';
                            return (
                              <option key={src.id} value={src.id}>
                                {c.flag} {src.name} ({src.server_count || 0} خادم{pctText}){warn}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {selectedExternalSource?.userinfo?.near_limit && (
                        <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-600/60 text-amber-200 text-[11px] flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>
                            تنبيه: هذا المصدر الخارجي اقترب من النفاد (
                            {selectedExternalSource.userinfo.usage_pct ?? 0}% مستهلك).
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    رابط اشتراك خارجي (https://...) أو رابط vless:// / trojan:// مباشر
                  </label>
                  <textarea
                    rows={3}
                    value={externalCustomUrl}
                    onChange={(e) => setExternalCustomUrl(e.target.value)}
                    dir="ltr"
                    placeholder="https://example.com/sub/... أو vless://... أو trojan://..."
                    className="w-full bg-[#0E131F] border border-slate-800 focus:border-violet-500 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none"
                  />
                </div>
              )}

              {/* Country Badge for External VPN */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  دولة السيرفر (تظهر كشارة على بطاقة المشترك)
                </label>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-full bg-[#0E131F] border border-slate-800 focus:border-violet-500 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none"
                >
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.nameAr} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-[11px] text-violet-300/85 bg-violet-950/30 border border-violet-900/50 rounded-xl px-3 py-2">
                يتم توزيع المصدر عبر رابط ديناميكي خاص بـ VPN ALISHOP خاضع لتاريخ الانتهاء وقفل الجهاز (HWID) والإيقاف الفوري، مع قراءة الاستهلاك من Subscription-Userinfo.
              </div>
            </div>
          )}

          {/* Submit */}
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
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl transition-colors"
            >
              {submitting ? 'جاري الحفظ...' : mode === 'add' ? 'إضافة المشترك' : 'حفظ التعديلات'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

