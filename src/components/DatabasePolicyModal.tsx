import React, { useState } from 'react';
import { Database, Copy, Check, ExternalLink, X } from 'lucide-react';

interface DatabasePolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FULL_CRUD_SQL = `-- 1. إضافة أعمدة مصادقة البروكسي (proxy_username, proxy_password) وربط الـ IP
ALTER TABLE public.proxy_clients 
ADD COLUMN IF NOT EXISTS proxy_username TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS proxy_password TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS registered_ip TEXT DEFAULT NULL;

-- 2. تفعيل صلاحيات القراءة والكتابة والتعديل (CRUD) للوحة التحكم والـ API
DROP POLICY IF EXISTS "Allow public read on proxy_clients" ON public.proxy_clients;
DROP POLICY IF EXISTS "Allow full CRUD on proxy_clients" ON public.proxy_clients;

CREATE POLICY "Allow full CRUD on proxy_clients"
ON public.proxy_clients
FOR ALL
USING (true)
WITH CHECK (true);`;

export const DatabasePolicyModal: React.FC<DatabasePolicyModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(FULL_CRUD_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="db-policy-title"
    >
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5 text-emerald-400">
            <Database className="w-4 h-4" />
            <h2 id="db-policy-title" className="text-base font-bold text-slate-100">
              صلاحيات الكتابة والتعديل في Supabase (RLS Policy)
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
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            لكي تتمكن لوحة التحكم من تنفيذ عمليات <strong>الإضافة، التعديل، والحذف</strong> مباشرة على جدول{' '}
            <code className="font-mono text-emerald-400">proxy_clients</code> باستخدام المفتاح المعلن، انسخ أمر الـ SQL التالي ونفذه مرة واحدة في{' '}
            <strong>Supabase SQL Editor</strong>:
          </p>

          <div className="rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900/50">
              <span className="text-xs font-mono text-slate-400" dir="ltr">
                supabase_crud_policy.sql
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors whitespace-nowrap"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'تم نسخ الكود' : 'نسخ كود SQL'}</span>
              </button>
            </div>
            <pre className="p-4 text-xs font-mono text-emerald-300 overflow-x-auto leading-relaxed" dir="ltr">
              {FULL_CRUD_SQL}
            </pre>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <a
              href="https://supabase.com/dashboard/project/cnjsrlfggdviuzpgpnso/sql/new"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <span>فتح محرر SQL في Supabase</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
