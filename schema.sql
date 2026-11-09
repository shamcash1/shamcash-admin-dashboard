-- ============================================================
-- Sham Cash Proxy System - Supabase SQL Schema, Auth & IP Binding
-- كود إنشاء وتحديث جدول proxy_clients لدعم مصادقة البروكسي وربط الجهاز
-- ============================================================

-- 1. إنشاء جدول proxy_clients (إذا لم يكن موجوداً)
CREATE TABLE IF NOT EXISTS public.proxy_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expiry_date DATE NOT NULL,
    proxy_host TEXT NOT NULL,
    proxy_port INTEGER NOT NULL,
    proxy_username TEXT DEFAULT NULL,
    proxy_password TEXT DEFAULT NULL,
    registered_ip TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. إضافة أعمدة مصادقة البروكسي وعمود الـ IP المسجل للجدول الحالي
ALTER TABLE public.proxy_clients
ADD COLUMN IF NOT EXISTS proxy_username TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS proxy_password TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS registered_ip TEXT DEFAULT NULL;

-- 3. إنشاء مؤشر فهرسة للبحث السريع بواسطة اسم المستخدم (username)
CREATE INDEX IF NOT EXISTS idx_proxy_clients_username ON public.proxy_clients (username);

-- 4. تفعيل نظام حماية السجلات (Row Level Security - RLS)
ALTER TABLE public.proxy_clients ENABLE ROW LEVEL SECURITY;

-- 5. تفعيل صلاحيات القراءة والكتابة الكاملة (SELECT, INSERT, UPDATE, DELETE) للوحة التحكم والـ API
DROP POLICY IF EXISTS "Allow public read on proxy_clients" ON public.proxy_clients;
DROP POLICY IF EXISTS "Allow full CRUD on proxy_clients" ON public.proxy_clients;

CREATE POLICY "Allow full CRUD on proxy_clients" 
ON public.proxy_clients 
FOR ALL 
USING (true)
WITH CHECK (true);
