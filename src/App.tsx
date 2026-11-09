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
  QrCode,
  Download,
  ExternalLink,
  Smartphone,
  FileDown,
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedHappId, setCopiedHappId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [copiedAndroidApp, setCopiedAndroidApp] = useState<boolean>(false);
  const [copiedIosApp, setCopiedIosApp] = useState<boolean>(false);
  const [copiedBothApps, setCopiedBothApps] = useState<boolean>(false);
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
  const [qrClient, setQrClient] = useState<ProxyClient | null>(null);
  const [qrEncryptedLink, setQrEncryptedLink] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState<boolean>(false);

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

  // Merge remote Supabase records with any local pending writes
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

  // Filtered clients list
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
    showToast('تم نسخ الرابط المباشر لتحميل تطبيق Happ للأندرويد (APK)');
    setTimeout(() => setCopiedAndroidApp(false), 2200);
  };

  const handleCopyIosLink = () => {
    navigator.clipboard.writeText(HAPP_IOS_URL);
    setCopiedIosApp(true);
    showToast('تم نسخ الرابط المباشر لتحميل تطبيق Happ للآيفون (App Store)');
    setTimeout(() => setCopiedIosApp(false), 2200);
  };

  const handleCopyBothAppLinks = () => {
    const text = [
      '📲 روابط تحميل تطبيق Happ الرسمي (مجاني وبدون إعلانات):',
      `• للآيفون (App Store):\n${HAPP_IOS_URL}`,
      `• للأندرويد (تحميل مباشر APK):\n${HAPP_ANDROID_APK_URL}`,
    ].join('\n\n');
    navigator.clipboard.writeText(text);
    setCopiedBothApps(true);
    showToast('تم نسخ روابط تحميل التطبيق للأندرويد والآيفون معاً');
    setTimeout(() => setCopiedBothApps(false), 2200);
  };

  // Export CSV Backup
  const handleExportCsv = () => {
    if (clients.length === 0) {
      showToast('لا توجد بيانات لتصديرها حالياً');
      return;
    }
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
    a.download = `vpn-alishop-clients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم تصدير النسخة الاحتياطية لبيانات المشتركين (CSV)');
  };

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

  // Open QR Code & Activation Card Modal
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
    } catch (err) {
      console.error('Error generating QR encrypted link:', err);
      showToast('تعذر توليد باركود التشفير حالياً');
    } finally {
      setQrLoading(false);
    }
  };

  // Copy Full Ready-to-Send Customer WhatsApp Message (VPN Alishop Branded)
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
        encrypted,
      ].join('\n');

      await navigator.clipboard.writeText(message);
      setCopiedMsgId(client.id);
      showToast(`تم نسخ رسالة التفعيل الكاملة باسم VPN ALISHOP للعميل ${client.username}`);
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
        showToast(`تمت إضافة المشترك ${created.username} بنجاح`);
        return;
      }

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
      showToast(`تمت إضافة المشترك ${fallbackClient.username}`);
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
        showToast(`تم تحديث بيانات المشترك ${updated.username}`);
        return;
      }

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
      showToast(`تم تحديث بيانات المشترك ${updatedFallback.username}`);
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
      showToast(`تمت إعادة تعيين الجهاز (فك القفل) للمشترك ${client.username}`);
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
    showToast(`تمت إعادة تعيين الجهاز للمشترك ${client.username}`);
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
          ? `تم تفعيل حساب المشترك ${client.username}`
          : `تم إيقاف حساب المشترك ${client.username}`
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
        ? `تم تفعيل حساب المشترك ${client.username}`
        : `تم إيقاف حساب المشترك ${client.username}`
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
      showToast(`تم حذف المشترك ${client.username}`);
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
    showToast(`تم حذف المشترك ${client.username}`);
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
    <div className="min-h-screen bg-[#070B12] text-slate-100 flex flex-col" dir="rtl">
      {/* Top Bar Contract: Strictly 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#070B12]/90 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Custom Professional VPN ALISHOP Logo & Brand Mark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setStatusFilter('all');
            }}
            className="flex items-center gap-3 whitespace-nowrap shrink-0 group"
          >
            <svg
              className="w-9 h-9 shrink-0"
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
                className="fill-emerald-950/90 stroke-emerald-500/50"
                strokeWidth="1.5"
              />
              <path
                d="M20 7L30 11.5V19.5C30 26.2 25.7 31.8 20 33.5C14.3 31.8 10 26.2 10 19.5V11.5L20 7Z"
                className="fill-emerald-500/15 stroke-emerald-400"
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
              <circle cx="20" cy="11" r="1.5" className="fill-emerald-400" />
            </svg>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-extrabold tracking-wider text-white font-mono">
                  VPN ALISHOP
                </span>
                <span className="text-[11px] font-semibold text-emerald-400 hidden sm:inline">
                  · بوابة شام كاش
                </span>
              </div>
              <span className="text-[11px] text-slate-400 hidden sm:block">
                نظام إدارة البروكسي السوري والتشفير المغلق
              </span>
            </div>
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
              جميع المشتركين
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
              الاشتراكات النشطة
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
              إعدادات قاعدة البيانات
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={openAddModal}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة مشترك جديد</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
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

        {/* DIRECT HAPP APP DOWNLOAD LINKS BAR (Android APK & Apple App Store) */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-white">
                <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>الروابط المباشرة لتحميل تطبيق العميل الرسمي (Happ - Proxy Utility)</span>
              </div>
              <p className="text-xs text-slate-400">
                اضغط على زر النسخ لإرسال رابط تحميل التطبيق مباشرةً للعميل حسب نوع هاتفه (أندرويد أو آيفون) — مجاني 100% وبدون إعلانات.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Android Direct APK Copy Button */}
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1.5 gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyAndroidLink}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                    copiedAndroidApp
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {copiedAndroidApp ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>تم نسخ رابط الأندرويد</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>نسخ رابط أندرويد (APK مباشر)</span>
                    </>
                  )}
                </button>
                <a
                  href={HAPP_ANDROID_APK_URL}
                  target="_blank"
                  rel="noreferrer"
                  title={HAPP_ANDROID_APK_URL}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Apple iOS App Store Direct Copy Button */}
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1.5 gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyIosLink}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                    copiedIosApp
                      ? 'bg-sky-950 text-sky-300 border border-sky-700'
                      : 'bg-sky-600 hover:bg-sky-500 text-white'
                  }`}
                >
                  {copiedIosApp ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>تم نسخ رابط الآيفون</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ رابط آيفون (App Store)</span>
                    </>
                  )}
                </button>
                <a
                  href={HAPP_IOS_URL}
                  target="_blank"
                  rel="noreferrer"
                  title={HAPP_IOS_URL}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Copy Both Links Together */}
              <button
                type="button"
                onClick={handleCopyBothAppLinks}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border whitespace-nowrap ${
                  copiedBothApps
                    ? 'bg-emerald-950 border-emerald-700 text-emerald-300'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                }`}
              >
                {copiedBothApps ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>تم نسخ الرابطين معاً</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>نسخ الرابطين معاً</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Direct Links Readout Bar */}
          <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
            <div className="flex items-center justify-between gap-2 bg-slate-950/80 border border-slate-800/80 rounded-lg px-3 py-1.5">
              <span className="text-slate-400 shrink-0">أندرويد (APK):</span>
              <code className="font-mono text-[11px] text-emerald-400 truncate select-all" dir="ltr">
                {HAPP_ANDROID_APK_URL}
              </code>
            </div>
            <div className="flex items-center justify-between gap-2 bg-slate-950/80 border border-slate-800/80 rounded-lg px-3 py-1.5">
              <span className="text-slate-400 shrink-0">آيفون (App Store):</span>
              <code className="font-mono text-[11px] text-sky-400 truncate select-all" dir="ltr">
                {HAPP_IOS_URL}
              </code>
            </div>
          </div>
        </section>

        {/* Section Header + KPI Strip */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                لوحة تحكم المشتركين · VPN ALISHOP
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                تخصيص بروكسي سوري منفصل لكل مشترك مع تشفير <code className="font-mono text-emerald-400">happ://crypt5</code> لمنع كشف الـ IP أو مشاركة الحساب بين عدة أجهزة.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <button
                type="button"
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors whitespace-nowrap"
              >
                <FileDown className="w-3.5 h-3.5 text-sky-400" />
                <span>تصدير نسخة احتياطية (CSV)</span>
              </button>
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
                <span>تحديث البيانات</span>
              </button>
            </div>
          </div>

          {/* 4-Column KPI Summary Grid (Single-Elevation, Tabular Numerals) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5">
              <div className="text-xs text-slate-400 font-medium">إجمالي المشتركين</div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-white">
                  {stats.total}
                </span>
                <span className="text-xs text-slate-400">
                  مرتبط بجهاز: <strong className="font-mono text-sky-400">{stats.boundDevices}</strong>
                </span>
              </div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5">
              <div className="text-xs text-slate-400 font-medium">الاشتراكات النشطة والفعالة</div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-400">
                  {stats.active}
                </span>
                <span className="text-xs text-emerald-400/80">توجيه مشفر مفعل</span>
              </div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5">
              <div className="text-xs text-slate-400 font-medium">تنتهي قريباً (خلال 5 أيام)</div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-amber-400">
                  {stats.expiringSoon}
                </span>
                <span className="text-xs text-slate-400">
                  منتهية كلياً: <strong className="font-mono text-amber-300">{stats.expired}</strong>
                </span>
              </div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5">
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
        <section className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث باسم المشترك، عنوان IP البروكسي السوري، اسم مستخدم البروكسي، أو بصمة الجهاز..."
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
              onClick={() => setStatusFilter('expiring_soon')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === 'expiring_soon'
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-800/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ينتهي قريباً ({stats.expiringSoon})
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
                : 'لا يوجد مشتركون مسجلون في قاعدة البيانات حالياً'}
            </div>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
              {searchQuery || statusFilter !== 'all'
                ? 'جرب تغيير كلمات البحث أو اختيار عرض جميع المشتركين.'
                : 'ابدأ بإضافة أول مشترك لتوليد كود Happ المشفر (happ://crypt5) وباركود التفعيل الخاص به.'}
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
                  <span>إضافة مشترك جديد</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* DESKTOP & TABLET DATA TABLE */}
            <div className="hidden md:block bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/70 text-xs font-semibold text-slate-400">
                      <th className="py-3.5 px-4 whitespace-nowrap">المشترك</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">الحالة والمدة</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">تاريخ الانتهاء</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">البروكسي السوري المخصص</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">المنفذ</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">بصمة الجهاز (HWID)</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">تفعيل تطبيق Happ المشفر</th>
                      <th className="py-3.5 px-4 text-left whitespace-nowrap">إجراءات الإدارة</th>
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
                                <span
                                  className={
                                    statusInfo.isExpiringSoon
                                      ? 'text-amber-400 font-medium'
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
                                  <span>مصادقة</span>
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

                          {/* 7. Encrypted Happ Code + QR Modal + Customer Message Copy */}
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
                                    <span>تم نسخ الكود</span>
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
                                title="نسخ رسالة واتساب كاملة باسم VPN ALISHOP تحتوي على روابط التطبيق + الكود المشفر"
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 border ${
                                  isMsgCopied
                                    ? 'bg-sky-950 border-sky-600 text-sky-300'
                                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                                }`}
                              >
                                {isMsgCopied ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-sky-400" />
                                    <span>تم النسخ</span>
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
                                onClick={() => handleOpenQrModal(client)}
                                title="عرض باركود التفعيل المشفر (QR Code)"
                                className="p-1.5 rounded-lg text-xs flex items-center justify-center transition-colors border bg-slate-950 hover:bg-slate-800 border-slate-800 text-emerald-400 hover:text-emerald-300"
                              >
                                <QrCode className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleCopyPacUrl(client)}
                                title="نسخ رابط الاشتراك المباشر (Sub URL)"
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
                                <span>فك قفل الجهاز</span>
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

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenQrModal(client)}
                          className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400"
                          title="عرض باركود التفعيل"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
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
                        <span className="text-slate-500 block">البروكسي السوري</span>
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
                        <span>تفعيل المشترك في تطبيق Happ (مخفي البيانات 100%):</span>
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
                              <span>رسالة الزبون</span>
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
                        <span>فك قفل الجهاز (Reset Device)</span>
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
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>VPN ALISHOP · منصة إدارة البروكسي السوري والاشتراكات المشفرة لتطبيق شام كاش</span>
          <span className="font-mono" dir="ltr">
            happ://crypt5 · X-HWID Hardware Lock
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

      {/* QR Code & Activation Card Modal */}
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

      {/* Database RLS Policy Helper Modal */}
      <DatabasePolicyModal
        isOpen={dbPolicyModalOpen}
        onClose={() => setDbPolicyModalOpen(false)}
      />
    </div>
  );
}
