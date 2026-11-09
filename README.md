# Sham Cash Admin Dashboard | لوحة إدارة مشتركي البروكسي

لوحة تحكم حديثة ومتجاوبة مبنية باستخدام **React**، **Vite**، و **Tailwind CSS** لإدارة اشتراكات عملاء خدمة بروكسي تطبيق شام كاش عبر قاعدة بيانات **Supabase**.

---

## المميزات الأساسية

- **عرض شامل للمشتركين**: جدول احترافي يعرض (اسم المستخدم، الحالة، تاريخ الانتهاء، IP البروكسي، منفذ البروكسي، رابط العميل، الإجراءات).
- **إضافة وتعديل وحذف العملاء**: نافذة منبثقة لإضافة عميل جديد أو تعديل بياناته (تغيير تاريخ الانتهاء، تبديل عنوان الـ IP أو المنفذ، وتفعيل/إيقاف الحساب).
- **تمديد سريع للاشتراك**: زر `+30 يوم` لتجديد اشتراك العميل بضغطة واحدة.
- **توليد ونسخ رابط الـ PAC تلقائياً**: يولد الرابط بصيغة `https://shamcash-proxy-api.vercel.app/pac/{username}` مع زر نسخ فوري لإرساله للعميل.
- **تصميم متجاوب بالكامل (Responsive)**: يعمل بسلاسة على أجهزة الكمبيوتر، الأجهزة اللوحية (Tablets)، والهواتف الذكية.

---

## تفعيل صلاحيات الإضافة والتعديل والحذف في Supabase (SQL)

لتتمكن لوحة التحكم من تنفيذ عمليات الإضافة والتعديل والحذف مباشرة على جدول `proxy_clients`، نفذ الكود التالي في **SQL Editor** داخل لوحة تحكم Supabase:

```sql
DROP POLICY IF EXISTS "Allow public read on proxy_clients" ON public.proxy_clients;
DROP POLICY IF EXISTS "Allow full CRUD on proxy_clients" ON public.proxy_clients;

CREATE POLICY "Allow full CRUD on proxy_clients" 
ON public.proxy_clients 
FOR ALL 
USING (true)
WITH CHECK (true);
```

---

## التشغيل المحلي والبناء

```bash
npm install
npm run dev
npm run build
```
