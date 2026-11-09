import React, { useState, useEffect } from 'react';
import { X, Calendar, Server, User, Check, Copy, AlertCircle, Lock, KeyRound } from 'lucide-react';
import { ProxyClient, getClientPacUrl, addDaysToDateString } from '../lib/supabase';

interface ClientModalProps {
  isOpen: boolean;
  mode: 'add' | 'edit';
  initialClient?: ProxyClient | null;
  existingUsernames: string[];
  defaultProxyHost?: string;
  defaultProxyPort?: number;
  defaultProxyUsername?: string;
  defaultProxyPassword?: string;
  onClose: () => void;
  onSubmit: (
    clientData: Omit<ProxyClient, 'id' | 'created_at' | 'updated_at'>,
    id?: string
  ) => Promise<void>;
}

export const ClientModal: React.FC<ClientModalProps> = ({
  isOpen,
  mode,
  initialClient,
  existingUsernames,
  defaultProxyHost = '185.190.140.20',
  defaultProxyPort = 8080,
  defaultProxyUsername = '',
  defaultProxyPassword = '',
  onClose,
  onSubmit,
}) => {
  const [username, setUsername] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [expiryDate, setExpiryDate] = useState(() => addDaysToDateString(null, 30));
  const [proxyHost, setProxyHost] = useState(defaultProxyHost);
  const [proxyPort, setProxyPort] = useState<string>(String(defaultProxyPort));
  const [proxyUsername, setProxyUsername] = useState(defaultProxyUsername);
  const [proxyPassword, setProxyPassword] = useState(defaultProxyPassword);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedPreview, setCopiedPreview] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (mode === 'edit' && initialClient) {
      setUsername(initialClient.username);
      setIsActive(initialClient.is_active);
      setExpiryDate(initialClient.expiry_date);
      setProxyHost(initialClient.proxy_host);
      setProxyPort(String(initialClient.proxy_port));
      setProxyUsername(initialClient.proxy_username || '');
      setProxyPassword(initialClient.proxy_password || '');
    } else {
      setUsername('');
      setIsActive(true);
      setExpiryDate(addDaysToDateString(null, 30));
      setProxyHost(defaultProxyHost);
      setProxyPort(String(defaultProxyPort));
      setProxyUsername(defaultProxyUsername);
      setProxyPassword(defaultProxyPassword);
    }
  }, [
    isOpen,
    mode,
    initialClient,
    defaultProxyHost,
    defaultProxyPort,
    defaultProxyUsername,
    defaultProxyPassword,
  ]);

  if (!isOpen) return null;

  const trimmedUsername = username.trim().replace(/\s+/g, '_');
  const previewUrl = trimmedUsername
    ? getClientPacUrl(trimmedUsername)
    : 'https://shamcash-proxy-api.vercel.app/sub/{username}';

  const handleQuickDuration = (days: number) => {
    const base = mode === 'edit' ? expiryDate : null;
    setExpiryDate(addDaysToDateString(base, days));
  };

  const handleCopyPreview = () => {
    if (!trimmedUsername) return;
    navigator.clipboard.writeText(previewUrl);
    setCopiedPreview(true);
    setTimeout(() => setCopiedPreview(false), 1800);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!trimmedUsername) {
      setError('يرجى إدخال اسم المستخدم الخاص بالعميل.');
      return;
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
      setError('اسم المستخدم يجب أن يحتوي على أحرف إنجليزية، أرقام، أو (_ . -) فقط ليعمل في الرابط.');
      return;
    }

    const isDuplicate = existingUsernames.some(
      (u) =>
        u.toLowerCase() === trimmedUsername.toLowerCase() &&
        (mode === 'add' || initialClient?.username.toLowerCase() !== trimmedUsername.toLowerCase())
    );
    if (isDuplicate) {
      setError('اسم المستخدم هذا مسجل مسبقاً لعميل آخر.');
      return;
    }

    if (!expiryDate) {
      setError('يرجى تحديد تاريخ انتهاء الاشتراك.');
      return;
    }

    if (!proxyHost.trim()) {
      setError('يرجى إدخال عنوان IP البروكسي.');
      return;
    }

    const portNum = Number(proxyPort);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setError('منفذ البروكسي (Port) يجب أن يكون رقماً صحيحاً بين 1 و 65535.');
      return;
    }

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
        },
        initialClient?.id
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء حفظ بيانات العميل.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 id="modal-title" className="text-base font-bold text-slate-100">
            {mode === 'add' ? 'إضافة عميل بروكسي جديد' : `تعديل بيانات العميل: ${initialClient?.username}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="إغلاق النافذة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-lg bg-rose-950/50 border border-rose-800/70 text-rose-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Username & Active Toggle Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="client-username" className="block text-xs font-medium text-slate-300 mb-1.5">
                اسم المستخدم (Username)
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="client-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="مثال: ahmad_vip"
                  dir="ltr"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg pr-9 pl-3 py-2.5 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none transition-colors"
                  autoFocus={mode === 'add'}
                />
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-300 mb-1.5">حالة الحساب</span>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`w-full h-[42px] px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300 hover:bg-emerald-950/60'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{isActive ? 'نشط ومفعل' : 'موقوف مؤقتاً'}</span>
              </button>
            </div>
          </div>

          {/* Expiry Date + Quick Extension Buttons */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="client-expiry" className="text-xs font-medium text-slate-300">
                تاريخ انتهاء الصلاحية (Expiry Date)
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickDuration(7)}
                  className="px-2 py-0.5 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors whitespace-nowrap"
                >
                  +7 أيام
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDuration(30)}
                  className="px-2 py-0.5 text-[11px] bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded transition-colors whitespace-nowrap"
                >
                  +30 يوم
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDuration(90)}
                  className="px-2 py-0.5 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors whitespace-nowrap"
                >
                  +3 أشهر
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDuration(365)}
                  className="px-2 py-0.5 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors whitespace-nowrap"
                >
                  +سنة
                </button>
              </div>
            </div>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="client-expiry"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                dir="ltr"
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg pr-9 pl-3 py-2.5 text-sm font-mono tabular-nums text-slate-100 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Proxy Host & Port */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="client-host" className="block text-xs font-medium text-slate-300 mb-1.5">
                عنوان IP البروكسي (Proxy IP)
              </label>
              <div className="relative">
                <Server className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="client-host"
                  type="text"
                  value={proxyHost}
                  onChange={(e) => setProxyHost(e.target.value)}
                  placeholder="185.190.140.20"
                  dir="ltr"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg pr-9 pl-3 py-2.5 text-sm font-mono tabular-nums text-slate-100 placeholder-slate-600 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="client-port" className="block text-xs font-medium text-slate-300 mb-1.5">
                منفذ البروكسي (Port)
              </label>
              <input
                id="client-port"
                type="number"
                min={1}
                max={65535}
                value={proxyPort}
                onChange={(e) => setProxyPort(e.target.value)}
                placeholder="8080"
                dir="ltr"
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2.5 text-sm font-mono tabular-nums text-slate-100 placeholder-slate-600 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Optional Proxy Authentication (proxy_username & proxy_password) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label htmlFor="proxy-username" className="block text-xs font-medium text-slate-300 mb-1.5">
                اسم مستخدم البروكسي <span className="text-slate-500 font-normal">(اختياري)</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="proxy-username"
                  type="text"
                  value={proxyUsername}
                  onChange={(e) => setProxyUsername(e.target.value)}
                  placeholder="proxy_user"
                  dir="ltr"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg pr-9 pl-3 py-2.5 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="proxy-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                كلمة مرور البروكسي <span className="text-slate-500 font-normal">(اختياري)</span>
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="proxy-password"
                  type="text"
                  value={proxyPassword}
                  onChange={(e) => setProxyPassword(e.target.value)}
                  placeholder="••••••••"
                  dir="ltr"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg pr-9 pl-3 py-2.5 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Live Sub Link Preview */}
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/90 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>رابط الاشتراك (Sub Link):</span>
              {trimmedUsername && (
                <button
                  type="button"
                  onClick={handleCopyPreview}
                  className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 text-xs font-medium"
                >
                  {copiedPreview ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPreview ? 'تم النسخ' : 'نسخ الرابط'}</span>
                </button>
              )}
            </div>
            <div className="font-mono text-xs text-emerald-400 break-all select-all" dir="ltr">
              {previewUrl}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              {submitting
                ? 'جاري الحفظ...'
                : mode === 'add'
                ? 'إضافة العميل الآن'
                : 'حفظ التعديلات'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
