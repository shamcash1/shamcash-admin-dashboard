import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Ban,
  Globe,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  Lock,
  Sparkles,
  Users,
  User,
  Info,
} from 'lucide-react';
import { ProxyClient, parseProxyDetails, formatDataMb } from '../lib/supabase';

export interface DomainUsageItem {
  domain: string;
  requests: number;
  bytes: number;
  mb: number;
  category: 'shamcash_core' | 'shamcash_support' | 'static_direct' | 'external_leaked';
  current_action: 'proxy' | 'direct' | 'block';
  is_blocked: boolean;
  is_direct: boolean;
  users?: string[];
}

export interface RoutingRulesData {
  blocked_domains: string[];
  direct_domains: string[];
  allowed_domains: string[];
  block_support_chat: boolean;
}

interface SmartTrafficTrackerModalProps {
  isOpen: boolean;
  initialClient: ProxyClient | null; // null = global radar across all subscribers
  allClients: ProxyClient[];
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

export const SmartTrafficTrackerModal: React.FC<SmartTrafficTrackerModalProps> = ({
  isOpen,
  initialClient,
  allClients,
  onClose,
  onShowToast,
}) => {
  const [selectedMode, setSelectedMode] = useState<'single' | 'all'>(
    initialClient ? 'single' : 'all'
  );
  const [selectedClientId, setSelectedClientId] = useState<string>(initialClient?.id || '');
  const [domains, setDomains] = useState<DomainUsageItem[]>([]);
  const [summary, setSummary] = useState<{
    total_mb: number;
    shamcash_core_mb: number;
    leaked_external_mb: number;
    static_direct_mb: number;
    total_requests: number;
  }>({
    total_mb: 0,
    shamcash_core_mb: 0,
    leaked_external_mb: 0,
    static_direct_mb: 0,
    total_requests: 0,
  });
  const [rules, setRules] = useState<RoutingRulesData>({
    blocked_domains: [],
    direct_domains: [],
    allowed_domains: [],
    block_support_chat: false,
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoadingDomain, setActionLoadingDomain] = useState<string | null>(null);
  const [customDomainInput, setCustomDomainInput] = useState<string>('');
  const [customDomainAction, setCustomDomainAction] = useState<'block' | 'direct' | 'allow_proxy'>(
    'block'
  );
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [filterCategory, setFilterCategory] = useState<
    'all' | 'external_leaked' | 'shamcash_core' | 'static_direct'
  >('all');

  useEffect(() => {
    if (isOpen) {
      if (initialClient) {
        setSelectedMode('single');
        setSelectedClientId(initialClient.id);
      } else {
        setSelectedMode('all');
      }
    }
  }, [isOpen, initialClient]);

  const activeClient = allClients.find((c) => c.id === selectedClientId) || initialClient;
  const activeSubUser = activeClient
    ? parseProxyDetails(activeClient).subUser || activeClient.username
    : '';

  const fetchDomainTelemetry = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);

    const queryParam =
      selectedMode === 'all' || !activeSubUser
        ? 'all=1'
        : `proxy_username=${encodeURIComponent(activeSubUser)}`;

    const endpoints = [
      `/api/nodemaven/user-domains?${queryParam}`,
      `https://shamcash-proxy-api.vercel.app/api/nodemaven/user-domains?${queryParam}`,
    ];

    try {
      for (const url of endpoints) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const data = await res.json();
          if (data?.success) {
            setDomains(Array.isArray(data.domains) ? data.domains : []);
            if (data.summary) setSummary(data.summary);
            if (data.rules) setRules(data.rules);
            return;
          }
        } catch {
          // try fallback
        }
      }
    } finally {
      setLoading(false);
    }
  }, [isOpen, selectedMode, activeSubUser]);

  useEffect(() => {
    if (isOpen) {
      fetchDomainTelemetry();
    }
  }, [isOpen, fetchDomainTelemetry]);

  const handleRuleAction = async (
    action: 'block' | 'direct' | 'allow_proxy' | 'unblock' | 'toggle_support_chat',
    domain?: string,
    blockSupportChatValue?: boolean
  ) => {
    const key = domain || action;
    setActionLoadingDomain(key);

    const endpoints = [
      '/api/nodemaven/routing-rules',
      'https://shamcash-proxy-api.vercel.app/api/nodemaven/routing-rules',
    ];

    try {
      for (const url of endpoints) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action,
              domain,
              block_support_chat: blockSupportChatValue,
            }),
          });
          if (!res.ok) continue;
          const data = await res.json();
          if (data?.success) {
            if (data.rules) setRules(data.rules);
            await fetchDomainTelemetry();
            if (action === 'block' && domain) {
              onShowToast(`تم حظر الدومين (${domain}) نهائياً من البروكسي لجميع المشتركين`);
            } else if (action === 'direct' && domain) {
              onShowToast(`تم تحويل (${domain}) للإنترنت المحلي المجاني (0MB من البروكسي)`);
            } else if (action === 'allow_proxy' && domain) {
              onShowToast(`تم السماح للدومين (${domain}) بالمرور عبر البروكسي السوري`);
            } else if (action === 'toggle_support_chat') {
              onShowToast(
                blockSupportChatValue
                  ? 'تم حظر مرفقات دردشة الدعم الفني (support.shamcash.sy) لتوفير الصرف'
                  : 'تم تفعيل دردشة الدعم الفني (support.shamcash.sy)'
              );
            }
            return;
          }
        } catch {
          // try next
        }
      }
      onShowToast('تعذر حفظ قاعدة التوجيه حالياً، حاول مرة أخرى');
    } finally {
      setActionLoadingDomain(null);
    }
  };

  const handleAddCustomDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customDomainInput
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '');
    if (!cleaned) return;
    await handleRuleAction(customDomainAction, cleaned);
    setCustomDomainInput('');
  };

  if (!isOpen) return null;

  const filteredDomains = domains.filter((d) => {
    if (filterCategory === 'all') return true;
    if (filterCategory === 'external_leaked') return d.category === 'external_leaked';
    if (filterCategory === 'shamcash_core')
      return d.category === 'shamcash_core' || d.category === 'shamcash_support';
    if (filterCategory === 'static_direct') return d.category === 'static_direct';
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      <div className="w-full max-w-5xl bg-[#0E131F] border border-slate-800/90 rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800/80 bg-[#070A10]/90">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-700/60 text-emerald-400 shrink-0">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-white truncate">
                رادار التتبع الذكي للصرف والتحكم بالعناوين (NodeMaven Live)
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                كشف المواقع التي تستهلك باقة كل مشترك مع حظر فوري لأي عنوان خارج شام كاش
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowExplanation((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
                showExplanation
                  ? 'bg-amber-950/80 border-amber-600 text-amber-300'
                  : 'bg-[#0E131F] hover:bg-slate-800 border-slate-800 text-amber-400'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span>لماذا يصرف وهو مغلق؟</span>
            </button>

            <button
              type="button"
              onClick={fetchDomainTelemetry}
              disabled={loading}
              className="p-2 rounded-xl bg-[#0E131F] hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
              title="تحديث بيانات الرادار من NodeMaven"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-[#0E131F] hover:bg-rose-950/60 border border-slate-800 text-slate-400 hover:text-rose-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Root Cause Diagnostic Box (Collapsible) */}
          {showExplanation && (
            <div className="p-4 rounded-2xl bg-amber-950/25 border border-amber-700/50 space-y-2.5 text-xs leading-relaxed">
              <div className="flex items-center justify-between">
                <div className="font-bold text-amber-300 flex items-center gap-2 text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>التحليل التقني الدقيق: لماذا كان هناك صرف والمشترك يقول أن البروكسي مغلق؟</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExplanation(false)}
                  className="text-slate-400 hover:text-white text-[11px]"
                >
                  إخفاء
                </button>
              </div>
              <ul className="space-y-1.5 text-slate-200 list-disc list-inside">
                <li>
                  <strong className="text-amber-300">1. إغلاق نافذة Happ لا يوقف الـ VPN في الهاتف:</strong>{' '}
                  العميل يسحب تطبيق Happ من الشاشة فيظن أنه مغلق، بينما نفق الـ VPN في نظام أندرويد/آيفون يبقى شغالاً في الخلفية 24 ساعة ويمرر طلبات المواقع الأخرى.
                </li>
                <li>
                  <strong className="text-amber-300">
                    2. ثغرة ترويسة <code className="font-mono">routing-enable: 1</code> في Happ (تم حلها جذرياً الآن):
                  </strong>{' '}
                  تطبيق Happ عندما يستقبل <code className="font-mono">routing-enable: 1</code> يقوم بتفعيل ملف التوجيه الافتراضي الداخلي الخاص به (<code className="font-mono">GlobalProxy: true</code>) ويتجاهل قواعد العزل المرفقة في الاشتراك، مما سمح بمرور مواقع مثل{' '}
                  <code className="font-mono text-rose-300">www.kazawallet.com (59MB)</code> و{' '}
                  <code className="font-mono text-rose-300">abili.syriatel.com.sy (10MB)</code> و{' '}
                  <code className="font-mono text-rose-300">syriancrypto.com (10MB)</code>. تم الآن ضبط{' '}
                  <code className="font-mono text-emerald-300">routing-enable: 0</code> مع{' '}
                  <code className="font-mono text-emerald-300">per-app-proxy-list-set: com.shmacash.shamcash</code>{' '}
                  لإجبار Happ على تطبيق الحصار الصارم 100%.
                </li>
                <li>
                  <strong className="text-amber-300">
                    3. فصل الصور الثقيلة ودردشة الدعم الفني داخل شام كاش:
                  </strong>{' '}
                  دومين <code className="font-mono text-sky-300">fsn1.your-objectstorage.com (8MB)</code> هو سيرفر الصور والبنرات داخل تطبيق شام كاش؛ قمنا بتحويله إلى{' '}
                  <strong className="text-emerald-300">الإنترنت المحلي المجاني (Direct 0MB)</strong> لكي تفتح الصور بسرعة كاملة دون خصم أي بايت من رصيد NodeMaven. كما يمكنك بضغطة زر بالأسفل حظر{' '}
                  <code className="font-mono text-amber-300">support.shamcash.sy (21MB)</code> إذا أردت منع مرفقات الدعم الفني الثقيلة.
                </li>
              </ul>
            </div>
          )}

          {/* Mode Selector: Single Subscriber vs Global Radar Across All Subscribers */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#070A10] border border-slate-800/90 rounded-2xl p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedMode('single')}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                  selectedMode === 'single'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#0E131F] text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>تتبع مشترك محدد</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMode('all')}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                  selectedMode === 'all'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#0E131F] text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>الرادار الشامل (جميع المشتركين)</span>
              </button>
            </div>

            {selectedMode === 'single' && (
              <div className="flex items-center gap-2 flex-1 sm:max-w-xs">
                <span className="text-xs text-slate-400 whitespace-nowrap">المشترك:</span>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  dir="ltr"
                  className="flex-1 bg-[#0E131F] border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-white focus:outline-none"
                >
                  {allClients.map((c) => {
                    const details = parseProxyDetails(c);
                    return (
                      <option key={c.id} value={c.id}>
                        {c.username} ({details.subUser || 'No-SubUser'})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {/* 3 Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#070A10] border border-slate-800/90 rounded-2xl p-3.5">
              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>إجمالي الصرف المرصود (آخر 28 يوم)</span>
                <Activity className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="text-xl font-extrabold font-mono text-white" dir="ltr">
                  {formatDataMb(summary.total_mb)}
                </span>
                <span className="text-[11px] font-mono text-slate-400" dir="ltr">
                  {summary.total_requests.toLocaleString()} طلب
                </span>
              </div>
            </div>

            <div className="bg-[#070A10] border border-emerald-900/60 rounded-2xl p-3.5">
              <div className="text-[11px] text-emerald-300 flex items-center justify-between">
                <span>صرف شام كاش الفعلي (API + التطبيق)</span>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="text-xl font-extrabold font-mono text-emerald-400" dir="ltr">
                  {formatDataMb(summary.shamcash_core_mb)}
                </span>
                <span className="text-[11px] text-emerald-500 font-semibold">مسار آمن ومسموح</span>
              </div>
            </div>

            <div className="bg-[#070A10] border border-rose-900/60 rounded-2xl p-3.5">
              <div className="text-[11px] text-rose-300 flex items-center justify-between">
                <span>صرف مواقع خارجية + تخزين سحابي</span>
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="text-xl font-extrabold font-mono text-rose-400" dir="ltr">
                  {formatDataMb(
                    Number((summary.leaked_external_mb + summary.static_direct_mb).toFixed(2))
                  )}
                </span>
                <span className="text-[11px] text-rose-400 font-semibold">
                  تم عزله وحظره تلقائياً
                </span>
              </div>
            </div>
          </div>

          {/* Quick Dynamic Controls Bar: Custom Domain Blocker + Support Chat Toggle */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-[#070A10] border border-slate-800/90 rounded-2xl p-3.5">
            <form
              onSubmit={handleAddCustomDomain}
              className="lg:col-span-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
            >
              <div className="relative flex-1">
                <Globe className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={customDomainInput}
                  onChange={(e) => setCustomDomainInput(e.target.value)}
                  placeholder="أدخل أي دومين للتحكم به (مثال: kazawallet.com أو syriancrypto.com)"
                  dir="ltr"
                  className="w-full bg-[#0E131F] border border-slate-800 focus:border-emerald-500 rounded-xl pr-8 pl-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none"
                />
              </div>

              <select
                value={customDomainAction}
                onChange={(e) =>
                  setCustomDomainAction(e.target.value as 'block' | 'direct' | 'allow_proxy')
                }
                className="bg-[#0E131F] border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none"
              >
                <option value="block">حظر نهائي (0MB)</option>
                <option value="direct">إنترنت محلي مجاني (Direct 0MB)</option>
                <option value="allow_proxy">سماح عبر البروكسي السوري</option>
              </select>

              <button
                type="submit"
                disabled={!customDomainInput.trim() || actionLoadingDomain !== null}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>تطبيق القاعدة</span>
              </button>
            </form>

            {/* Support Chat Heavy Attachments Toggle */}
            <div className="lg:col-span-4 flex items-center justify-between gap-2 bg-[#0E131F] border border-slate-800 rounded-xl px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-200 truncate">
                  دردشة الدعم (<code className="font-mono">support.shamcash.sy</code>)
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  استهلكت 21MB بسبب الصور والمرفقات
                </div>
              </div>
              <button
                type="button"
                disabled={actionLoadingDomain === 'toggle_support_chat'}
                onClick={() =>
                  handleRuleAction('toggle_support_chat', undefined, !rules.block_support_chat)
                }
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 border transition-colors ${
                  rules.block_support_chat
                    ? 'bg-rose-950/80 border-rose-700 text-rose-300 hover:bg-emerald-950 hover:text-emerald-300'
                    : 'bg-emerald-950/70 border-emerald-700 text-emerald-300 hover:bg-rose-950 hover:text-rose-300'
                }`}
              >
                {rules.block_support_chat ? 'محظورة (تفعيل؟)' : 'مسموحة (حظر؟)'}
              </button>
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {[
                { id: 'all', label: `كل العناوين المرصودة (${domains.length})` },
                {
                  id: 'external_leaked',
                  label: `مواقع خارجية غير تابعة لشام كاش (${
                    domains.filter((d) => d.category === 'external_leaked').length
                  })`,
                },
                {
                  id: 'shamcash_core',
                  label: `عناوين شام كاش الرسمية (${
                    domains.filter(
                      (d) =>
                        d.category === 'shamcash_core' || d.category === 'shamcash_support'
                    ).length
                  })`,
                },
                {
                  id: 'static_direct',
                  label: `سيرفرات الصور المجانية Direct (${
                    domains.filter((d) => d.category === 'static_direct').length
                  })`,
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterCategory(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                    filterCategory === tab.id
                      ? 'bg-slate-800 text-white border border-slate-700'
                      : 'bg-[#070A10] text-slate-400 hover:text-slate-200 border border-slate-800/80'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <span className="text-[11px] text-slate-400">
              أي تعديل هنا يُطبّق فوراً في تحديث اشتراك Happ القادم دون تغيير الكود المشفر
            </span>
          </div>

          {/* Domains Table */}
          {loading ? (
            <div className="bg-[#070A10] border border-slate-800 rounded-2xl p-8 text-center space-y-3">
              <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="text-xs text-slate-300 font-medium">
                جاري سحب سجل الدومينات الفعلي من بوابة NodeMaven...
              </div>
            </div>
          ) : filteredDomains.length === 0 ? (
            <div className="bg-[#070A10] border border-slate-800 rounded-2xl p-8 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <div className="text-sm font-bold text-white">
                لا توجد دومينات مسجلة في هذا التصنيف لهذا المشترك حالياً
              </div>
              <p className="text-xs text-slate-400">
                جميع العناوين الخارجية غير التابعة لشام كاش محظورة تلقائياً عبر الجدار الناري.
              </p>
            </div>
          ) : (
            <div className="bg-[#070A10] border border-slate-800/90 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-[#0B0F19] text-[11px] font-bold text-slate-400">
                      <th className="py-3 px-4">العنوان / الدومين (Domain)</th>
                      <th className="py-3 px-3">التصنيف</th>
                      <th className="py-3 px-3">الاستهلاك والطلبات</th>
                      {selectedMode === 'all' && <th className="py-3 px-3">البروكسيات المستهلكة</th>}
                      <th className="py-3 px-3">حالة التوجيه الحالية</th>
                      <th className="py-3 px-4 text-left">تحكم فوري بالعنوان</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-xs">
                    {filteredDomains.map((item) => {
                      const isBusy = actionLoadingDomain === item.domain;
                      return (
                        <tr key={item.domain} className="hover:bg-slate-800/30 transition-colors">
                          {/* Domain */}
                          <td className="py-3 px-4 font-mono font-bold text-white" dir="ltr">
                            {item.domain}
                          </td>

                          {/* Category Badge */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {item.category === 'shamcash_core' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-800/60 text-[11px] font-semibold text-emerald-300">
                                <ShieldCheck className="w-3 h-3" />
                                <span>شام كاش أساسي</span>
                              </span>
                            )}
                            {item.category === 'shamcash_support' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/70 border border-amber-800/60 text-[11px] font-semibold text-amber-300">
                                <Sparkles className="w-3 h-3" />
                                <span>دردشة دعم شام كاش</span>
                              </span>
                            )}
                            {item.category === 'static_direct' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-950/70 border border-sky-800/60 text-[11px] font-semibold text-sky-300">
                                <Wifi className="w-3 h-3" />
                                <span>تخزين صور شام كاش</span>
                              </span>
                            )}
                            {item.category === 'external_leaked' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/70 border border-rose-800/60 text-[11px] font-semibold text-rose-300">
                                <ShieldAlert className="w-3 h-3" />
                                <span>موقع خارجي دخيل</span>
                              </span>
                            )}
                          </td>

                          {/* MB & Requests */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-mono font-extrabold text-sm ${
                                  item.category === 'external_leaked'
                                    ? 'text-rose-400'
                                    : item.category === 'static_direct'
                                    ? 'text-sky-300'
                                    : 'text-emerald-400'
                                }`}
                                dir="ltr"
                              >
                                {formatDataMb(item.mb)}
                              </span>
                              <span className="text-[11px] font-mono text-slate-400" dir="ltr">
                                ({item.requests} req)
                              </span>
                            </div>
                          </td>

                          {/* Users (in Global Mode) */}
                          {selectedMode === 'all' && (
                            <td className="py-3 px-3">
                              <div className="flex flex-wrap gap-1 max-w-[200px]" dir="ltr">
                                {(item.users || []).slice(0, 4).map((u) => (
                                  <span
                                    key={u}
                                    className="px-1.5 py-0.5 rounded bg-[#0E131F] border border-slate-800 text-[10px] font-mono text-slate-300"
                                  >
                                    {u}
                                  </span>
                                ))}
                                {(item.users || []).length > 4 && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300">
                                    +{(item.users || []).length - 4}
                                  </span>
                                )}
                              </div>
                            </td>
                          )}

                          {/* Current Routing Action Status */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {item.current_action === 'block' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/80 border border-rose-700/70 text-[11px] font-bold text-rose-300">
                                <Ban className="w-3 h-3" />
                                <span>محظور نهائياً (0MB)</span>
                              </span>
                            )}
                            {item.current_action === 'direct' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-950/80 border border-sky-700/70 text-[11px] font-bold text-sky-300">
                                <Wifi className="w-3 h-3" />
                                <span>إنترنت محلي مجاني (0MB)</span>
                              </span>
                            )}
                            {item.current_action === 'proxy' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-700/70 text-[11px] font-bold text-emerald-300">
                                <Lock className="w-3 h-3" />
                                <span>يمر عبر البروكسي السوري</span>
                              </span>
                            )}
                          </td>

                          {/* 1-Click Action Buttons */}
                          <td className="py-3 px-4 whitespace-nowrap text-left">
                            <div className="flex items-center justify-end gap-1.5">
                              {item.current_action !== 'block' && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleRuleAction('block', item.domain)}
                                  className="px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-800/70 text-[11px] font-bold transition-colors"
                                  title="حظر هذا العنوان نهائياً لكي لا يسحب أي بايت"
                                >
                                  حظر نهائي
                                </button>
                              )}

                              {item.current_action !== 'direct' && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleRuleAction('direct', item.domain)}
                                  className="px-2.5 py-1 rounded-lg bg-sky-950/80 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-800/70 text-[11px] font-bold transition-colors"
                                  title="تمرير هذا العنوان من إنترنت المشترك العادي بدون خصم من البروكسي"
                                >
                                  محلي مجاني (0MB)
                                </button>
                              )}

                              {item.current_action !== 'proxy' && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleRuleAction('allow_proxy', item.domain)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-800/70 text-[11px] font-bold transition-colors"
                                  title="السماح لهذا العنوان بالمرور عبر البروكسي السوري"
                                >
                                  سماح بالبروكسي
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
