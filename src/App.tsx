import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Search,
  Copy,
  Check,
  Edit3,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Clock,
  PauseCircle,
  Power,
  Database,
  CalendarPlus,
  AlertTriangle,
  RotateCcw,
  Lock,
  ShieldCheck,
  Share2,
} from 'lucide-react';
import {
  supabase,
  ProxyClient,
  ClientComputedStatus,
  getClientPacUrl,
  getClientStatusInfo,
  addDaysToDateString,
  fetchHappEncryptedLink,
  HAPP_IOS_URL,
  HAPP_ANDROID_APK_URL,
} from './lib/supabase';
import { ClientModal } from './components/ClientModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { DatabasePolicyModal } from './components/DatabasePolicyModal';

const LOCAL_DELTA_STORAGE_KEY = 'shamcash_admin_local_delta_v1';

interface LocalDeltaState {
  upserted: Record<string, ProxyClient>;
  deletedIds: string[];
}

function loadLocalDelta(): LocalDeltaState {
  try {
    const raw = localStorage.getItem(LOCAL_DELTA_STORAGE_KEY);
    if (!raw) return { upserted: {}, deletedIds: [] };
    return JSON.parse(raw);
  } catch {
    return { upserted: {}, deletedIds: [] };
  }
}

function saveLocalDelta(delta: LocalDeltaState) {
  try {
    localStorage.setItem(LOCAL_DELTA_STORAGE_KEY, JSON.stringify(delta));
  } catch {
    // ignore storage errors
  }
}

