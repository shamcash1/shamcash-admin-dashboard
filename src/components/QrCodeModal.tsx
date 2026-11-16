import React, { useState } from 'react';
import { X, Copy, Check, ShieldCheck, Smartphone, Download, Share2 } from 'lucide-react';
import {
  ProxyClient,
  getClientStatusInfo,
  formatDataMb,
  buildCustomerActivationMessage,
  getQrCodeImageUrl,
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

/**
 * Shares both the QR Code PNG image file AND the subscription text message via Web Share API
 * (WhatsApp, Telegram, etc.), while also copying the message to clipboard for convenience.
 */
export async function shareQrAndMessage(
  client: ProxyClient,
  encryptedLink: string,
  platform: 'android' | 'ios'
): Promise<'shared_with_qr' | 'shared_text' | 'copied_only'> {
  const message = buildCustomerActivationMessage(client, encryptedLink, platform);
  // Always copy text to clipboard first so it's ready even if target app ignores caption
  copyToClipboardSync(message);

  const qrUrl = getQrCodeImageUrl(encryptedLink, 600);

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const response = await fetch(qrUrl);
      if (response.ok) {
        const blob = await response.blob();
        const qrFile = new File([blob], `${client.username}-qr.png`, { type: 'image/png' });

        if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [qrFile] })) {
          await navigator.share({
            title: `اشتراك VPN ALISHOP - ${client.username}`,
            text: message,
            files: [qrFile],
          });
          return 'shared_with_qr';
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return 'copied_only';
      }
      // fallback to text share below
    }

    try {
      await navigator.share({
        title: `اشتراك VPN ALISHOP - ${client.username}`,
        text: message,
      });
      return 'shared_text';
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return 'copied_only';
      }
    }
  }

  // Fallback for desktop browsers without Web Share API: download QR PNG and copy message
  try {
    const response = await fetch(qrUrl);
    if (response.ok) {
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${client.username}-qr.png`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    }
  } catch {
    // ignore download error
  }

  return 'copied_only';
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({
  client,
  encryptedLink,
  loading,
  onClose,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [sharingPlatform, setSharingPlatform] = useState<'android' | 'ios' | null>(null);
  const [sharedPlatform, setSharedPlatform] = useState<'android' | 'ios' | null>(null);

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

  const handleSharePlatform = async (platform: 'android' | 'ios') => {
    if (!encryptedLink || sharingPlatform) return;
    setSharingPlatform(platform);
    try {
      await shareQrAndMessage(client, encryptedLink, platform);
      setSharedPlatform(platform);
      setTimeout(() => setSharedPlatform(null), 2500);
    } finally {
      setSharingPlatform(null);
    }
  };

  const qrImageUrl = encryptedLink ? getQrCodeImageUrl(encryptedLink, 240) : '';

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

          {/* Share QR + Message Buttons */}
          <div className="space-y-1.5">
            <div className="text-[11px] text-slate-400 font-medium text-center">
              مشاركة صورة الـ QR Code + رسالة الاشتراك مباشرة:
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={loading || !encryptedLink || sharingPlatform !== null}
                onClick={() => handleSharePlatform('android')}
                className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${
                  sharedPlatform === 'android'
                    ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                    : 'bg-[#070A10] hover:bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                {sharedPlatform === 'android' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>
                  {sharingPlatform === 'android'
                    ? 'جاري التجهيز...'
                    : sharedPlatform === 'android'
                    ? 'تمت المشاركة'
                    : 'مشاركة (أندرويد)'}
                </span>
              </button>

              <button
                type="button"
                disabled={loading || !encryptedLink || sharingPlatform !== null}
                onClick={() => handleSharePlatform('ios')}
                className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${
                  sharedPlatform === 'ios'
                    ? 'bg-sky-950 border-sky-600 text-sky-300'
                    : 'bg-[#070A10] hover:bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                {sharedPlatform === 'ios' ? (
                  <Check className="w-3.5 h-3.5 text-sky-400" />
                ) : (
                  <Share2 className="w-3.5 h-3.5 text-sky-400" />
                )}
                <span>
                  {sharingPlatform === 'ios'
                    ? 'جاري التجهيز...'
                    : sharedPlatform === 'ios'
                    ? 'تمت المشاركة'
                    : 'مشاركة (آيفون)'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
