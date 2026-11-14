import React, { useState } from 'react';
import { X, Copy, Check, ShieldCheck, Smartphone, Download } from 'lucide-react';
import {
  ProxyClient,
  getClientStatusInfo,
  formatDataMb,
  buildCustomerActivationMessage,
} from '../lib/supabase';

interface QrCodeModalProps {
  client: ProxyClient | null;
  encryptedLink: string | null;
  loading: boolean;
  onClose: () => void;
}

export function copyToClipboardSync(text: string): boolean {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textArea);
    return ok;
  } catch {
    return false;
  }
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({
  client,
  encryptedLink,
  loading,
  onClose,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedAndroidMsg, setCopiedAndroidMsg] = useState(false);
  const [copiedIosMsg, setCopiedIosMsg] = useState(false);

  if (!client) return null;

  const statusInfo = getClientStatusInfo(client);
  const quotaMb = client.quota_mb && client.quota_mb > 0 ? client.quota_mb : 500;
  const usedMb = client.used_mb && client.used_mb >= 0 ? client.used_mb : 0;

  const handleCopyCode = () => {
    if (!encryptedLink) return;
    copyToClipboardSync(encryptedLink);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyPlatformMessage = (platform: 'android' | 'ios') => {
    if (!encryptedLink) return;
    const msg = buildCustomerActivationMessage(client, encryptedLink, platform);
    copyToClipboardSync(msg);
    if (platform === 'android') {
      setCopiedAndroidMsg(true);
      setTimeout(() => setCopiedAndroidMsg(false), 2200);
    } else {
      setCopiedIosMsg(true);
      setTimeout(() => setCopiedIosMsg(false), 2200);
    }
  };

  const qrImageUrl = encryptedLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(
        encryptedLink
      )}`
    : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm bg-[#0E131F] border border-slate-800/90 rounded-2xl shadow-2xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold text-white font-mono" dir="ltr">
              {client.username}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-[#070A10] border border-slate-800/80">
            {loading || !encryptedLink ? (
              <div className="w-48 h-48 flex items-center justify-center">
                <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="bg-white p-2.5 rounded-xl">
                <img
                  src={qrImageUrl}
                  alt={client.username}
                  className="w-44 h-44 object-contain"
                />
              </div>
            )}
          </div>

          {encryptedLink && (
            <input
              type="text"
              readOnly
              value={encryptedLink}
              onFocus={(e) => e.target.select()}
              dir="ltr"
              className="w-full bg-[#070A10] border border-slate-800 rounded-xl px-3 py-2 text-[11px] font-mono text-emerald-400 select-all focus:outline-none"
            />
          )}

          <div className="bg-[#070A10] border border-slate-800/80 rounded-xl p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{statusInfo.daysText}</span>
              <span className="font-mono tabular-nums text-slate-200" dir="ltr">
                {client.expiry_date}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
              <span className="text-slate-400">الباقة المخصصة:</span>
              <span className="font-mono tabular-nums text-emerald-400 font-semibold" dir="ltr">
                {formatDataMb(usedMb)} / {formatDataMb(quotaMb)}
              </span>
            </div>
          </div>

          {/* Copy Encrypted Code Button */}
          <button
            type="button"
            disabled={loading || !encryptedLink}
            onClick={handleCopyCode}
            className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${
              copiedCode
                ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
            }`}
          >
            {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCode ? 'تم نسخ الكود المشفر' : 'نسخ كود Happ المشفر فقط'}</span>
          </button>

          {/* Platform-Specific Message Buttons */}
          <div className="space-y-1.5">
            <div className="text-[11px] text-slate-400 font-medium text-center">
              نسخ رسالة التفعيل حسب نوع جهاز المشترك:
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={loading || !encryptedLink}
                onClick={() => handleCopyPlatformMessage('android')}
                className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${
                  copiedAndroidMsg
                    ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                    : 'bg-[#070A10] hover:bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                {copiedAndroidMsg ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>{copiedAndroidMsg ? 'تم نسخ أندرويد' : 'رسالة أندرويد'}</span>
              </button>

              <button
                type="button"
                disabled={loading || !encryptedLink}
                onClick={() => handleCopyPlatformMessage('ios')}
                className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${
                  copiedIosMsg
                    ? 'bg-sky-950 border-sky-600 text-sky-300'
                    : 'bg-[#070A10] hover:bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                {copiedIosMsg ? (
                  <Check className="w-3.5 h-3.5 text-sky-400" />
                ) : (
                  <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                )}
                <span>{copiedIosMsg ? 'تم نسخ آيفون' : 'رسالة آيفون'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
