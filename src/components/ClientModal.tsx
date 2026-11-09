import React, { useState, useEffect } from 'react';
import { X, Calendar, Server, User, AlertCircle, Lock, KeyRound } from 'lucide-react';
import { ProxyClient, addDaysToDateString } from '../lib/supabase';

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
  defaultProxyHost = '72.195.34.58',
  defaultProxyPort = 4145,
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

    if (!proxyHost.trim()) {
      setError('يرجى إدخال عنوان IP البروكسي.');
      return;
    }

    const portNum = Number(proxyPort);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setError('منفذ البروكسي غير صالح.');
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
      setError(err.message || 'تعذر حفظ البيانات.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-[#0E131F] border border-slate-800/90 rounded-2xl shadow-2xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80">
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

        <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

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

          {/* Proxy IP & Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                IP البروكسي
              </label>
              <div className="relative">
                <Server className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={proxyHost}
                  onChange={(e) => setProxyHost(e.target.value)}
                  placeholder="185.190.140.20"
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
                placeholder="4145"
                dir="ltr"
                className="w-full bg-[#070A10] border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-sm font-mono tabular-nums text-white placeholder-slate-600 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Proxy Username & Password */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                يوزر البروكسي
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={proxyUsername}
                  onChange={(e) => setProxyUsername(e.target.value)}
                  placeholder="اختياري"
                  dir="ltr"
                  className="w-full bg-[#070A10] border border-slate-800 focus:border-emerald-500 rounded-xl pr-9 pl-3 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                باسورد البروكسي
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
