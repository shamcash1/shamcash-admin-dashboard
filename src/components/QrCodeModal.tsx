import React, { useState } from 'react';
import { X, Copy, Check, ShieldCheck, Share2 } from 'lucide-react';
import { ProxyClient, HAPP_IOS_URL, HAPP_ANDROID_APK_URL, getClientStatusInfo } from '../lib/supabase';

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
  const [copiedMsg, setCopiedMsg] = useState(false);

  if (!client) return null;

  const statusInfo = getClientStatusInfo(client);

  const handleCopyCode = () => {
    if (!encryptedLink) return;
    copyToClipboardSync(encryptedLink);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyFullMessage = () => {
    if (!encryptedLink) return;
    const msg = [
      `🛡️ *VPN ALISHOP*`,
      `👤 المشترك: ${client.username}`,
      `📅 الصلاحية: ${client.expiry_date} (${statusInfo.daysText})`,
      ``,
      `📲 *تحميل تطبيق Happ:*`,
      `• آيفون: ${HAPP_IOS_URL}`,
      `• أندرويد: ${HAPP_ANDROID_APK_URL}`,
      ``,
      `🔑 *كود التفعيل المشفر:*`,
      encryptedLink,
    ].join('\n');

    copyToClipboardSync(msg);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2200);
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

          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-slate-400">{statusInfo.daysText}</span>
            <span className="font-mono tabular-nums text-slate-200" dir="ltr">
              {client.expiry_date}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={loading || !encryptedLink}
              onClick={handleCopyCode}
              className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${
                copiedCode
                  ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                  : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
              }`}
            >
              {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'تم النسخ' : 'نسخ الكود'}</span>
            </button>

            <button
              type="button"
              disabled={loading || !encryptedLink}
              onClick={handleCopyFullMessage}
              className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${
                copiedMsg
                  ? 'bg-sky-950 border-sky-600 text-sky-300'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
            >
              {copiedMsg ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copiedMsg ? 'تم النسخ' : 'نسخ الرسالة'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
