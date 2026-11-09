import React, { useState } from 'react';
import { X, Copy, Check, ShieldCheck, Share2, Smartphone, Lock } from 'lucide-react';
import { ProxyClient, HAPP_IOS_URL, HAPP_ANDROID_APK_URL, getClientStatusInfo } from '../lib/supabase';

interface QrCodeModalProps {
  client: ProxyClient | null;
  encryptedLink: string | null;
  loading: boolean;
  onClose: () => void;
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
    navigator.clipboard.writeText(encryptedLink);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyFullMessage = () => {
    if (!encryptedLink) return;
    const msg = [
      `🛡️ *VPN ALISHOP — تفعيل اشتراك شام كاش*`,
      `────────────────────`,
      `👤 المشترك: ${client.username}`,
      `📅 صالح لغاية: ${client.expiry_date} (${statusInfo.daysText})`,
      `🔒 الحماية: مشفر ومرتبط بجهاز واحد فقط`,
      ``,
      `1️⃣ *حمّل تطبيق Happ الرسمي (مجاني وبدون إعلانات):*`,
      `🍏 للآيفون (App Store):`,
      HAPP_IOS_URL,
      ``,
      `🤖 للأندرويد (تحميل مباشر APK):`,
      HAPP_ANDROID_APK_URL,
      ``,
      `2️⃣ *طريقة التفعيل:*`,
      `انسخ الكود المشفر بالأسفل، ثم افتح تطبيق Happ واضغط على علامة (+) في الأعلى واختر (Paste from Clipboard / لصق من الحافظة):`,
      ``,
      encryptedLink,
    ].join('\n');

    navigator.clipboard.writeText(msg);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2200);
  };

  const qrImageUrl = encryptedLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(
        encryptedLink
      )}`
    : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold text-white">
                بطاقة تفعيل المشترك · VPN ALISHOP
              </h2>
              <p className="text-[11px] text-slate-400 font-mono" dir="ltr">
                {client.username}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* QR Code Box */}
          <div className="flex flex-col items-center justify-center p-5 rounded-xl bg-slate-950 border border-slate-800">
            {loading || !encryptedLink ? (
              <div className="w-52 h-52 flex flex-col items-center justify-center gap-3 text-slate-400">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">جاري توليد التشفير وباركود Happ...</span>
              </div>
            ) : (
              <>
                <div className="bg-white p-3 rounded-xl shadow-md">
                  <img
                    src={qrImageUrl}
                    alt={`QR Code for ${client.username}`}
                    className="w-48 h-48 object-contain"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-3 text-center">
                  يمسح العميل هذا الرمز من داخل تطبيق <strong className="text-white">Happ</strong> (خيار Scan QR Code) للتفعيل الفوري بدون كشف بيانات البروكسي.
                </p>
              </>
            )}
          </div>

          {/* Client Metadata Summary */}
          <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
            <div>
              <span className="text-slate-500 block">تاريخ الانتهاء</span>
              <span className="font-mono tabular-nums text-slate-200 font-semibold mt-0.5 block" dir="ltr">
                {client.expiry_date}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">قفل الجهاز (HWID)</span>
              <span className="font-mono text-sky-400 font-medium mt-0.5 block truncate" dir="ltr">
                {client.registered_ip || 'جاهز للربط بأول جهاز'}
              </span>
            </div>
          </div>

          {/* Encrypted Code Preview */}
          {encryptedLink && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>الكود المشفر (happ://crypt5):</span>
                </span>
              </div>
              <div
                className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-400 truncate select-all"
                dir="ltr"
              >
                {encryptedLink}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              disabled={loading || !encryptedLink}
              onClick={handleCopyFullMessage}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors border ${
                copiedMsg
                  ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                  : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
              }`}
            >
              {copiedMsg ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>تم نسخ رسالة التفعيل الكاملة للواتساب</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  <span>نسخ رسالة التفعيل الكاملة (الروابط + الكود المشفر)</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={loading || !encryptedLink}
              onClick={handleCopyCode}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors border ${
                copiedCode
                  ? 'bg-sky-950 border-sky-600 text-sky-300'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
            >
              {copiedCode ? (
                <>
                  <Check className="w-4 h-4 text-sky-400" />
                  <span>تم نسخ الكود المشفر فقط</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-400" />
                  <span>نسخ الكود المشفر فقط (happ://crypt5)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
