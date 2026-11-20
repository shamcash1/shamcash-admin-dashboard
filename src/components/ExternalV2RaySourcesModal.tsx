import React, { useState } from 'react';
import {
  X,
  Plus,
  RefreshCw,
  Trash2,
  Edit3,
  AlertTriangle,
  CheckCircle2,
  Globe,
  Link2,
  Server,
  Zap,
  ShieldAlert,
  SearchCheck,
} from 'lucide-react';
import {
  COUNTRY_OPTIONS,
  ExternalV2RaySource,
  ProxyClient,
  formatDataMb,
  getCountryInfo,
  saveExternalV2RaySource,
  deleteExternalV2RaySource,
  probeExternalV2RaySourceApi,
} from '../lib/supabase';

interface ExternalV2RaySourcesModalProps {
  isOpen: boolean;
  sources: ExternalV2RaySource[];
  allClients: ProxyClient[];
  onClose: () => void;
  onSourcesChange: (sources: ExternalV2RaySource[]) => void;
  onRefreshAll: () => Promise<void>;
  onShowToast: (msg: string) => void;
}

export const ExternalV2RaySourcesModal: React.FC<ExternalV2RaySourcesModalProps> = ({
  isOpen,
  sources,
  allClients,
  onClose,
  onSourcesChange,
  onRefreshAll,
  onShowToast,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('AUTO');
  const [sourceUrl, setSourceUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [probingDraft, setProbingDraft] = useState(false);
  const [probingId, setProbingId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [draftProbeResult, setDraftProbeResult] = useState<{
    ok: boolean;
    server_count: number;
    protocols: string[];
    userinfo: ExternalV2RaySource['userinfo'];
    error_msg?: string | null;
  } | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCountryCode('AUTO');
    setSourceUrl('');
    setNotes('');
    setFormError(null);
    setDraftProbeResult(null);
  };

  const startEdit = (src: ExternalV2RaySource) => {
    setEditingId(src.id);
    setName(src.name);
    setCountryCode(src.country_code || 'AUTO');
    setSourceUrl(src.source_url);
    setNotes(src.notes || '');
    setFormError(null);
    setDraftProbeResult(null);
  };

  const handleProbeDraft = async () => {
    if (!sourceUrl.trim()) {
      setFormError('يرجى لصق رابط الاشتراك أو روابط VLESS/Trojan أولاً.');
      return;
    }
    setFormError(null);
    setProbingDraft(true);
    try {
      const res = await probeExternalV2RaySourceApi({ source_url: sourceUrl.trim() });
      if (res.probe) {
        setDraftProbeResult({
          ok: res.success,
          server_count: res.probe.server_count,
          protocols: res.probe.protocols,
          userinfo: res.probe.userinfo,
          error_msg: res.probe.error_msg,
        });
      } else {
        setFormError(res.error || 'تعذر فحص الرابط الخارجي');
      }
    } finally {
      setProbingDraft(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError('يرجى إدخال اسم واضح للمصدر (مثلاً: سيرفر ألمانيا سريع VLESS).');
      return;
    }
    if (!sourceUrl.trim()) {
      setFormError('يرجى لصق رابط الاشتراك (https://...) أو روابط vless:// / trojan:// المباشرة.');
      return;
    }

    setSaving(true);
    try {
      const res = await saveExternalV2RaySource({
        id: editingId || undefined,
        name: name.trim(),
        source_url: sourceUrl.trim(),
        country_code: countryCode,
        notes: notes.trim(),
      });
      if (!res.success || !res.sources) {
        setFormError(res.error || 'تعذر حفظ المصدر الخارجي');
        return;
      }
      onSourcesChange(res.sources);
      onShowToast(editingId ? `تم تحديث المصدر الخارجي · ${name.trim()}` : `تمت إضافة مصدر V2Ray · ${name.trim()}`);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleProbeSource = async (src: ExternalV2RaySource) => {
    if (probingId) return;
    setProbingId(src.id);
    try {
      const res = await probeExternalV2RaySourceApi({ source_id: src.id });
      if (res.sources) {
        onSourcesChange(res.sources);
      }
      if (res.success) {
        const ui = res.probe?.userinfo;
        if (ui && ui.total_mb && ui.total_mb > 0) {
          onShowToast(
            `تم فحص ${src.name} · المستهلك ${formatDataMb(ui.used_mb || 0)} من ${formatDataMb(ui.total_mb)} (${ui.usage_pct || 0}%)`
          );
        } else {
          onShowToast(
            `تم فحص ${src.name} · تم رصد ${res.probe?.server_count || 0} خادم (${(res.probe?.protocols || []).join(', ') || 'V2Ray'})`
          );
        }
      } else {
        onShowToast(res.probe?.error_msg || res.error || `تعذر الوصول للمصدر ${src.name}`);
      }
    } finally {
      setProbingId(null);
    }
  };

  const handleDeleteSource = async (src: ExternalV2RaySource) => {
    if (deletingId) return;
    setDeletingId(src.id);
    try {
      const res = await deleteExternalV2RaySource(src.id);
      if (res.success && res.sources) {
        onSourcesChange(res.sources);
        if (editingId === src.id) resetForm();
        onShowToast(`تم حذف المصدر الخارجي · ${src.name}`);
      } else {
        onShowToast(res.error || 'تعذر حذف المصدر الخارجي');
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleRefreshAllClick = async () => {
    if (refreshingAll) return;
    setRefreshingAll(true);
    try {
      await onRefreshAll();
      onShowToast('تم تحديث حالة واستهلاك جميع مصادر V2Ray الخارجية');
    } finally {
      setRefreshingAll(false);
    }
  };

  const formatExpireUnix = (unixSec?: number) => {
    if (!unixSec || unixSec <= 0) return null;
    const d = new Date(unixSec * 1000);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-4xl bg-[#0E131F] border border-slate-800/90 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-800/80 bg-[#0A0E17] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-violet-950/80 border border-violet-700/60 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-violet-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                مصادر VPN عام (سيرفرات V2Ray / VLESS / Trojan الخارجية)
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                إدارة روابط الاشتراك الخارجية، توزيعها كروابط ديناميكية، ومراقبة استهلاك Subscription-Userinfo تلقائياً
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRefreshAllClick}
              disabled={refreshingAll || sources.length === 0}
              className="h-8 px-3 rounded-xl bg-violet-950/70 hover:bg-violet-600 border border-violet-700/60 text-violet-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingAll ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث استهلاك الكل</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1">
          {/* Add / Edit External Source Form */}
          <form
            onSubmit={handleSave}
            className="bg-[#070A10] border border-slate-800/90 rounded-2xl p-4 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-violet-300 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-violet-400" />
                <span>
                  {editingId ? 'تعديل مصدر V2Ray خارجي' : 'إضافة مصدر اشتراك خارجي جديد (VLESS / Trojan / Sub URL)'}
                </span>
              </div>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded-lg bg-slate-800/70"
                >
                  إلغاء التعديل
                </button>
              )}
            </div>

            {formError && (
              <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  اسم المصدر / السيرفر
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: اشتراك ألمانيا VLESS سريع - الباقة الشهرية"
                  className="w-full bg-[#0E131F] border border-slate-800 focus:border-violet-500 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-slate-600 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  الدولة / الموقع
                </label>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-full bg-[#0E131F] border border-slate-800 focus:border-violet-500 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none transition-colors"
                >
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.nameAr} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-[11px] font-medium text-slate-400">
                  رابط الاشتراك الخارجي (https://...) أو روابط مباشرة (vless:// / trojan://)
                </label>
                <button
                  type="button"
                  onClick={handleProbeDraft}
                  disabled={probingDraft || !sourceUrl.trim()}
                  className="px-2.5 py-1 rounded-lg bg-sky-950/70 hover:bg-sky-600 border border-sky-700/60 text-sky-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-40"
                >
                  <SearchCheck className={`w-3.5 h-3.5 ${probingDraft ? 'animate-pulse' : ''}`} />
                  <span>{probingDraft ? 'جاري الفحص...' : 'فحص الرابط وقراءة الاستهلاك'}</span>
                </button>
              </div>
              <textarea
                rows={3}
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                dir="ltr"
                placeholder={'https://panel.example.com/sub/token...\nأو الصق روابط مباشرة:\nvless://uuid@host:443?security=reality...#Server1\ntrojan://pass@host:443...#Server2'}
                className="w-full bg-[#0E131F] border border-slate-800 focus:border-violet-500 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none transition-colors resize-y"
              />
            </div>

            {draftProbeResult && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                  draftProbeResult.ok
                    ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-800/60 text-rose-200'
                }`}
              >
                {draftProbeResult.ok ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold flex items-center gap-1.5 text-emerald-300">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>الرابط شغال بنجاح</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-300">
                        {draftProbeResult.server_count} سيرفر ·{' '}
                        {draftProbeResult.protocols.join(' / ') || 'V2Ray'}
                      </span>
                    </div>
                    {draftProbeResult.userinfo && draftProbeResult.userinfo.total_mb ? (
                      <div className="text-[11px] text-slate-300 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-emerald-800/40">
                        <span>
                          ترويسة Subscription-Userinfo: مستهلك{' '}
                          <strong className="font-mono text-white" dir="ltr">
                            {formatDataMb(draftProbeResult.userinfo.used_mb || 0)}
                          </strong>{' '}
                          من{' '}
                          <strong className="font-mono text-emerald-300" dir="ltr">
                            {formatDataMb(draftProbeResult.userinfo.total_mb)}
                          </strong>
                        </span>
                        <span className="font-mono font-bold">
                          {draftProbeResult.userinfo.usage_pct || 0}%
                        </span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400">
                        لا يحتوي هذا الرابط على ترويسة Subscription-Userinfo (يمكن استخدامه وتوزيعه بمدة زمنية ديناميكية بشكل طبيعي).
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-rose-300">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{draftProbeResult.error_msg || 'تعذر الاتصال بالرابط الخارجي'}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظة اختيارية (مثلاً: المزود، الباقة، سرعة السيرفر...)"
                className="flex-1 bg-[#0E131F] border border-slate-800 focus:border-violet-500 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>
                  {saving ? 'جاري الفحص والحفظ...' : editingId ? 'حفظ التعديلات' : 'إضافة وحفظ المصدر'}
                </span>
              </button>
            </div>
          </form>

          {/* Saved External V2Ray Sources List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Server className="w-4 h-4 text-violet-400" />
                <span>المصادر المحفوظة ({sources.length})</span>
              </h3>
            </div>

            {sources.length === 0 ? (
              <div className="bg-[#070A10] border border-slate-800/80 rounded-2xl p-8 text-center space-y-2">
                <Link2 className="w-7 h-7 text-slate-600 mx-auto" />
                <div className="text-xs font-semibold text-slate-300">
                  لا توجد مصادر V2Ray خارجية مضافة بعد
                </div>
                <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                  أضف روابط اشتراك VLESS أو Trojan الخارجية أعلاه لتوزيعها على المشتركين بمدة زمنية مستقلة ومراقبة استهلاكها تلقائياً.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sources.map((src) => {
                  const country = getCountryInfo(src.country_code);
                  const assignedCount = allClients.filter(
                    (c) => c.service_mode === 'external_v2ray' && c.external_source_id === src.id
                  ).length;
                  const ui = src.userinfo;
                  const hasQuota = Boolean(ui && ui.status === 'ok' && ui.total_mb && ui.total_mb > 0);
                  const isNearLimit = Boolean(ui?.near_limit);
                  const expireDateStr = formatExpireUnix(ui?.expire);
                  const pct = ui?.usage_pct ?? 0;

                  return (
                    <div
                      key={src.id}
                      className={`bg-[#070A10] border rounded-2xl p-4 space-y-3 transition-colors ${
                        isNearLimit
                          ? 'border-amber-500/70 shadow-md shadow-amber-950/30'
                          : 'border-slate-800/90'
                      }`}
                    >
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white truncate">{src.name}</span>
                            <span className="px-2 py-0.5 rounded-md bg-violet-950/70 border border-violet-800/60 text-[10px] font-semibold text-violet-300 whitespace-nowrap">
                              {country.flag} {country.nameAr}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-400">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800/80 font-mono text-slate-300">
                              {src.kind === 'direct_links' ? 'روابط مباشرة' : 'رابط اشتراك Sub'}
                            </span>
                            {(src.protocols || []).map((p) => (
                              <span
                                key={p}
                                className="px-1.5 py-0.5 rounded bg-sky-950/60 border border-sky-800/50 font-mono text-sky-300"
                              >
                                {p}
                              </span>
                            ))}
                            <span className="font-mono text-slate-400">
                              · {src.server_count || 0} خادم
                            </span>
                            <span className="text-emerald-400 font-semibold">
                              · {assignedCount} مشترك مرتبط
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleProbeSource(src)}
                            disabled={probingId === src.id}
                            title="فحص الاستهلاك وتحديث ترويسة Subscription-Userinfo الآن"
                            className="p-1.5 rounded-lg bg-[#0E131F] hover:bg-slate-800 border border-slate-800 text-sky-300 transition-colors"
                          >
                            <RefreshCw
                              className={`w-3.5 h-3.5 ${probingId === src.id ? 'animate-spin' : ''}`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(src)}
                            title="تعديل المصدر"
                            className="p-1.5 rounded-lg bg-[#0E131F] hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSource(src)}
                            disabled={deletingId === src.id}
                            title="حذف المصدر"
                            className="p-1.5 rounded-lg bg-[#0E131F] hover:bg-rose-950/70 border border-slate-800 hover:border-rose-800/60 text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Near-Exhaustion Warning Banner */}
                      {isNearLimit && (
                        <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-600/60 text-amber-200 text-[11px] flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>
                            <strong>تنبيه قرب النفاد:</strong>{' '}
                            {ui?.expire_soon
                              ? `صلاحية المصدر الخارجي قريبة من الانتهاء (${expireDateStr || 'قريباً'}).`
                              : `استهلك المصدر ${pct}% (المتبقي ${formatDataMb(ui?.remaining_mb || 0)}). يُنصح بتجديده أو استبداله.`}
                          </span>
                        </div>
                      )}

                      {/* Live Subscription-Userinfo Telemetry */}
                      {hasQuota ? (
                        <div className="bg-[#0B0F19] border border-slate-800/80 rounded-xl p-3 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">استهلاك المصدر (Userinfo):</span>
                            <span className="font-mono font-bold text-white" dir="ltr">
                              {formatDataMb(ui?.used_mb || 0)} / {formatDataMb(ui?.total_mb || 0)}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                pct >= 85
                                  ? 'bg-rose-500'
                                  : pct >= 70
                                  ? 'bg-amber-400'
                                  : 'bg-violet-500'
                              }`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>
                              المتبقي:{' '}
                              <strong className="text-emerald-400 font-mono" dir="ltr">
                                {formatDataMb(ui?.remaining_mb || 0)}
                              </strong>
                              {expireDateStr && (
                                <span className="text-slate-500 mr-2">
                                  · انتهاء المصدر: <span className="font-mono">{expireDateStr}</span>
                                </span>
                              )}
                            </span>
                            <span className="font-mono font-bold text-slate-300">{pct}%</span>
                          </div>
                        </div>
                      ) : ui?.status === 'error' ? (
                        <div className="bg-rose-950/30 border border-rose-900/60 rounded-xl px-3 py-2 text-[11px] text-rose-300 flex items-center justify-between gap-2">
                          <span className="truncate">{ui.error_msg || 'تعذر قراءة الاستهلاك'}</span>
                          <span className="text-[10px] text-rose-400 shrink-0">خطأ فحص</span>
                        </div>
                      ) : (
                        <div className="bg-[#0B0F19] border border-slate-800/80 rounded-xl px-3 py-2 text-[11px] text-slate-400 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                            <span>
                              {src.kind === 'direct_links'
                                ? 'روابط V2Ray مباشرة (توزيع بمدة زمنية ديناميكية)'
                                : 'لا يوفر المزود ترويسة Userinfo (مفتوح بمدة زمنية)'}
                            </span>
                          </span>
                          <span className="font-mono text-violet-300 text-[10px]">نشط</span>
                        </div>
                      )}

                      {src.notes && (
                        <div className="text-[11px] text-slate-400 truncate">
                          ملاحظة: <span className="text-slate-300">{src.notes}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
