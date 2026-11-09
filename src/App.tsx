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
  CalendarPlus,
  RotateCcw,
  Lock,
  ShieldCheck,
  Share2,
  QrCode,
  Download,
  FileDown,
  Smartphone,
} from 'lucide-react';
import {
  supabase,
  ProxyClient,
  ClientComputedStatus,
  getClientStatusInfo,
  addDaysToDateString,
  fetchHappEncryptedLink,
  HAPP_IOS_URL,
  HAPP_ANDROID_APK_URL,
} from './lib/supabase';
import { ClientModal } from './components/ClientModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { QrCodeModal } from './components/QrCodeModal';

const LOCAL_DELTA_STORAGE_KEY = 'shamcash_admin_local_delta_v1';

type FilterTab = 'all' | ClientComputedStatus | 'expiring_soon';

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
  const [statusFilter, setStatusFilter] = useState<FilterTab>('all');
  const [copiedHappId, setCopiedHappId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [copiedAndroidApp, setCopiedAndroidApp] = useState<boolean>(false);
  const [copiedIosApp, setCopiedIosApp] = useState<boolean>(false);
  const [encryptingId, setEncryptingId] = useState<string | null>(null);
  const [happCache, setHappCache] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals state
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingClient, setEditingClient] = useState<ProxyClient | null>(null);
  const [deletingClient, setDeletingClient] = useState<ProxyClient | null>(null);
  const [qrClient, setQrClient] = useState<ProxyClient | null>(null);
  const [qrEncryptedLink, setQrEncryptedLink] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState<boolean>(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  const fetchClients = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setRefreshing(true);

    try {
      const { data, error } = await supabase
        .from('proxy_clients')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setRemoteClients(data as ProxyClient[]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

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

  const stats = useMemo(() => {
    let activeCount = 0;
    let expiredCount = 0;
    let inactiveCount = 0;
    let expiringSoonCount = 0;
    let boundDevicesCount = 0;

    for (const client of clients) {
      const info = getClientStatusInfo(client);
      if (info.status === 'active') {
        activeCount++;
        if (info.isExpiringSoon) expiringSoonCount++;
      } else if (info.status === 'expired') {
        expiredCount++;
      } else {
        inactiveCount++;
      }
      if (client.registered_ip && client.registered_ip.trim() !== '') {
        boundDevicesCount++;
      }
    }

    return {
      total: clients.length,
      active: activeCount,
      expired: expiredCount,
      inactive: inactiveCount,
      expiringSoon: expiringSoonCount,
      boundDevices: boundDevicesCount,
    };
  }, [clients]);

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const info = getClientStatusInfo(client);
      if (statusFilter === 'expiring_soon') {
        if (info.status !== 'active' || !info.isExpiringSoon) return false;
      } else if (statusFilter !== 'all' && info.status !== statusFilter) {
        return false;
      }

      if (searchQuery.trim() !== '') {
        const q = searchQuery.trim().toLowerCase();
        const matchUser = client.username.toLowerCase().includes(q);
        const matchIp = client.proxy_host.toLowerCase().includes(q);
        const matchPort = String(client.proxy_port).includes(q);
        const matchRegIp = client.registered_ip ? client.registered_ip.toLowerCase().includes(q) : false;
        const matchProxyUser = client.proxy_username
          ? client.proxy_username.toLowerCase().includes(q)
          : false;
        return matchUser || matchIp || matchPort || matchRegIp || matchProxyUser;
      }
      return true;
    });
  }, [clients, statusFilter, searchQuery]);

  // Direct Happ App Link Copy Handlers
  const handleCopyAndroidLink = () => {
    navigator.clipboard.writeText(HAPP_ANDROID_APK_URL);
    setCopiedAndroidApp(true);
    showToast('تم نسخ رابط تطبيق أندرويد (APK)');
    setTimeout(() => setCopiedAndroidApp(false), 2000);
  };

  const handleCopyIosLink = () => {
    navigator.clipboard.writeText(HAPP_IOS_URL);
    setCopiedIosApp(true);
    showToast('تم نسخ رابط تطبيق آيفون (App Store)');
    setTimeout(() => setCopiedIosApp(false), 2000);
  };

  // Export CSV Backup
  const handleExportCsv = () => {
    if (clients.length === 0) return;
    const headers = [
      'username',
      'is_active',
      'expiry_date',
      'proxy_host',
      'proxy_port',
      'proxy_username',
      'proxy_password',
      'registered_ip',
    ];
    const rows = clients.map((c) =>
      [
        c.username,
        c.is_active ? 'true' : 'false',
        c.expiry_date,
        c.proxy_host,
        c.proxy_port,
        c.proxy_username || '',
        c.proxy_password || '',
        c.registered_ip || '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vpn-alishop-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم تحميل ملف النسخة الاحتياطية (CSV)');
  };

  // Copy Encrypted Happ Code
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
      showToast(`تم نسخ الكود المشفر · ${client.username}`);
      setTimeout(() => {
        setCopiedHappId((prev) => (prev === client.id ? null : prev));
      }, 2200);
    } catch {
      showToast('تعذر توليد الكود المشفر حالياً');
    } finally {
      setEncryptingId(null);
    }
  };

  // Open QR Modal
  const handleOpenQrModal = async (client: ProxyClient) => {
    setQrClient(client);
    const cached = happCache[client.username];
    if (cached) {
      setQrEncryptedLink(cached);
      setQrLoading(false);
      return;
    }
    setQrEncryptedLink(null);
    setQrLoading(true);
    try {
      const encrypted = await fetchHappEncryptedLink(client.username);
      setHappCache((prev) => ({ ...prev, [client.username]: encrypted }));
      setQrEncryptedLink(encrypted);
    } catch {
      showToast('تعذر توليد الباركود حالياً');
    } finally {
      setQrLoading(false);
    }
  };

  // Copy Full Customer Message
  const handleCopyCustomerMessage = async (client: ProxyClient) => {
    try {
      setEncryptingId(client.id);
      let encrypted = happCache[client.username];
      if (!encrypted) {
        encrypted = await fetchHappEncryptedLink(client.username);
        setHappCache((prev) => ({ ...prev, [client.username]: encrypted }));
      }
      const statusInfo = getClientStatusInfo(client);
      const message = [
        `🛡️ *VPN ALISHOP*`,
        `👤 المشترك: ${client.username}`,
        `📅 الصلاحية: ${client.expiry_date} (${statusInfo.daysText})`,
        ``,
        `📲 *تحميل تطبيق Happ:*`,
        `• آيفون: ${HAPP_IOS_URL}`,
        `• أندرويد: ${HAPP_ANDROID_APK_URL}`,
        ``,
        `🔑 *كود التفعيل المشفر:*`,
        encrypted,
      ].join('\n');

      await navigator.clipboard.writeText(message);
      setCopiedMsgId(client.id);
      showToast(`تم نسخ رسالة التفعيل · ${client.username}`);
      setTimeout(() => {
        setCopiedMsgId((prev) => (prev === client.id ? null : prev));
      }, 2200);
    } catch {
      showToast('تعذر تجهيز الرسالة حالياً');
    } finally {
      setEncryptingId(null);
    }
  };

  // Save Client
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
        showToast(`تمت إضافة ${created.username}`);
        return;
      }

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
      showToast(`تمت إضافة ${fallbackClient.username}`);
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
        showToast(`تم تحديث ${updated.username}`);
        return;
      }

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
      showToast(`تم تحديث ${updatedFallback.username}`);
    }
  };

  // Reset Device
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
      showToast(`تم فك قفل الجهاز · ${client.username}`);
      return;
    }

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
    showToast(`تم فك قفل الجهاز · ${client.username}`);
  };

  // Toggle Active
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
      showToast(nextActive ? `تم تفعيل ${client.username}` : `تم إيقاف ${client.username}`);
      return;
    }

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
    showToast(nextActive ? `تم تفعيل ${client.username}` : `تم إيقاف ${client.username}`);
  };

  // Quick +30 days
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
      showToast(`تم تمديد ${client.username} (+30 يوم)`);
      return;
    }

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
    showToast(`تم تمديد ${client.username} (+30 يوم)`);
  };

  // Delete Client
  const handleDeleteClient = async (client: ProxyClient) => {
    const { data, error } = await supabase
      .from('proxy_clients')
      .delete()
      .eq('id', client.id)
      .select();

    if (!error && data && data.length > 0) {
      setRemoteClients((prev) => prev.filter((c) => c.id !== client.id));
      showToast(`تم حذف ${client.username}`);
      return;
    }

    const nextUpserted = { ...localDelta.upserted };
    delete nextUpserted[client.id];
    const nextDelta: LocalDeltaState = {
      upserted: nextUpserted,
      deletedIds: [...localDelta.deletedIds, client.id],
    };
    setLocalDelta(nextDelta);
    saveLocalDelta(nextDelta);
    showToast(`تم حذف ${client.username}`);
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

  const defaultHost = clients[0]?.proxy_host || '72.195.34.58';
  const defaultPort = clients[0]?.proxy_port || 4145;

  return (
    <div className="min-h-screen bg-[#070A10] text-slate-100 flex flex-col" dir="rtl">
      {/* Top Bar: Strictly 3 Clean Zones */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#070A10]/90 backdrop-blur-md">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Logo & Name */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setStatusFilter('all');
            }}
            className="flex items-center gap-3 whitespace-nowrap shrink-0"
          >
            <svg
              className="w-8 h-8 shrink-0"
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <rect
                x="1"
                y="1"
                width="38"
                height="38"
                rx="10"
                className="fill-emerald-950 stroke-emerald-500/50"
                strokeWidth="1.5"
              />
              <path
                d="M20 7L30 11.5V19.5C30 26.2 25.7 31.8 20 33.5C14.3 31.8 10 26.2 10 19.5V11.5L20 7Z"
                className="fill-emerald-500/20 stroke-emerald-400"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M16.5 23L20 14L23.5 23M17.8 20.5H22.2"
                className="stroke-white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-base sm:text-lg font-extrabold tracking-wider text-white font-mono">
              VPN ALISHOP
            </span>
          </a>

          {/* Zone 2: Direct Happ App Copy Buttons & Quick Tools */}
          <div className="hidden md:flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopyAndroidLink}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border whitespace-nowrap ${
                copiedAndroidApp
                  ? 'bg-emerald-950/90 border-emerald-600 text-emerald-300'
                  : 'bg-[#0E131F] hover:bg-slate-800/80 border-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              {copiedAndroidApp ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Download className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>{copiedAndroidApp ? 'تم نسخ أندرويد' : 'تطبيق أندرويد (Happ)'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyIosLink}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border whitespace-nowrap ${
                copiedIosApp
                  ? 'bg-sky-950/90 border-sky-600 text-sky-300'
                  : 'bg-[#0E131F] hover:bg-slate-800/80 border-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              {copiedIosApp ? (
                <Check className="w-3.5 h-3.5 text-sky-400" />
              ) : (
                <Smartphone className="w-3.5 h-3.5 text-sky-400" />
              )}
              <span>{copiedIosApp ? 'تم نسخ آيفون' : 'تطبيق آيفون (Happ)'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0E131F] hover:bg-slate-800/80 border border-slate-800 text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>تصدير CSV</span>
            </button>

            <button
              type="button"
              onClick={() => fetchClients(true)}
              disabled={refreshing}
              className="p-1.5 rounded-lg bg-[#0E131F] hover:bg-slate-800/80 border border-slate-800 text-slate-400 hover:text-white transition-colors"
              title="تحديث"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>

          {/* Zone 3: Primary CTA */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={openAddModal}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>مشترك جديد</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-[1380px] w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Mobile App Links Bar (Visible only on small screens) */}
        <div className="grid grid-cols-2 gap-2 md:hidden">
          <button
            type="button"
            onClick={handleCopyAndroidLink}
            className="py-2 px-3 rounded-xl text-xs font-medium bg-[#0E131F] border border-slate-800 text-slate-200 flex items-center justify-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>{copiedAndroidApp ? 'تم نسخ أندرويد' : 'نسخ تطبيق أندرويد'}</span>
          </button>
          <button
            type="button"
            onClick={handleCopyIosLink}
            className="py-2 px-3 rounded-xl text-xs font-medium bg-[#0E131F] border border-slate-800 text-slate-200 flex items-center justify-center gap-1.5"
          >
            <Smartphone className="w-3.5 h-3.5 text-sky-400" />
            <span>{copiedIosApp ? 'تم نسخ آيفون' : 'نسخ تطبيق آيفون'}</span>
          </button>
        </div>

        {/* 4 Clean KPI Cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-[#0E131F] border border-slate-800/80 rounded-2xl p-4 sm:p-5">
            <div className="text-xs text-slate-400 font-medium">إجمالي المشتركين</div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-white">
                {stats.total}
              </span>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                مرتبط: {stats.boundDevices}
              </span>
            </div>
          </div>

          <div className="bg-[#0E131F] border border-slate-800/80 rounded-2xl p-4 sm:p-5">
            <div className="text-xs text-slate-400 font-medium">الاشتراكات النشطة</div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-400">
                {stats.active}
              </span>
              <span className="text-xs text-emerald-500/80">فعال</span>
            </div>
          </div>

          <div className="bg-[#0E131F] border border-slate-800/80 rounded-2xl p-4 sm:p-5">
            <div className="text-xs text-slate-400 font-medium">تنتهي خلال 5 أيام</div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-amber-400">
                {stats.expiringSoon}
              </span>
              <span className="text-xs text-slate-500">تجديد قريب</span>
            </div>
          </div>

          <div className="bg-[#0E131F] border border-slate-800/80 rounded-2xl p-4 sm:p-5">
            <div className="text-xs text-slate-400 font-medium">منتهية / موقوفة</div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-rose-400">
                {stats.expired + stats.inactive}
              </span>
              <span className="text-xs text-slate-500">غير فعال</span>
            </div>
          </div>
        </section>

        {/* Search & Filter Bar */}
        <section className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#0E131F] border border-slate-800/80 rounded-2xl p-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث باسم المشترك أو عنوان البروكسي..."
              className="w-full bg-[#070A10] border border-slate-800/90 focus:border-emerald-500 rounded-xl pr-10 pl-4 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#070A10] border border-slate-800/90 rounded-xl overflow-x-auto">
            {(
              [
                { id: 'all', label: `الكل (${stats.total})` },
                { id: 'active', label: `نشط (${stats.active})` },
                { id: 'expiring_soon', label: `ينتهي قريباً (${stats.expiringSoon})` },
                { id: 'expired', label: `منتهي (${stats.expired})` },
                { id: 'inactive', label: `موقوف (${stats.inactive})` },
              ] as { id: FilterTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === tab.id
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {/* Data Table / Cards */}
        {loading ? (
          <div className="bg-[#0E131F] border border-slate-800/80 rounded-2xl p-6 space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-12 bg-slate-800/40 animate-pulse rounded-xl border border-slate-800/60"
              />
            ))}
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="bg-[#0E131F] border border-slate-800/80 rounded-2xl p-12 text-center space-y-3">
            <div className="text-sm font-semibold text-slate-300">
              {searchQuery || statusFilter !== 'all'
                ? 'لا توجد نتائج مطابقة'
                : 'لا يوجد مشتركون حالياً'}
            </div>
            <div>
              {searchQuery || statusFilter !== 'all' ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                >
                  عرض الكل
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openAddModal}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة مشترك</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* DESKTOP TABLE: Clean 6-Column Layout */}
            <div className="hidden md:block bg-[#0E131F] border border-slate-800/80 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/80 bg-[#070A10]/60 text-xs font-medium text-slate-400">
                      <th className="py-3.5 px-5 whitespace-nowrap">المشترك</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">الحالة</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">تاريخ الانتهاء</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">البروكسي</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">الجهاز</th>
                      <th className="py-3.5 px-5 text-left whitespace-nowrap">التفعيل والإدارة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-sm">
                    {filteredClients.map((client) => {
                      const statusInfo = getClientStatusInfo(client);
                      const isHappCopied = copiedHappId === client.id;
                      const isMsgCopied = copiedMsgId === client.id;
                      const isEncrypting = encryptingId === client.id;
                      const boundDevice = client.registered_ip ? client.registered_ip.trim() : null;

                      return (
                        <tr
                          key={client.id}
                          className="hover:bg-slate-800/30 transition-colors"
                        >
                          {/* 1. Subscriber */}
                          <td className="py-3.5 px-5 whitespace-nowrap">
                            <span className="font-mono font-semibold text-white" dir="ltr">
                              {client.username}
                            </span>
                          </td>

                          {/* 2. Status */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {statusInfo.status === 'active' && (
                              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                <span>نشط</span>
                                <span aria-hidden="true" className="text-slate-600">·</span>
                                <span
                                  className={
                                    statusInfo.isExpiringSoon
                                      ? 'text-amber-400'
                                      : 'text-slate-400 font-normal'
                                  }
                                >
                                  {statusInfo.daysText}
                                </span>
                              </div>
                            )}
                            {statusInfo.status === 'expired' && (
                              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                <span>منتهي</span>
                                <span aria-hidden="true" className="text-slate-600">·</span>
                                <span className="text-slate-500 font-normal">{statusInfo.daysText}</span>
                              </div>
                            )}
                            {statusInfo.status === 'inactive' && (
                              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400">
                                <PauseCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>موقوف</span>
                              </div>
                            )}
                          </td>

                          {/* 3. Expiry Date + Quick +30d */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span
                                className="font-mono text-xs tabular-nums text-slate-200"
                                dir="ltr"
                              >
                                {client.expiry_date}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleQuickExtend30Days(client)}
                                title="تمديد 30 يوماً"
                                className="px-2 py-0.5 text-[11px] font-medium bg-slate-800/80 hover:bg-emerald-950 hover:text-emerald-300 text-slate-400 rounded-md transition-colors whitespace-nowrap"
                              >
                                +30ي
                              </button>
                            </div>
                          </td>

                          {/* 4. Proxy IP:Port */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-slate-300" dir="ltr">
                              <span>
                                {client.proxy_host}:{client.proxy_port}
                              </span>
                              {client.proxy_username && client.proxy_password && (
                                <span title={`User: ${client.proxy_username}`}>
                                  <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 5. Device Lock + Inline Unlock */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {boundDevice ? (
                              <div className="inline-flex items-center gap-2">
                                <span
                                  className="text-xs text-sky-400 font-medium"
                                  title={boundDevice}
                                >
                                  مرتبط بجهاز
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleResetDevice(client)}
                                  title="فك قفل الجهاز"
                                  className="px-2 py-0.5 rounded-md bg-sky-950/50 hover:bg-sky-900/70 border border-sky-800/50 text-sky-300 text-[11px] font-medium flex items-center gap-1 transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>فك</span>
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500">متاح</span>
                            )}
                          </td>

                          {/* 6. Unified Activation & Management Toolbar */}
                          <td className="py-3.5 px-5 whitespace-nowrap text-left">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Copy Encrypted Happ Code */}
                              <button
                                type="button"
                                disabled={isEncrypting}
                                onClick={() => handleCopyHappCode(client)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap border ${
                                  isHappCopied
                                    ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                                    : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
                                }`}
                              >
                                {isHappCopied ? (
                                  <Check className="w-3.5 h-3.5" />
                                ) : (
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                )}
                                <span>{isHappCopied ? 'تم النسخ' : 'كود Happ'}</span>
                              </button>

                              {/* Copy Full Message */}
                              <button
                                type="button"
                                disabled={isEncrypting}
                                onClick={() => handleCopyCustomerMessage(client)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap border ${
                                  isMsgCopied
                                    ? 'bg-sky-950 border-sky-600 text-sky-300'
                                    : 'bg-[#070A10] hover:bg-slate-800 border-slate-800 text-slate-300'
                                }`}
                              >
                                {isMsgCopied ? (
                                  <Check className="w-3.5 h-3.5 text-sky-400" />
                                ) : (
                                  <Share2 className="w-3.5 h-3.5 text-sky-400" />
                                )}
                                <span>الرسالة</span>
                              </button>

                              {/* QR Code Modal */}
                              <button
                                type="button"
                                onClick={() => handleOpenQrModal(client)}
                                title="باركود التفعيل"
                                className="p-1.5 rounded-lg bg-[#070A10] hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
                              >
                                <QrCode className="w-4 h-4" />
                              </button>

                              <span className="w-px h-4 bg-slate-800 mx-0.5" aria-hidden="true" />

                              {/* Toggle Active */}
                              <button
                                type="button"
                                onClick={() => handleToggleActive(client)}
                                title={client.is_active ? 'إيقاف المشترك' : 'تفعيل المشترك'}
                                className={`p-1.5 rounded-lg border transition-colors ${
                                  client.is_active
                                    ? 'bg-[#070A10] border-slate-800 text-emerald-400 hover:bg-slate-800'
                                    : 'bg-[#070A10] border-slate-800 text-slate-500 hover:text-emerald-400 hover:bg-slate-800'
                                }`}
                              >
                                <Power className="w-4 h-4" />
                              </button>

                              {/* Edit */}
                              <button
                                type="button"
                                onClick={() => openEditModal(client)}
                                title="تعديل"
                                className="p-1.5 rounded-lg bg-[#070A10] hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>

                              {/* Delete */}
                              <button
                                type="button"
                                onClick={() => setDeletingClient(client)}
                                title="حذف"
                                className="p-1.5 rounded-lg bg-[#070A10] hover:bg-rose-950/60 border border-slate-800 hover:border-rose-800/60 text-slate-400 hover:text-rose-300 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
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

            {/* MOBILE CARDS */}
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
                    className="bg-[#0E131F] border border-slate-800/80 rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-mono font-bold text-base text-white" dir="ltr">
                          {client.username}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                          {statusInfo.status === 'active' && (
                            <span className="text-emerald-400 font-medium">نشط</span>
                          )}
                          {statusInfo.status === 'expired' && (
                            <span className="text-amber-400 font-medium">منتهي</span>
                          )}
                          {statusInfo.status === 'inactive' && (
                            <span className="text-rose-400 font-medium">موقوف</span>
                          )}
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-400">{statusInfo.daysText}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenQrModal(client)}
                          className="p-2 rounded-xl bg-[#070A10] border border-slate-800 text-slate-200"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(client)}
                          className={`p-2 rounded-xl border ${
                            client.is_active
                              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400'
                              : 'bg-[#070A10] border-slate-800 text-slate-500'
                          }`}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(client)}
                          className="p-2 rounded-xl bg-[#070A10] border border-slate-800 text-slate-300"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingClient(client)}
                          className="p-2 rounded-xl bg-[#070A10] border border-slate-800 text-rose-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/70 text-xs">
                      <div>
                        <span className="text-slate-500 block">الانتهاء</span>
                        <span className="font-mono tabular-nums text-slate-200 mt-0.5 block" dir="ltr">
                          {client.expiry_date}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">البروكسي</span>
                        <span className="font-mono tabular-nums text-slate-200 mt-0.5 block truncate" dir="ltr">
                          {client.proxy_host}:{client.proxy_port}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">الجهاز</span>
                        {boundDevice ? (
                          <button
                            type="button"
                            onClick={() => handleResetDevice(client)}
                            className="text-sky-400 font-medium mt-0.5 inline-flex items-center gap-1"
                          >
                            <span>مقفل (فك)</span>
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-slate-500 mt-0.5 block">متاح</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isEncrypting}
                        onClick={() => handleCopyHappCode(client)}
                        className="py-2 px-3 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5"
                      >
                        {isHappCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{isHappCopied ? 'تم النسخ' : 'كود Happ'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isEncrypting}
                        onClick={() => handleCopyCustomerMessage(client)}
                        className="py-2 px-3 rounded-xl text-xs font-semibold bg-[#070A10] border border-slate-800 text-slate-200 flex items-center justify-center gap-1.5"
                      >
                        {isMsgCopied ? <Check className="w-3.5 h-3.5 text-sky-400" /> : <Share2 className="w-3.5 h-3.5 text-sky-400" />}
                        <span>الرسالة</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickExtend30Days(client)}
                        className="py-2 px-3 rounded-xl text-xs font-semibold bg-[#070A10] border border-slate-800 text-emerald-400 flex items-center justify-center gap-1"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                        <span>+30 يوم</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 left-5 z-50 bg-[#0E131F] border border-emerald-600/50 text-slate-100 px-4 py-2.5 rounded-xl shadow-xl text-xs font-medium flex items-center gap-2">
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

      {/* QR Code Modal */}
      <QrCodeModal
        client={qrClient}
        encryptedLink={qrEncryptedLink}
        loading={qrLoading}
        onClose={() => setQrClient(null)}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        client={deletingClient}
        onClose={() => setDeletingClient(null)}
        onConfirm={handleDeleteClient}
      />
    </div>
  );
}
