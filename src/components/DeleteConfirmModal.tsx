import React, { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { ProxyClient } from '../lib/supabase';

interface DeleteConfirmModalProps {
  client: ProxyClient | null;
  onClose: () => void;
  onConfirm: (client: ProxyClient) => Promise<void>;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  client,
  onClose,
  onConfirm,
}) => {
  const [deleting, setDeleting] = useState(false);

  if (!client) return null;

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm(client);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5 text-rose-400">
            <Trash2 className="w-4 h-4" />
            <h2 id="delete-modal-title" className="text-base font-bold text-slate-100">
              تأكيد حذف العميل
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-300 leading-relaxed">
            هل أنت متأكد من رغبتك في حذف حساب العميل{' '}
            <span className="font-mono font-semibold text-white" dir="ltr">
              {client.username}
            </span>
            ؟ سيتوقف رابط الـ PAC الخاص به عن توجيه تطبيق شام كاش عبر البروكسي فوراً.
          </p>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>البروكسي المخصص:</span>
            <span className="font-mono tabular-nums text-slate-200" dir="ltr">
              {client.proxy_host}:{client.proxy_port}
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={deleting}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
            >
              تراجع
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={deleting}
              className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{deleting ? 'جاري الحذف...' : 'نعم، حذف العميل'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