export default function App() {
  const [remoteClients, setRemoteClients] = useState<ProxyClient[]>([]);
  const [localDelta, setLocalDelta] = useState<LocalDeltaState>(() => loadLocalDelta());
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | ClientComputedStatus>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedHappId, setCopiedHappId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [encryptingId, setEncryptingId] = useState<string | null>(null);
  const [happCache, setHappCache] = useState<Record<string, string>>({});
  const [rlsWriteNotice, setRlsWriteNotice] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals state
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingClient, setEditingClient] = useState<ProxyClient | null>(null);
  const [deletingClient, setDeletingClient] = useState<ProxyClient | null>(null);
  const [dbPolicyModalOpen, setDbPolicyModalOpen] = useState<boolean>(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3400);
  }, []);

  const fetchClients = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setRefreshing(true);

    try {
      const { data, error } = await supabase
        .from('proxy_clients')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase fetch error:', error.message);
      } else if (data) {
        setRemoteClients(data as ProxyClient[]);
      }
    } catch (err) {
      console.error('Unexpected fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Merge remote Supabase records with any local pending writes (if RLS blocked direct DB write)
  const clients = useMemo(() => {
    const map = new Map<string, ProxyClient>();
    for (const c of remoteClients) {
      if (!localDelta.deletedIds.includes(c.id)) {
        map.set(c.id, c);
      }
    }
    for (const [id, c] of Object.entries(localDelta.upserted)) {
      if (!localDelta.deletedIds.includes(id)) {
        map.set(id, c);
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [remoteClients, localDelta]);

  // Compute summary metrics
  const stats = useMemo(() => {
    let activeCount = 0;
    let expiredCount = 0;
    let inactiveCount = 0;

    for (const client of clients) {
      const info = getClientStatusInfo(client);
      if (info.status === 'active') activeCount++;
      else if (info.status === 'expired') expiredCount++;
      else inactiveCount++;
    }

    return {
      total: clients.length,
      active: activeCount,
      expired: expiredCount,
      inactive: inactiveCount,
    };
  }, [clients]);

  // Filtered clients list
  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const info = getClientStatusInfo(client);
      if (statusFilter !== 'all' && info.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.trim().toLowerCase();
        const matchUser = client.username.toLowerCase().includes(q);
        const matchIp = client.proxy_host.toLowerCase().includes(q);
        const matchPort = String(client.proxy_port).includes(q);
        const matchRegIp = client.registered_ip ? client.registered_ip.toLowerCase().includes(q) : false;
        return matchUser || matchIp || matchPort || matchRegIp;
      }
      return true;
    });
  }, [clients, statusFilter, searchQuery]);

  // Copy raw Sub URL handler
  const handleCopyPacUrl = (client: ProxyClient) => {
    const url = getClientPacUrl(client.username);
    navigator.clipboard.writeText(url);
    setCopiedId(client.id);
    showToast(`تم نسخ الرابط المباشر للعميل ${client.username}`);
    setTimeout(() => {
      setCopiedId((prev) => (prev === client.id ? null : prev));
    }, 2000);
  };

  // Copy Encrypted Happ Code (happ://crypt5/...) handler
  const handleCopyHappCode = async (client: ProxyClient) => {
    try {
      setEncryptingId(client.id);
      let encrypted = happCache[client.username];
      if (!encrypted) {
        encrypted = await fetchHappEncryptedLink(client.username);
        setHappCache((prev) => ({ ...prev, [client.username]: encrypted }));
      }
      await navigator.clipboard.writeText(encrypted);
      setCopiedHappId(client.id);
      showToast(`تم نسخ كود Happ المشفر (${client.username}) — بيانات البروكسي مخفية 100%`);
      setTimeout(() => {
        setCopiedHappId((prev) => (prev === client.id ? null : prev));
      }, 2500);
    } catch (err) {
      console.error('Error generating Happ encrypted link:', err);
      showToast('تعذر توليد الكود المشفر حالياً، يرجى المحاولة مرة أخرى');
    } finally {
      setEncryptingId(null);
    }
  };

  // Copy Full Ready-to-Send Customer WhatsApp Message (App Links + Encrypted Code)
  const handleCopyCustomerMessage = async (client: ProxyClient) => {
    try {
      setEncryptingId(client.id);
      let encrypted = happCache[client.username];
      if (!encrypted) {
        encrypted = await fetchHappEncryptedLink(client.username);
        setHappCache((prev) => ({ ...prev, [client.username]: encrypted }));
      }
      const message = [
        `مرحباً بك، تم تفعيل اشتراكك لتشغيل تطبيق شام كاش (${client.username}) بنجاح ✅`,
        `تاريخ انتهاء الاشتراك: ${client.expiry_date}`,
        ``,
        `1️⃣ حمّل تطبيق Happ الرسمي (مجاني وبدون إعلانات):`,
        `• للآيفون (App Store):`,
        HAPP_IOS_URL,
        `• للأندرويد (تحميل مباشر APK):`,
        HAPP_ANDROID_APK_URL,
        ``,
        `2️⃣ انسخ كود التفعيل المشفر التالي، وافتح تطبيق Happ واضغط على علامة (+) ثم (إضافة من الحافظة / Paste from Clipboard):`,
        encrypted,
      ].join('\n');

      await navigator.clipboard.writeText(message);
      setCopiedMsgId(client.id);
      showToast(`تم نسخ رسالة التفعيل الكاملة مع كود Happ للعميل ${client.username}`);
      setTimeout(() => {
        setCopiedMsgId((prev) => (prev === client.id ? null : prev));
      }, 2500);
    } catch (err) {
      console.error('Error generating customer message:', err);
      showToast('تعذر تجهيز الرسالة المشفرة حالياً');
    } finally {
      setEncryptingId(null);
    }
  };

  // Add or Edit Client handler
  const handleSaveClient = async (
    clientData: Omit<ProxyClient, 'id' | 'created_at' | 'updated_at'>,
    id?: string
  ) => {
    if (modalMode === 'add') {
      const { data, error } = await supabase
        .from('proxy_clients')
        .insert([{ ...clientData, registered_ip: null }])
        .select();

      if (!error && data && data.length > 0) {
        const created = data[0] as ProxyClient;
        setRemoteClients((prev) => [created, ...prev]);
        showToast(`تمت إضافة العميل ${created.username} بنجاح`);
        return;
      }

      // Fallback if RLS policy blocks insert
      setRlsWriteNotice(true);
      const fallbackClient: ProxyClient = {
        id: crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}`,
        ...clientData,
        registered_ip: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const nextDelta: LocalDeltaState = {
        ...localDelta,
        upserted: { ...localDelta.upserted, [fallbackClient.id]: fallbackClient },
      };
      setLocalDelta(nextDelta);
      saveLocalDelta(nextDelta);
      showToast(`تمت إضافة العميل ${fallbackClient.username}`);
    } else if (modalMode === 'edit' && id) {
      const { data, error } = await supabase
        .from('proxy_clients')
        .update({
          ...clientData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select();

      if (!error && data && data.length > 0) {
        const updated = data[0] as ProxyClient;
        setRemoteClients((prev) => prev.map((c) => (c.id === id ? updated : c)));
        if (localDelta.upserted[id]) {
          const nextUpserted = { ...localDelta.upserted };
          delete nextUpserted[id];
          const nextDelta = { ...localDelta, upserted: nextUpserted };
          setLocalDelta(nextDelta);
          saveLocalDelta(nextDelta);
        }
        showToast(`تم تحديث بيانات العميل ${updated.username}`);
        return;
      }

      // Fallback if RLS policy blocks update
      setRlsWriteNotice(true);
      const existing = clients.find((c) => c.id === id);
      const updatedFallback: ProxyClient = {
        id,
        ...clientData,
        registered_ip: existing?.registered_ip ?? null,
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const nextDelta: LocalDeltaState = {
        ...localDelta,
        upserted: { ...localDelta.upserted, [id]: updatedFallback },
      };
      setLocalDelta(nextDelta);
      saveLocalDelta(nextDelta);
      showToast(`تم تحديث بيانات العميل ${updatedFallback.username}`);
    }
  };

  // Reset Device (clear registered_ip to NULL)
  const handleResetDevice = async (client: ProxyClient) => {
    const { data, error } = await supabase
      .from('proxy_clients')
      .update({
        registered_ip: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', client.id)
      .select();

    if (!error && data && data.length > 0) {
      const updated = data[0] as ProxyClient;
      setRemoteClients((prev) => prev.map((c) => (c.id === client.id ? updated : c)));
      if (localDelta.upserted[client.id]) {
        const nextUpserted = { ...localDelta.upserted };
        delete nextUpserted[client.id];
        const nextDelta = { ...localDelta, upserted: nextUpserted };
        setLocalDelta(nextDelta);
        saveLocalDelta(nextDelta);
      }
      showToast(`تمت إعادة تعيين الجهاز (فك القفل) للعميل ${client.username}`);
      return;
    }

    setRlsWriteNotice(true);
    const updatedFallback: ProxyClient = {
      ...client,
      registered_ip: null,
      updated_at: new Date().toISOString(),
    };
    const nextDelta: LocalDeltaState = {
      ...localDelta,
      upserted: { ...localDelta.upserted, [client.id]: updatedFallback },
    };
    setLocalDelta(nextDelta);
    saveLocalDelta(nextDelta);
    showToast(`تمت إعادة تعيين الجهاز للعميل ${client.username}`);
  };

  // Quick toggle active status
  const handleToggleActive = async (client: ProxyClient) => {
    const nextActive = !client.is_active;
    const { data, error } = await supabase
      .from('proxy_clients')
      .update({ is_active: nextActive, updated_at: new Date().toISOString() })
      .eq('id', client.id)
      .select();

    if (!error && data && data.length > 0) {
      const updated = data[0] as ProxyClient;
      setRemoteClients((prev) => prev.map((c) => (c.id === client.id ? updated : c)));
      showToast(
        nextActive
          ? `تم تفعيل حساب العميل ${client.username}`
          : `تم إيقاف حساب العميل ${client.username}`
      );
      return;
    }

    setRlsWriteNotice(true);
    const updatedFallback: ProxyClient = {
      ...client,
      is_active: nextActive,
      updated_at: new Date().toISOString(),
    };
    const nextDelta: LocalDeltaState = {
      ...localDelta,
      upserted: { ...localDelta.upserted, [client.id]: updatedFallback },
    };
    setLocalDelta(nextDelta);
    saveLocalDelta(nextDelta);
    showToast(
      nextActive
        ? `تم تفعيل حساب العميل ${client.username}`
        : `تم إيقاف حساب العميل ${client.username}`
    );
  };

  // Quick +30 days extension
  const handleQuickExtend30Days = async (client: ProxyClient) => {
    const newExpiry = addDaysToDateString(client.expiry_date, 30);
    const { data, error } = await supabase
      .from('proxy_clients')
      .update({
        expiry_date: newExpiry,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', client.id)
      .select();

    if (!error && data && data.length > 0) {
      const updated = data[0] as ProxyClient;
      setRemoteClients((prev) => prev.map((c) => (c.id === client.id ? updated : c)));
      showToast(`تم تمديد اشتراك ${client.username} لمدة 30 يوماً`);
      return;
    }

    setRlsWriteNotice(true);
    const updatedFallback: ProxyClient = {
      ...client,
      expiry_date: newExpiry,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    const nextDelta: LocalDeltaState = {
      ...localDelta,
      upserted: { ...localDelta.upserted, [client.id]: updatedFallback },
    };
    setLocalDelta(nextDelta);
    saveLocalDelta(nextDelta);
    showToast(`تم تمديد اشتراك ${client.username} لمدة 30 يوماً`);
  };

  // Delete Client handler
  const handleDeleteClient = async (client: ProxyClient) => {
    const { data, error } = await supabase
      .from('proxy_clients')
      .delete()
      .eq('id', client.id)
      .select();

    if (!error && data && data.length > 0) {
      setRemoteClients((prev) => prev.filter((c) => c.id !== client.id));
      showToast(`تم حذف العميل ${client.username}`);
      return;
    }

    setRlsWriteNotice(true);
    const nextUpserted = { ...localDelta.upserted };
    delete nextUpserted[client.id];
    const nextDelta: LocalDeltaState = {
      upserted: nextUpserted,
      deletedIds: [...localDelta.deletedIds, client.id],
    };
    setLocalDelta(nextDelta);
    saveLocalDelta(nextDelta);
    showToast(`تم حذف العميل ${client.username}`);
  };

  const openAddModal = () => {
    setModalMode('add');
    setEditingClient(null);
    setModalOpen(true);
  };

  const openEditModal = (client: ProxyClient) => {
    setModalMode('edit');
    setEditingClient(client);
    setModalOpen(true);
  };

  // Default IP/Port from existing clients for convenience
  const defaultHost = clients[0]?.proxy_host || '185.190.140.20';
  const defaultPort = clients[0]?.proxy_port || 4145;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col" dir="rtl">
      {/* Top Bar Contract: Strictly 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setStatusFilter('all');
            }}
            className="text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            شام كاش · إدارة البروكسي
          </a>

          {/* Zone 2: 4 concise single-line text navigation links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-400">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                statusFilter === 'all'
                  ? 'text-white border-emerald-500'
                  : 'border-transparent hover:text-slate-200'
              }`}
            >
              جميع العملاء
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                statusFilter === 'active'
                  ? 'text-white border-emerald-500'
                  : 'border-transparent hover:text-slate-200'
              }`}
            >
              الحسابات النشطة
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('expired')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                statusFilter === 'expired'
                  ? 'text-white border-emerald-500'
                  : 'border-transparent hover:text-slate-200'
              }`}
            >
              منتهية الصلاحية
            </button>
            <button
              type="button"
              onClick={() => setDbPolicyModalOpen(true)}
              className="py-1 border-b-2 border-transparent hover:text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              صلاحيات قاعدة البيانات
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={openAddModal}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة عميل جديد</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Optional Notice if Supabase RLS blocked direct write */}
        {rlsWriteNotice && (
          <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 text-xs sm:text-sm text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                تم حفظ التعديلات في جلستك الحالية. لتفعيل الحفظ الدائم في جدول{' '}
                <code className="font-mono text-amber-300">proxy_clients</code> داخل Supabase، قم بتفعيل سياسة الكتابة (RLS Policy).
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDbPolicyModalOpen(true)}
              className="px-3.5 py-1.5 text-xs font-semibold text-amber-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              عرض كود تفعيل الصلاحيات (SQL)
            </button>
          </div>
        )}

        {/* Section Header + KPI Strip */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                إدارة اشتراكات عملاء البروكسي (نظام Happ المشفر)
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                توليد أكواد <code className="font-mono text-emerald-400">happ://crypt5</code> المشفرة لإخفاء بيانات البروكسي السوري 100% عن العميل، مع قفل الحساب تلقائياً على بصمة الهاتف (<code className="font-mono text-slate-300">X-HWID</code>).
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-400">
              <button
                type="button"
                onClick={() => setDbPolicyModalOpen(true)}
                className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors whitespace-nowrap"
              >
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span>صلاحيات SQL</span>
              </button>
              <button
                type="button"
                onClick={() => fetchClients(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
                <span>تحديث القائمة</span>
              </button>
            </div>
          </div>

          {/* 4-Column KPI Summary Grid (Single-Elevation, Tabular Numerals) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5">
              <div className="text-xs text-slate-400 font-medium">إجمالي العملاء المسجلين</div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-white">
                  {stats.total}
                </span>
                <span className="text-xs text-slate-500">حساب</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5">
              <div className="text-xs text-slate-400 font-medium">الاشتراكات النشطة والفعالة</div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-400">
                  {stats.active}
                </span>
                <span className="text-xs text-emerald-400/80">توجيه البروكسي مفعل</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5">
              <div className="text-xs text-slate-400 font-medium">اشتراكات منتهية الصلاحية</div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-amber-400">
                  {stats.expired}
                </span>
                <span className="text-xs text-amber-400/80">بانتظار التجديد</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5">
              <div className="text-xs text-slate-400 font-medium">حسابات موقوفة يدوياً</div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-rose-400">
                  {stats.inactive}
                </span>
                <span className="text-xs text-slate-500">مقطوع عن البروكسي</span>
              </div>
            </div>
          </div>
        </section>

        {/* Workspace Toolbar: Search & Segmented Status Filter */}
        <section className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث باسم المستخدم، بصمة الجهاز المسجلة، أو عنوان IP البروكسي السوري..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg pr-10 pl-4 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Interactive Filter Tabs (Segmented Control) */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg overflow-x-auto">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === 'all'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              الكل ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === 'active'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              نشط ({stats.active})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('expired')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === 'expired'
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-800/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              منتهي ({stats.expired})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === 'inactive'
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-800/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              موقوف ({stats.inactive})
            </button>
          </div>
        </section>

        {/* Data View: Loading / Empty / Populated */}
        {loading ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-12 bg-slate-800/50 animate-pulse rounded-lg border border-slate-800"
                />
              ))}
            </div>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-3">
            <div className="text-base font-bold text-slate-200">
              {searchQuery || statusFilter !== 'all'
                ? 'لا توجد نتائج مطابقة لعملية البحث أو التصفية'
                : 'لا يوجد عملاء مسجلون في قاعدة البيانات حالياً'}
            </div>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
              {searchQuery || statusFilter !== 'all'
                ? 'جرب تغيير كلمات البحث أو اختيار عرض جميع العملاء.'
                : 'ابدأ بإضافة أول عميل لتوليد كود Happ المشفر (happ://crypt5) الخاص به.'}
            </p>
            <div className="pt-2">
              {searchQuery || statusFilter !== 'all' ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  إعادة ضبط البحث
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openAddModal}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة عميل جديد</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* DESKTOP & TABLET DATA TABLE */}
            <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-xs font-semibold text-slate-400">
                      <th className="py-3.5 px-4 whitespace-nowrap">اسم المستخدم</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">الحالة</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">تاريخ الانتهاء</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">IP البروكسي</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">المنفذ</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">بصمة الجهاز / IP المسجل</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">كود Happ المشفر (مخفي البيانات)</th>
                      <th className="py-3.5 px-4 text-left whitespace-nowrap">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-sm">
                    {filteredClients.map((client) => {
                      const statusInfo = getClientStatusInfo(client);
                      const isCopied = copiedId === client.id;
                      const isHappCopied = copiedHappId === client.id;
                      const isMsgCopied = copiedMsgId === client.id;
                      const isEncrypting = encryptingId === client.id;
                      const boundDevice = client.registered_ip ? client.registered_ip.trim() : null;
                      const isHwid = boundDevice?.startsWith('HWID:');

                      return (
                        <tr
                          key={client.id}
                          className="hover:bg-slate-800/40 transition-colors group"
                        >
                          {/* 1. Username */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-mono font-semibold text-white" dir="ltr">
                              {client.username}
                            </div>
                          </td>

                          {/* 2. Status (Zero-pill discipline: semantic icon + explicit text + separator) */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {statusInfo.status === 'active' && (
                              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                <span>نشط</span>
                                <span aria-hidden="true" className="text-slate-600">·</span>
                                <span className="text-slate-400 font-normal">{statusInfo.daysText}</span>
                              </div>
                            )}
                            {statusInfo.status === 'expired' && (
                              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                <span>منتهي الصلاحية</span>
                                <span aria-hidden="true" className="text-slate-600">·</span>
                                <span className="text-slate-400 font-normal">{statusInfo.daysText}</span>
                              </div>
                            )}
                            {statusInfo.status === 'inactive' && (
                              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400">
                                <PauseCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>موقوف</span>
                                <span aria-hidden="true" className="text-slate-600">·</span>
                                <span className="text-slate-500 font-normal">معطل يدوياً</span>
                              </div>
                            )}
                          </td>

                          {/* 3. Expiry Date */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span
                                className="font-mono text-xs sm:text-sm tabular-nums text-slate-200"
                                dir="ltr"
                              >
                                {client.expiry_date}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleQuickExtend30Days(client)}
                                title="تمديد الاشتراك 30 يوماً إضافية"
                                className="px-2 py-0.5 text-[11px] font-medium bg-slate-800 hover:bg-emerald-950 hover:text-emerald-300 text-slate-400 rounded transition-colors flex items-center gap-1 whitespace-nowrap"
                              >
                                <CalendarPlus className="w-3 h-3" />
                                <span>+30 يوم</span>
                              </button>
                            </div>
                          </td>

                          {/* 4. Proxy IP & Auth Indicator */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs sm:text-sm tabular-nums text-slate-200" dir="ltr">
                                {client.proxy_host}
                              </span>
                              {client.proxy_username && client.proxy_password && (
                                <span
                                  title={`محمي بمصادقة (${client.proxy_username})`}
                                  className="inline-flex items-center gap-1 text-[11px] text-emerald-400"
                                >
                                  <Lock className="w-3 h-3 shrink-0" />
                                  <span>محمي</span>
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 5. Proxy Port */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-mono text-xs sm:text-sm tabular-nums text-slate-300" dir="ltr">
                              {client.proxy_port}
                            </span>
                          </td>

                          {/* 6. Registered Device (HWID or IP) */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {boundDevice ? (
                              <span
                                className="font-mono text-xs tabular-nums text-sky-400 font-medium inline-block max-w-[160px] truncate"
                                dir="ltr"
                                title={boundDevice}
                              >
                                {isHwid ? `🔒 ${boundDevice}` : boundDevice}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500">غير مرتبط بعد</span>
                            )}
                          </td>

                          {/* 7. Encrypted Happ Code + Customer Message Copy */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isEncrypting}
                                onClick={() => handleCopyHappCode(client)}
                                title="نسخ كود Happ المشفر (happ://crypt5) الذي يخفي الـ IP والباسورد"
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 border ${
                                  isHappCopied
                                    ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                                    : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
                                }`}
                              >
                                {isHappCopied ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>تم نسخ الكود المشفر</span>
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    <span>{isEncrypting ? 'جاري التشفير...' : 'نسخ كود Happ 🔒'}</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                disabled={isEncrypting}
                                onClick={() => handleCopyCustomerMessage(client)}
                                title="نسخ رسالة واتساب جاهزة للعميل تحتوي على روابط تحميل Happ + الكود المشفر"
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 border ${
                                  isMsgCopied
                                    ? 'bg-sky-950 border-sky-600 text-sky-300'
                                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                                }`}
                              >
                                {isMsgCopied ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-sky-400" />
                                    <span>تم نسخ الرسالة</span>
                                  </>
                                ) : (
                                  <>
                                    <Share2 className="w-3.5 h-3.5 text-sky-400" />
                                    <span>رسالة الزبون</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleCopyPacUrl(client)}
                                title="نسخ رابط الاشتراك العادي (Sub URL)"
                                className={`p-1.5 rounded-lg text-xs flex items-center justify-center transition-colors border ${
                                  isCopied
                                    ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                                    : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>

                          {/* 8. Actions */}
                          <td className="py-3 px-4 whitespace-nowrap text-left">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleResetDevice(client)}
                                title="إعادة تعيين الجهاز (فك الارتباط بجهاز العميل الحالي)"
                                className="px-2.5 py-1.5 rounded-lg bg-sky-950/50 hover:bg-sky-900/70 border border-sky-800/60 text-sky-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>إعادة تعيين الجهاز</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleActive(client)}
                                title={client.is_active ? 'إيقاف الحساب مؤقتاً' : 'تفعيل الحساب'}
                                className={`p-2 rounded-lg border transition-colors ${
                                  client.is_active
                                    ? 'bg-slate-950 border-slate-800 text-emerald-400 hover:bg-slate-800'
                                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-emerald-400 hover:bg-slate-800'
                                }`}
                                aria-label={client.is_active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => openEditModal(client)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>تعديل</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setDeletingClient(client)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-800/60 text-slate-400 hover:text-rose-300 text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>حذف</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* MOBILE & COMPACT VIEWPORT CARDS (md:hidden) */}
            <div className="md:hidden space-y-3">
              {filteredClients.map((client) => {
                const statusInfo = getClientStatusInfo(client);
                const isHappCopied = copiedHappId === client.id;
                const isMsgCopied = copiedMsgId === client.id;
                const isEncrypting = encryptingId === client.id;
                const boundDevice = client.registered_ip ? client.registered_ip.trim() : null;

                return (
                  <div
                    key={client.id}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3.5"
                  >
                    {/* Top Row: Username & Semantic Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono font-bold text-base text-white" dir="ltr">
                          {client.username}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs">
                          {statusInfo.status === 'active' && (
                            <span className="text-emerald-400 font-medium inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              نشط
                            </span>
                          )}
                          {statusInfo.status === 'expired' && (
                            <span className="text-amber-400 font-medium inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              منتهي الصلاحية
                            </span>
                          )}
                          {statusInfo.status === 'inactive' && (
                            <span className="text-rose-400 font-medium inline-flex items-center gap-1">
                              <PauseCircle className="w-3.5 h-3.5" />
                              موقوف
                            </span>
                          )}
                          <span aria-hidden="true" className="text-slate-600">·</span>
                          <span className="text-slate-400">{statusInfo.daysText}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleActive(client)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap ${
                          client.is_active
                            ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{client.is_active ? 'مفعل' : 'موقوف'}</span>
                      </button>
                    </div>

                    {/* Details Grid: Expiry, Proxy IP:Port, Registered Device */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs">
                      <div>
                        <span className="text-slate-500 block">تاريخ الانتهاء</span>
                        <span className="font-mono tabular-nums text-slate-200 mt-0.5 block" dir="ltr">
                          {client.expiry_date}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">البروكسي</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono tabular-nums text-slate-200" dir="ltr">
                            {client.proxy_host}:{client.proxy_port}
                          </span>
                          {client.proxy_username && client.proxy_password && (
                            <span title={`محمي بمصادقة (${client.proxy_username})`}>
                              <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500 block">الجهاز المسجل</span>
                        {boundDevice ? (
                          <span className="font-mono tabular-nums text-sky-400 mt-0.5 block truncate" dir="ltr">
                            {boundDevice}
                          </span>
                        ) : (
                          <span className="text-slate-500 mt-0.5 block">غير مرتبط بعد</span>
                        )}
                      </div>
                    </div>

                    {/* Encrypted Happ Code Box + One-Click Copy */}
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                      <div className="text-[11px] text-slate-400 flex items-center justify-between">
                        <span>تفعيل العميل في تطبيق Happ (بيانات مخفية 100%):</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={isEncrypting}
                          onClick={() => handleCopyHappCode(client)}
                          className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${
                            isHappCopied
                              ? 'bg-emerald-950 border-emerald-700 text-emerald-300'
                              : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
                          }`}
                        >
                          {isHappCopied ? (
                            <>
                              <Check className="w-4 h-4" />
                              <span>تم نسخ الكود</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-4 h-4" />
                              <span>{isEncrypting ? 'جاري التشفير...' : 'نسخ كود Happ 🔒'}</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={isEncrypting}
                          onClick={() => handleCopyCustomerMessage(client)}
                          className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${
                            isMsgCopied
                              ? 'bg-sky-950 border-sky-700 text-sky-300'
                              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                          }`}
                        >
                          {isMsgCopied ? (
                            <>
                              <Check className="w-4 h-4 text-sky-400" />
                              <span>تم نسخ الرسالة</span>
                            </>
                          ) : (
                            <>
                              <Share2 className="w-4 h-4 text-sky-400" />
                              <span>نسخ رسالة الزبون</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Bottom Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleResetDevice(client)}
                        className="w-full py-2 px-3 rounded-lg bg-sky-950/50 hover:bg-sky-900/70 border border-sky-800/60 text-sky-300 text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>إعادة تعيين الجهاز (فك القفل)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickExtend30Days(client)}
                        className="flex-1 py-2 px-3 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-emerald-400 text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                        <span>+30 يوم</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(client)}
                        className="flex-1 py-2 px-3 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>تعديل</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingClient(client)}
                        className="py-2 px-3 rounded-lg bg-slate-950 hover:bg-rose-950/60 border border-slate-800 text-rose-400 text-xs font-medium flex items-center justify-center gap-1 whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800/80 py-5 px-4 sm:px-6 text-xs text-slate-500">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>لوحة تحكم مشتركي بروكسي شام كاش · متصلة بقاعدة بيانات Supabase ونظام تشفير Happ</span>
          <span className="font-mono" dir="ltr">
            happ://crypt5/... · HWID Device Lock
          </span>
        </div>
      </footer>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 left-5 z-50 bg-slate-900 border border-emerald-600/50 text-slate-100 px-4 py-2.5 rounded-xl shadow-xl text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Add / Edit Client Modal */}
      <ClientModal
        isOpen={modalOpen}
        mode={modalMode}
        initialClient={editingClient}
        existingUsernames={clients.map((c) => c.username)}
        defaultProxyHost={defaultHost}
        defaultProxyPort={defaultPort}
        defaultProxyUsername={clients[0]?.proxy_username || ''}
        defaultProxyPassword={clients[0]?.proxy_password || ''}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSaveClient}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        client={deletingClient}
        onClose={() => setDeletingClient(null)}
        onConfirm={handleDeleteClient}
      />

      {/* Database RLS Policy Helper Modal */}
      <DatabasePolicyModal
        isOpen={dbPolicyModalOpen}
        onClose={() => setDbPolicyModalOpen(false)}
      />
    </div>
  );
}
