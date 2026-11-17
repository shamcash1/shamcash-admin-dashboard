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
  Calendar,
  CalendarPlus,
  RotateCcw,
  Lock,
  ShieldCheck,
  Share2,
  QrCode,
  Download,
  FileDown,
  Smartphone,
  Server,
  HardDrive,
  X,
  Fingerprint,
  Sparkles,
  Activity,
} from 'lucide-react';
import {
  supabase,
  ProxyClient,
  ClientComputedStatus,
  getClientStatusInfo,
  addDaysToDateString,
  fetchHappEncryptedLink,
  normalizeProxyClient,
  packProxyHostWithAuth,
  formatDataMb,
  parseProxyDetails,
  regenerateNodeMavenProxyUsername,
  buildCustomerActivationMessage,
  generateSubscriberWithPrefix,
  previewNextNodeMavenSubUserName,
  createNodeMavenSubUserLive,
  getQrCodeImageUrl,
  HAPP_IOS_URL,
  HAPP_ANDROID_APK_URL,
} from './lib/supabase';
import { ClientModal } from './components/ClientModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { QrCodeModal, copyToClipboardSync, shareQrAndMessage } from './components/QrCodeModal';
import { SmartTrafficTrackerModal } from './components/SmartTrafficTrackerModal';
import { usePWAInstall } from './hooks/usePWAInstall';

const LOCAL_DELTA_STORAGE_KEY = 'shamcash_admin_local_delta_v1';

type FilterTab = 'all' | ClientComputedStatus | 'expiring_soon';

interface LocalDeltaState {
  upserted: Record<string, ProxyClient>;
  deletedIds: string[];
}

interface NodeMavenSubUserUsage {
  id?: string;
  proxy_username: string;
  proxy_password?: string;
  traffic_limit_bytes: number;
  traffic_used_bytes: number;
  traffic_limit_mb: number;
  traffic_used_mb: number;
  is_traffic_limited: boolean;
}

interface VerifiedProxyIpInfo {
  ok: boolean;
  exit_ip?: string;
  city?: string;
  region?: string;
  isp?: string;
  country_code?: string;
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
  const { isInstalled, isIOS, showIOSGuide, setShowIOSGuide, promptInstall } = usePWAInstall();
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
  const [happCache, setHappCache] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [nodeMavenMap, setNodeMavenMap] = useState<Record<string, NodeMavenSubUserUsage>>({});
  const [nodeMavenConnected, setNodeMavenConnected] = useState<boolean>(false);
  const [nodeMavenAccountMb, setNodeMavenAccountMb] = useState<number | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [checkingIpId, setCheckingIpId] = useState<string | null>(null);
  const [justRegeneratedId, setJustRegeneratedId] = useState<string | null>(null);
  const [verifiedIpMap, setVerifiedIpMap] = useState<Record<string, VerifiedProxyIpInfo>>({});
  const [refillingId, setRefillingId] = useState<string | null>(null);
  const [justRefilledId, setJustRefilledId] = useState<string | null>(null);

  // Smart Traffic Tracker Modal state
  const [trackerModalOpen, setTrackerModalOpen] = useState<boolean>(false);
  const [trackerClient, setTrackerClient] = useState<ProxyClient | null>(null);

  // Modals state
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingClient, setEditingClient] = useState<ProxyClient | null>(null);
  const [deletingClient, setDeletingClient] = useState<ProxyClient | null>(null);
  const [qrClient, setQrClient] = useState<ProxyClient | null>(null);
  const [qrEncryptedLink, setQrEncryptedLink] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState<boolean>(false);

  // Platform choice modal when clicking "مشاركة"
  const [messagePlatformClient, setMessagePlatformClient] = useState<ProxyClient | null>(null);
  const [sharingPlatformLoading, setSharingPlatformLoading] = useState<'android' | 'ios' | null>(
    null
  );

  // Auto-generate subscriber modal state (Creates brand-new Sub-User in NodeMaven Parent Dashboard + Subscriber in Our Dashboard)
  const [autoGenModalOpen, setAutoGenModalOpen] = useState<boolean>(false);
  const [nmProxyPrefix, setNmProxyPrefix] = useState<string>(() => {
    try {
      return localStorage.getItem('shamcash_NmProxyPrefix_v1') || 'Ammarmedia';
    } catch {
      return 'Ammarmedia';
    }
  });
  const [customSubscriberName, setCustomSubscriberName] = useState<string>('');
  const [subscriberPrefix, setSubscriberPrefix] = useState<string>(() => {
    try {
      return localStorage.getItem('shamcash_PreferredPrefix_v1') || 'alishop';
    } catch {
      return 'alishop';
    }
  });
  const [autoGenQuotaMb, setAutoGenQuotaMb] = useState<string>('50');
  const [autoGenDays, setAutoGenDays] = useState<number>(30);
  const [autoGenerating, setAutoGenerating] = useState<boolean>(false);
  const [autoGenError, setAutoGenError] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  const syncNodeMavenUsage = useCallback(async () => {
    const endpoints = [
      '/api/nodemaven/usage',
      'https://shamcash-proxy-api.vercel.app/api/nodemaven/usage',
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) continue;
        const json = await res.json();
        if (json?.connected && json?.sub_users) {
          setNodeMavenConnected(true);
          setNodeMavenMap(json.sub_users as Record<string, NodeMavenSubUserUsage>);
          if (typeof json?.account?.traffic_remaining_mb === 'number') {
            setNodeMavenAccountMb(json.account.traffic_remaining_mb);
          }
          return;
        }
      } catch {
        // try next endpoint
      }
    }
  }, []);

  const fetchClients = useCallback(
    async (isSilent = false) => {
      if (!isSilent) setLoading(true);
      setRefreshing(true);

      try {
        const [{ data, error }] = await Promise.all([
          supabase.from('proxy_clients').select('*').order('created_at', { ascending: false }),
          syncNodeMavenUsage(),
        ]);

        if (!error && data) {
          const normalized = (data as ProxyClient[])
            .filter((row) => row.username !== '__system_routing_rules__')
            .map(normalizeProxyClient);
          setRemoteClients(normalized);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [syncNodeMavenUsage]
  );

  useEffect(() => {
    fetchClients();
    const timer = setInterval(() => {
      syncNodeMavenUsage();
    }, 20000);
    return () => clearInterval(timer);
  }, [fetchClients, syncNodeMavenUsage]);

  const clients = useMemo(() => {
    const map = new Map<string, ProxyClient>();
    for (const c of remoteClients) {
      if (c.username === '__system_routing_rules__') continue;
      if (!localDelta.deletedIds.includes(c.id)) {
        map.set(c.id, c);
      }
    }
    for (const [id, c] of Object.entries(localDelta.upserted)) {
      if (c.username === '__system_routing_rules__') continue;
      if (!localDelta.deletedIds.includes(id)) {
        map.set(id, c);
      }
    }
    return Array.from(map.values())
      .map((client) => {
        const subPrefix = String(client.proxy_username || '')
          .split('-country-')[0]
          .trim()
          .toLowerCase();
        const nm = subPrefix ? nodeMavenMap[subPrefix] : undefined;
        if (!nm) return client;

        const limitMb =
          typeof nm.traffic_limit_mb === 'number'
            ? nm.traffic_limit_mb
            : Number((nm.traffic_limit_bytes / 1000000).toFixed(2));
        const usedMb =
          typeof nm.traffic_used_mb === 'number'
            ? nm.traffic_used_mb
            : Number((nm.traffic_used_bytes / 1000000).toFixed(2));

        return {
          ...client,
          quota_mb: limitMb > 0 ? limitMb : client.quota_mb,
          used_mb: usedMb >= 0 ? usedMb : client.used_mb,
        };
      })
      .sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
  }, [remoteClients, localDelta, nodeMavenMap]);

  // Preload encrypted Happ codes for all clients so mobile clipboard copy is 100% synchronous
  useEffect(() => {
    clients.forEach((c) => {
      if (!happCache[c.username]) {
        fetchHappEncryptedLink(c.username)
          .then((enc) => {
            setHappCache((prev) => (prev[c.username] ? prev : { ...prev, [c.username]: enc }));
          })
          .catch(() => {});
      }
    });
  }, [clients, happCache]);

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
    copyToClipboardSync(HAPP_ANDROID_APK_URL);
    setCopiedAndroidApp(true);
    showToast('تم نسخ رابط تطبيق أندرويد (APK)');
    setTimeout(() => setCopiedAndroidApp(false), 2000);
  };

  const handleCopyIosLink = () => {
    copyToClipboardSync(HAPP_IOS_URL);
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
      'quota_mb',
      'used_mb',
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
        c.quota_mb ?? 0,
        c.used_mb ?? 0,
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

  // Copy Encrypted Happ Code
  const handleCopyHappCode = async (client: ProxyClient) => {
    const cached = happCache[client.username];
    if (cached) {
      copyToClipboardSync(cached);
      setCopiedHappId(client.id);
      showToast(`تم نسخ الكود المشفر · ${client.username}`);
      setTimeout(() => {
        setCopiedHappId((prev) => (prev === client.id ? null : prev));
      }, 2200);
      return;
    }

    handleOpenQrModal(client);
  };

  // Open Share Modal when clicking "مشاركة"
  const handleRequestCustomerMessage = (client: ProxyClient) => {
    if (!happCache[client.username]) {
      fetchHappEncryptedLink(client.username)
        .then((enc) => {
          setHappCache((prev) => ({ ...prev, [client.username]: enc }));
        })
        .catch(() => {});
    }
    setMessagePlatformClient(client);
  };

  // Share QR Code Image + Platform-Specific Customer Message directly to WhatsApp / Native Share
  const handleConfirmSharePlatformMessage = async (
    platform: 'android' | 'ios',
    mode: 'native' | 'whatsapp_link' = 'native'
  ) => {
    if (!messagePlatformClient || sharingPlatformLoading) return;
    const client = messagePlatformClient;
    setSharingPlatformLoading(platform);

    try {
      let encrypted = happCache[client.username];
      if (!encrypted) {
        encrypted = await fetchHappEncryptedLink(client.username);
        setHappCache((prev) => ({ ...prev, [client.username]: encrypted! }));
      }

      const message = buildCustomerActivationMessage(client, encrypted, platform);
      copyToClipboardSync(message);

      if (mode === 'whatsapp_link') {
        const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank', 'noopener,noreferrer');
        setCopiedMsgId(client.id);
        setMessagePlatformClient(null);
        showToast(`تم نسخ الرسالة وفتح واتساب لمشاركة اشتراك ${client.username}`);
        return;
      }

      const result = await shareQrAndMessage(client, encrypted, platform);
      setCopiedMsgId(client.id);
      setMessagePlatformClient(null);

      if (result === 'shared_with_qr') {
        showToast(`تمت مشاركة الباركود QR ونص الاشتراك · ${client.username}`);
      } else if (result === 'shared_text') {
        showToast(`تمت مشاركة نص الاشتراك ونسخه للحافظة · ${client.username}`);
      } else {
        showToast(`تم نسخ نص الاشتراك وتحميل صورة الباركود QR · ${client.username}`);
      }

      setTimeout(() => {
        setCopiedMsgId((prev) => (prev === client.id ? null : prev));
      }, 2400);
    } catch {
      showToast('تعذر تجهيز المشاركة حالياً، حاول مرة أخرى');
    } finally {
      setSharingPlatformLoading(null);
    }
  };

  // Existing NodeMaven sub-user names list for accurate next-number preview
  const existingNodeMavenSubUserNames = useMemo(() => {
    const names = new Set<string>();
    Object.values(nodeMavenMap).forEach((u) => {
      if (u.proxy_username) names.add(u.proxy_username);
    });
    clients.forEach((c) => {
      const parsed = parseProxyDetails(c);
      if (parsed.subUser) names.add(parsed.subUser);
    });
    return Array.from(names);
  }, [nodeMavenMap, clients]);

  const previewNodeMavenSubUser = useMemo(() => {
    return previewNextNodeMavenSubUserName(nmProxyPrefix, existingNodeMavenSubUserNames);
  }, [nmProxyPrefix, existingNodeMavenSubUserNames]);

  // Open Auto-Generate Subscriber Modal
  const openAutoGenModal = () => {
    setAutoGenError(null);
    const nextSubName = generateSubscriberWithPrefix(
      subscriberPrefix,
      clients.map((c) => c.username)
    );
    setCustomSubscriberName(nextSubName);
    setAutoGenDays(30);
    setAutoGenQuotaMb('50');
    setAutoGenModalOpen(true);
  };

  // Update NodeMaven parent proxy prefix
  const handleNmProxyPrefixChange = (nextVal: string) => {
    setNmProxyPrefix(nextVal);
    try {
      localStorage.setItem('shamcash_NmProxyPrefix_v1', nextVal.trim() || 'Ammarmedia');
    } catch {
      // ignore
    }
  };

  // Update local subscriber prefix & regenerate subscriber name
  const handleSubscriberPrefixGenerate = (prefixToUse: string) => {
    setSubscriberPrefix(prefixToUse);
    try {
      localStorage.setItem('shamcash_PreferredPrefix_v1', prefixToUse.trim() || 'alishop');
    } catch {
      // ignore
    }
    const generated = generateSubscriberWithPrefix(
      prefixToUse,
      clients.map((c) => c.username)
    );
    setCustomSubscriberName(generated);
  };

  // Confirm Auto-Generate:
  // 1. Creates a brand-new Sub-User from scratch in the Parent NodeMaven Dashboard via API (POST /api/v2/base/sub-users/)
  // 2. Configures its Syrian sticky session (-country-sy-sid-...-filter-medium-norotate-true)
  // 3. Adds the subscriber with the chosen subscriber name into our Dashboard (Supabase)
  const handleConfirmAutoGenerateSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (autoGenerating) return;
    setAutoGenError(null);

    const trimmedSubName = customSubscriberName.trim().replace(/\s+/g, '_');
    if (!trimmedSubName) {
      setAutoGenError('يرجى إدخال أو توليد اسم المشترك الذي سيضاف في لوحتك.');
      return;
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedSubName)) {
      setAutoGenError('اسم المشترك يقبل أحرف إنجليزية وأرقام فقط.');
      return;
    }

    const isDuplicate = clients.some(
      (c) => c.username.toLowerCase() === trimmedSubName.toLowerCase()
    );
    if (isDuplicate) {
      setAutoGenError('اسم المشترك موجود مسبقاً في لوحتك، يرجى تغييره أو الضغط على توليد رقم جديد.');
      return;
    }

    setAutoGenerating(true);

    try {
      const host = clients[0]?.proxy_host || 'gate.nodemaven.com';
      const port = clients[0]?.proxy_port || 1080;
      const requestedQuotaMb = Math.max(0, Number(autoGenQuotaMb) || 50);

      // Call backend to create a brand-new Sub-User from scratch in NodeMaven Parent Dashboard
      const nmCreated = await createNodeMavenSubUserLive({
        proxy_prefix: previewNodeMavenSubUser,
        quota_mb: requestedQuotaMb,
        proxy_host: host,
      });

      if (!nmCreated.success || !nmCreated.full_proxy_username || !nmCreated.proxy_password) {
        setAutoGenError(
          nmCreated.error || 'تعذر إنشاء يوزر البروكسي الجديد في اللوحة الأم NodeMaven.'
        );
        return;
      }

      const expiryDate = addDaysToDateString(null, autoGenDays);

      await handleSaveClient({
        username: trimmedSubName,
        is_active: true,
        expiry_date: expiryDate,
        proxy_host: host,
        proxy_port: port,
        proxy_username: nmCreated.full_proxy_username,
        proxy_password: nmCreated.proxy_password,
        quota_mb: nmCreated.quota_mb ?? requestedQuotaMb,
        used_mb: 0,
      });

      await syncNodeMavenUsage();
      setAutoGenModalOpen(false);
      showToast(
        `تم إنشاء البروكسي (${nmCreated.sub_user}) في اللوحة الأم وإضافة المشترك (${trimmedSubName}) بنجاح!`
      );
    } finally {
      setAutoGenerating(false);
    }
  };

  // Save Client (Add / Edit Modal)
  const handleSaveClient = async (
    clientData: Omit<ProxyClient, 'id' | 'created_at' | 'updated_at'>,
    id?: string
  ) => {
    const packedHost = packProxyHostWithAuth(
      clientData.proxy_host,
      clientData.proxy_username,
      clientData.proxy_password,
      clientData.quota_mb,
      clientData.used_mb
    );
    const dbPayload = {
      username: clientData.username,
      is_active: clientData.is_active,
      expiry_date: clientData.expiry_date,
      proxy_host: packedHost,
      proxy_port: clientData.proxy_port,
    };

    if (modalMode === 'add') {
      const { data, error } = await supabase
        .from('proxy_clients')
        .insert([{ ...dbPayload, registered_ip: null }])
        .select();

      if (!error && data && data.length > 0) {
        const created = normalizeProxyClient(data[0] as ProxyClient);
        setRemoteClients((prev) => [created, ...prev]);
        syncNodeMavenUsage();
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
          ...dbPayload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select();

      if (!error && data && data.length > 0) {
        const updated = normalizeProxyClient(data[0] as ProxyClient);
        setRemoteClients((prev) => prev.map((c) => (c.id === id ? updated : c)));
        if (localDelta.upserted[id]) {
          const nextUpserted = { ...localDelta.upserted };
          delete nextUpserted[id];
          const nextDelta = { ...localDelta, upserted: nextUpserted };
          setLocalDelta(nextDelta);
          saveLocalDelta(nextDelta);
        }
        syncNodeMavenUsage();
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
      const updated = normalizeProxyClient(data[0] as ProxyClient);
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

  // Check Live Exit IP on NodeMaven Gateway (gate.nodemaven.com)
  const handleCheckProxyIp = async (client: ProxyClient) => {
    if (checkingIpId === client.id) return;
    setCheckingIpId(client.id);

    const endpoints = [
      '/api/nodemaven/check-proxy',
      'https://shamcash-proxy-api.vercel.app/api/nodemaven/check-proxy',
    ];

    try {
      for (const url of endpoints) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              proxy_username: client.proxy_username,
              proxy_password: client.proxy_password,
              proxy_host: client.proxy_host,
            }),
          });
          if (!res.ok) continue;
          const data = await res.json();
          if (data?.ok && data?.exit_ip) {
            setVerifiedIpMap((prev) => ({
              ...prev,
              [client.id]: {
                ok: true,
                exit_ip: data.exit_ip,
                city: data.city,
                region: data.region,
                isp: data.isp,
                country_code: data.country_code,
              },
            }));
            showToast(
              `الـ IP الفعلي في NodeMaven: ${data.exit_ip} (${data.city || 'SY'} - ${data.isp || ''})`
            );
            return;
          }
        } catch {
          // try next endpoint
        }
      }
      showToast('تعذر فحص الـ IP حالياً أو أن جلسة البروكسي تحتاج إعادة توليد');
    } finally {
      setCheckingIpId(null);
    }
  };

  // Refill / Reset Traffic Quota directly in NodeMaven Parent Dashboard + Local Dashboard
  const handleRefillTraffic = async (client: ProxyClient) => {
    if (refillingId === client.id) return;
    setRefillingId(client.id);

    const quotaToRefill = client.quota_mb && client.quota_mb > 0 ? client.quota_mb : 50;
    const endpoints = [
      '/api/nodemaven/refill-traffic',
      'https://shamcash-proxy-api.vercel.app/api/nodemaven/refill-traffic',
    ];

    try {
      for (const url of endpoints) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: client.id,
              username: client.username,
              proxy_username: client.proxy_username,
              proxy_password: client.proxy_password,
              proxy_host: client.proxy_host,
              quota_mb: quotaToRefill,
            }),
          });
          if (!res.ok) continue;
          const json = await res.json();
          if (json?.success) {
            const subKey = String(json.sub_user || '')
              .trim()
              .toLowerCase();
            if (subKey) {
              setNodeMavenMap((prev) => {
                const existing = prev[subKey];
                return {
                  ...prev,
                  [subKey]: {
                    ...(existing || { proxy_username: json.sub_user }),
                    traffic_limit_bytes: Math.round(quotaToRefill * 1000000),
                    traffic_used_bytes: 0,
                    traffic_limit_mb: quotaToRefill,
                    traffic_used_mb: 0,
                    is_traffic_limited: true,
                  },
                };
              });
            }

            setRemoteClients((prev) =>
              prev.map((c) =>
                c.id === client.id
                  ? { ...c, quota_mb: quotaToRefill, used_mb: 0, is_active: true }
                  : c
              )
            );

            setJustRefilledId(client.id);
            setTimeout(() => {
              setJustRefilledId((prev) => (prev === client.id ? null : prev));
            }, 3500);

            showToast(
              `تم إعادة ملء وتصفير حصة الترافيك في اللوحة الأم NodeMaven لـ ${client.username} (0 / ${quotaToRefill}MB)`
            );
            syncNodeMavenUsage();
            return;
          }
        } catch {
          // try next endpoint
        }
      }
      showToast('تعذر إعادة ملء الحصة حالياً، تأكد من وجود البروكسي في اللوحة الأم NodeMaven');
    } finally {
      setRefillingId(null);
    }
  };

  // Open Smart Traffic Tracker Modal (either for a single subscriber or global radar)
  const openTrafficTracker = (client: ProxyClient | null = null) => {
    setTrackerClient(client);
    setTrackerModalOpen(true);
  };

  // Regenerate NodeMaven Proxy Username via Live NodeMaven API + Gateway IP Verification
  const handleRegenerateProxy = async (client: ProxyClient) => {
    if (regeneratingId === client.id) return;
    setRegeneratingId(client.id);

    const previousIp = verifiedIpMap[client.id]?.exit_ip || '';
    const endpoints = [
      '/api/nodemaven/regenerate',
      'https://shamcash-proxy-api.vercel.app/api/nodemaven/regenerate',
    ];

    try {
      let apiResult: any = null;
      for (const url of endpoints) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: client.id,
              username: client.username,
              proxy_username: client.proxy_username,
              proxy_password: client.proxy_password,
              proxy_host: client.proxy_host,
              quota_mb: client.quota_mb,
              used_mb: client.used_mb,
              previous_ip: previousIp,
            }),
          });
          if (res.ok) {
            const json = await res.json();
            if (json?.success && json?.new_proxy_username) {
              apiResult = json;
              break;
            }
          }
        } catch {
          // try next endpoint
        }
      }

      const subPrefix = String(client.proxy_username || '')
        .split('-country-')[0]
        .trim()
        .toLowerCase();
      const nmSub = subPrefix ? nodeMavenMap[subPrefix] : undefined;

      const newProxyUsername =
        apiResult?.new_proxy_username ||
        regenerateNodeMavenProxyUsername(
          client.proxy_username,
          nmSub?.proxy_username || client.username
        ).newProxyUsername;

      const officialPassword =
        apiResult?.proxy_password || nmSub?.proxy_password || client.proxy_password;

      const packedHost =
        apiResult?.packed_host ||
        packProxyHostWithAuth(
          client.proxy_host,
          newProxyUsername,
          officialPassword,
          client.quota_mb,
          client.used_mb
        );

      const { data, error } = await supabase
        .from('proxy_clients')
        .update({
          proxy_host: packedHost,
          updated_at: new Date().toISOString(),
        })
        .eq('id', client.id)
        .select();

      if (!error && data && data.length > 0) {
        const updated = normalizeProxyClient(data[0] as ProxyClient);
        setRemoteClients((prev) => prev.map((c) => (c.id === client.id ? updated : c)));
        if (localDelta.upserted[client.id]) {
          const nextUpserted = { ...localDelta.upserted };
          delete nextUpserted[client.id];
          const nextDelta = { ...localDelta, upserted: nextUpserted };
          setLocalDelta(nextDelta);
          saveLocalDelta(nextDelta);
        }
      } else {
        const updatedFallback: ProxyClient = {
          ...client,
          proxy_username: newProxyUsername,
          proxy_password: officialPassword,
          updated_at: new Date().toISOString(),
        };
        const nextDelta: LocalDeltaState = {
          ...localDelta,
          upserted: { ...localDelta.upserted, [client.id]: updatedFallback },
        };
        setLocalDelta(nextDelta);
        saveLocalDelta(nextDelta);
      }

      if (apiResult?.live_check?.ok && apiResult.live_check.exit_ip) {
        setVerifiedIpMap((prev) => ({
          ...prev,
          [client.id]: {
            ok: true,
            exit_ip: apiResult.live_check.exit_ip,
            city: apiResult.live_check.city,
            region: apiResult.live_check.region,
            isp: apiResult.live_check.isp,
            country_code: apiResult.live_check.country_code,
          },
        }));
      }

      setJustRegeneratedId(client.id);
      setTimeout(() => {
        setJustRegeneratedId((prev) => (prev === client.id ? null : prev));
      }, 4000);

      if (apiResult?.live_check?.ok && apiResult.live_check.exit_ip) {
        showToast(
          `تم توليد بروكسي جديد من NodeMaven · IP الجديد: ${apiResult.live_check.exit_ip} (${apiResult.live_check.city || 'SY'})`
        );
      } else {
        showToast(`تم إعادة توليد البروكسي ومزامنته مع NodeMaven لـ ${client.username}`);
      }
    } finally {
      setRegeneratingId(null);
    }
  };

  const renderProxyStringWithHighlightedSid = (rawUsername: string, isHighlighted: boolean) => {
    if (!rawUsername) {
      return <span className="text-slate-500">بدون اسم بروكسي</span>;
    }
    const match = rawUsername.match(/^(.*?-sid-)([a-zA-Z0-9]+)(.*)$/i);
    if (!match) {
      return <span className="text-slate-200">{rawUsername}</span>;
    }
    const [, beforeSid, sidValue, afterSid] = match;
    return (
      <>
        <span className="text-slate-300">{beforeSid}</span>
        <span
          className={`px-1 py-0.5 rounded font-bold transition-colors ${
            isHighlighted
              ? 'bg-emerald-500 text-slate-950'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
          }`}
        >
          {sidValue}
        </span>
        <span className="text-slate-400">{afterSid}</span>
      </>
    );
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
      const updated = normalizeProxyClient(data[0] as ProxyClient);
      setRemoteClients((prev) => prev.map((c) => (c.id === client.id ? updated : c)));
      showToast(
        nextActive
          ? `تم تفعيل اشتراك ${client.username}`
          : `تم إيقاف اشتراك ${client.username} فوراً داخل Happ`
      );
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
    showToast(
      nextActive
        ? `تم تفعيل اشتراك ${client.username}`
        : `تم إيقاف اشتراك ${client.username} فوراً داخل Happ`
    );
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
      const updated = normalizeProxyClient(data[0] as ProxyClient);
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

  const defaultHost = clients[0]?.proxy_host || 'gate.nodemaven.com';
  const defaultPort = clients[0]?.proxy_port || 1080;

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#070A10] text-slate-100 flex flex-col" dir="rtl">
      {/* Top Bar: Strictly 3 Clean Zones */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#070A10]/90 backdrop-blur-md">
        <div className="max-w-[1380px] mx-auto px-3 sm:px-6 min-h-14 sm:h-16 py-2 sm:py-0 flex items-center justify-between gap-2 sm:gap-4">
          {/* Zone 1: Brand Logo & Name */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setStatusFilter('all');
            }}
            className="flex items-center gap-2 sm:gap-3 whitespace-nowrap shrink-0 min-w-0"
          >
            <svg
              className="w-7 h-7 sm:w-8 sm:h-8 shrink-0"
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
            <span className="text-sm sm:text-lg font-extrabold tracking-wide sm:tracking-wider text-white font-mono">
              VPN ALISHOP
            </span>
          </a>

          {/* Zone 2: Direct Happ App Copy Buttons & Quick Tools */}
          <div className="hidden lg:flex items-center gap-2">
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

            {nodeMavenAccountMb !== null && (
              <div className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-950/60 border border-emerald-800/70 text-emerald-300 flex items-center gap-1.5 whitespace-nowrap">
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                <span>رصيد NodeMaven العام:</span>
                <strong className="font-mono text-white" dir="ltr">
                  {formatDataMb(nodeMavenAccountMb)}
                </strong>
              </div>
            )}

            <button
              type="button"
              onClick={() => fetchClients(true)}
              disabled={refreshing}
              className="p-1.5 rounded-lg bg-[#0E131F] hover:bg-slate-800/80 border border-slate-800 text-slate-400 hover:text-white transition-colors"
              title="مزامنة وتحديث البيانات من NodeMaven"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>

          {/* Zone 3: Primary CTAs (Install App + Auto-Generate with Prefix + Manual Add) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {!isInstalled && (
              <button
                type="button"
                onClick={promptInstall}
                className="hidden sm:flex px-3 py-2 text-xs sm:text-sm font-semibold text-emerald-300 hover:text-white bg-emerald-950/70 hover:bg-emerald-700 border border-emerald-700/70 rounded-xl transition-colors items-center gap-1.5 whitespace-nowrap shrink-0"
                title="تثبيت لوحة تحكم VPN ALISHOP كتطبيق هاتف"
              >
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>تثبيت التطبيق</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => openTrafficTracker(null)}
              className="hidden sm:flex px-3 py-2 text-xs sm:text-sm font-semibold text-sky-300 hover:text-white bg-sky-950/70 hover:bg-sky-600 border border-sky-700/70 rounded-xl transition-colors items-center gap-1.5 whitespace-nowrap shrink-0"
              title="رادار التتبع الذكي للصرف وحظر العناوين الخارجة عن شام كاش"
            >
              <Activity className="w-4 h-4 text-sky-400 shrink-0" />
              <span>رادار الصرف وحظر العناوين</span>
            </button>

            <button
              type="button"
              onClick={openAutoGenModal}
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-amber-300 hover:text-white bg-amber-950/70 hover:bg-amber-600 border border-amber-700/70 rounded-lg sm:rounded-xl transition-colors flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0"
              title="توليد مشترك تلقائياً ببادئة تختارها مع نفس إعدادات البروكسي السوري"
            >
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
              <span>توليد تلقائي</span>
            </button>

            <button
              type="button"
              onClick={openAddModal}
              className="px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg sm:rounded-xl transition-colors flex items-center gap-1 sm:gap-2 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>مشترك جديد</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-[1380px] w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
        {/* Mobile App Links & Smart Radar Bar (Visible on mobile/tablet screens) */}
        <div className="space-y-1.5 lg:hidden">
          <button
            type="button"
            onClick={() => openTrafficTracker(null)}
            className="w-full sm:hidden py-2 px-3 rounded-xl text-xs font-bold bg-sky-950/75 border border-sky-700/70 text-sky-300 flex items-center justify-center gap-2"
          >
            <Activity className="w-4 h-4 text-sky-400 shrink-0" />
            <span>رادار التتبع الذكي للصرف وحظر العناوين الخارجية</span>
          </button>

          <div className={`grid ${!isInstalled ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 sm:gap-2`}>
            {!isInstalled && (
              <button
                type="button"
                onClick={promptInstall}
                className="py-2 px-2 rounded-xl text-[11px] sm:text-xs font-semibold bg-emerald-950/70 border border-emerald-700/70 text-emerald-300 flex items-center justify-center gap-1 min-w-0"
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">تثبيت التطبيق</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleCopyAndroidLink}
              className="py-2 px-2 rounded-xl text-[11px] sm:text-xs font-medium bg-[#0E131F] border border-slate-800 text-slate-200 flex items-center justify-center gap-1 min-w-0"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">{copiedAndroidApp ? 'تم نسخ أندرويد' : 'نسخ أندرويد'}</span>
            </button>
            <button
              type="button"
              onClick={handleCopyIosLink}
              className="py-2 px-2 rounded-xl text-[11px] sm:text-xs font-medium bg-[#0E131F] border border-slate-800 text-slate-200 flex items-center justify-center gap-1 min-w-0"
            >
              <Smartphone className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate">{copiedIosApp ? 'تم نسخ آيفون' : 'نسخ آيفون'}</span>
            </button>
          </div>
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
                className="h-16 bg-slate-800/40 animate-pulse rounded-xl border border-slate-800/60"
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
            {/* DESKTOP TABLE: Professional SaaS Layout with NodeMaven Quota Bar Under Each User */}
            <div className="hidden md:block bg-[#0E131F] border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/90 bg-[#070A10]/80 text-xs font-semibold text-slate-400">
                      <th className="py-3.5 px-5 whitespace-nowrap">المشترك ومخصصات NodeMaven</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">الحالة</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">تاريخ الانتهاء</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">البروكسي والخادم</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">حماية الجهاز</th>
                      <th className="py-3.5 px-5 text-left whitespace-nowrap">التفعيل والإدارة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-sm">
                    {filteredClients.map((client) => {
                      const statusInfo = getClientStatusInfo(client);
                      const isHappCopied = copiedHappId === client.id;
                      const isMsgCopied = copiedMsgId === client.id;
                      const boundDevice = client.registered_ip ? client.registered_ip.trim() : null;
                      const proxyDetails = parseProxyDetails(client);

                      const quotaMb = client.quota_mb && client.quota_mb > 0 ? client.quota_mb : 0;
                      const usedMb = client.used_mb && client.used_mb >= 0 ? client.used_mb : 0;
                      const remainingMb =
                        quotaMb > 0 ? Math.max(0, Number((quotaMb - usedMb).toFixed(1))) : 0;
                      const usagePct =
                        quotaMb > 0 ? Math.min(100, Math.round((usedMb / quotaMb) * 100)) : 0;
                      const isQuotaExhausted = quotaMb > 0 && usedMb >= quotaMb;

                      const rawHwid = boundDevice
                        ? boundDevice.replace(/^HWID:/i, '').trim()
                        : '';
                      const shortHwid =
                        rawHwid.length > 12
                          ? `${rawHwid.slice(0, 6)}...${rawHwid.slice(-4)}`
                          : rawHwid;

                      return (
                        <React.Fragment key={client.id}>
                          <tr className="hover:bg-slate-800/25 transition-colors">
                            {/* 1. Subscriber + Underneath NodeMaven Sub-User Quota & Usage Progress */}
                            <td className="py-4 px-5 align-top min-w-[265px]">
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span
                                    className="font-mono font-bold text-base text-white tracking-tight"
                                    dir="ltr"
                                  >
                                    {client.username}
                                  </span>
                                  {proxyDetails.subUser && (
                                    <span
                                      className="px-2 py-0.5 rounded-md bg-[#070A10] border border-slate-800 text-[10px] font-mono text-sky-400"
                                      dir="ltr"
                                    >
                                      NodeMaven · {proxyDetails.subUser}
                                    </span>
                                  )}
                                </div>

                                {/* NodeMaven Live Quota & Consumption Card Under Subscriber */}
                                <div className="bg-[#070A10]/90 border border-slate-800/90 rounded-xl p-2.5 space-y-2">
                                  {quotaMb > 0 ? (
                                    <>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-400 flex items-center gap-1">
                                          <HardDrive className="w-3 h-3 text-emerald-400" />
                                          <span>المصروف / المخصص:</span>
                                        </span>
                                        <span
                                          className="font-mono tabular-nums font-semibold text-slate-200"
                                          dir="ltr"
                                        >
                                          {formatDataMb(usedMb)} / {formatDataMb(quotaMb)}
                                        </span>
                                      </div>

                                      <div className="w-full h-1.5 bg-slate-800/90 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all duration-300 ${
                                            usagePct >= 90
                                              ? 'bg-rose-500'
                                              : usagePct >= 75
                                              ? 'bg-amber-400'
                                              : 'bg-emerald-500'
                                          }`}
                                          style={{ width: `${usagePct}%` }}
                                        />
                                      </div>

                                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                                        <span>
                                          {isQuotaExhausted ? (
                                            <span className="text-rose-400 font-semibold">
                                              انتهت الباقة المخصصة في NodeMaven
                                            </span>
                                          ) : (
                                            <>
                                              متبقي:{' '}
                                              <strong
                                                className="text-emerald-400 font-mono"
                                                dir="ltr"
                                              >
                                                {formatDataMb(remainingMb)}
                                              </strong>
                                            </>
                                          )}
                                        </span>
                                        <span className="font-mono tabular-nums">{usagePct}%</span>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 py-0.5">
                                      <span className="flex items-center gap-1.5">
                                        <HardDrive className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                        <span>
                                          {!nodeMavenConnected
                                            ? `جاري جلب مخصصات (${proxyDetails.subUser || client.username})...`
                                            : proxyDetails.subUser &&
                                              nodeMavenMap[proxyDetails.subUser.toLowerCase()]
                                            ? 'مفتوح في NodeMaven (من الرصيد العام)'
                                            : `اليوزر (${proxyDetails.subUser || client.username}) غير موجود في NodeMaven`}
                                        </span>
                                      </span>
                                      <span className="text-[10px] font-mono text-amber-400">
                                        {!nodeMavenConnected
                                          ? '...'
                                          : proxyDetails.subUser &&
                                            nodeMavenMap[proxyDetails.subUser.toLowerCase()]
                                          ? '∞'
                                          : 'محذوف'}
                                      </span>
                                    </div>
                                  )}

                                  {/* Direct NodeMaven Refill Traffic Quota + Smart Domain Tracker Buttons */}
                                  <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-800/80">
                                    <button
                                      type="button"
                                      onClick={() => handleRefillTraffic(client)}
                                      disabled={refillingId === client.id}
                                      title="إعادة ملء وتصفير حصة الترافيك لهذا المشترك في اللوحة الأم NodeMaven فوراً"
                                      className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 border transition-colors ${
                                        justRefilledId === client.id
                                          ? 'bg-emerald-600 border-emerald-400 text-white'
                                          : 'bg-emerald-950/70 hover:bg-emerald-600 text-emerald-300 hover:text-white border-emerald-800/60'
                                      }`}
                                    >
                                      <RotateCcw
                                        className={`w-3 h-3 ${
                                          refillingId === client.id ? 'animate-spin' : ''
                                        }`}
                                      />
                                      <span>
                                        {refillingId === client.id
                                          ? 'يعيد الملء...'
                                          : justRefilledId === client.id
                                          ? 'تم ملء الحصة ✓'
                                          : 'إعادة ملء الحصة'}
                                      </span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => openTrafficTracker(client)}
                                      title="تتبع ذكي للمواقع التي تستهلك باقة هذا المشترك مع إمكانية حظر أي عنوان"
                                      className="flex-1 py-1 px-2 rounded-lg text-[10px] font-bold bg-sky-950/70 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-800/60 flex items-center justify-center gap-1 transition-colors"
                                    >
                                      <Activity className="w-3 h-3" />
                                      <span>تتبع الصرف</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* 2. Status */}
                            <td className="py-4 px-4 align-middle whitespace-nowrap">
                              {statusInfo.status === 'active' && !isQuotaExhausted && (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/50 border border-emerald-800/50 text-xs font-semibold text-emerald-400">
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>نشط</span>
                                </div>
                              )}
                              {statusInfo.status === 'active' && isQuotaExhausted && (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/50 border border-rose-800/50 text-xs font-semibold text-rose-400">
                                  <PauseCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>انتهت الباقة</span>
                                </div>
                              )}
                              {statusInfo.status === 'expired' && (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/50 border border-amber-800/50 text-xs font-semibold text-amber-400">
                                  <Clock className="w-3.5 h-3.5 shrink-0" />
                                  <span>منتهي</span>
                                </div>
                              )}
                              {statusInfo.status === 'inactive' && (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/50 border border-rose-800/50 text-xs font-semibold text-rose-400">
                                  <PauseCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>موقوف في Happ</span>
                                </div>
                              )}
                            </td>

                            {/* 3. Professional Expiry Date Card Cell */}
                            <td className="py-4 px-4 align-middle whitespace-nowrap">
                              <div className="inline-flex items-center gap-2.5 bg-[#070A10] border border-slate-800/90 rounded-xl px-3 py-2">
                                <div
                                  className={`p-1.5 rounded-lg border ${
                                    statusInfo.status === 'expired'
                                      ? 'bg-amber-950/40 border-amber-800/50 text-amber-400'
                                      : statusInfo.isExpiringSoon
                                      ? 'bg-amber-950/40 border-amber-800/50 text-amber-400'
                                      : 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400'
                                  }`}
                                >
                                  <Calendar className="w-3.5 h-3.5" />
                                </div>
                                <div className="space-y-0.5">
                                  <div
                                    className="font-mono text-xs font-bold tabular-nums text-slate-100"
                                    dir="ltr"
                                  >
                                    {client.expiry_date}
                                  </div>
                                  <div
                                    className={`text-[11px] font-medium ${
                                      statusInfo.status === 'expired' || statusInfo.isExpiringSoon
                                        ? 'text-amber-400'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    {statusInfo.daysText}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleQuickExtend30Days(client)}
                                  title="تمديد الصلاحية 30 يوماً"
                                  className="mr-1 px-2 py-1 text-[11px] font-semibold bg-emerald-950/60 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-800/60 rounded-lg transition-colors flex items-center gap-1"
                                >
                                  <CalendarPlus className="w-3 h-3" />
                                  <span>+30ي</span>
                                </button>
                              </div>
                            </td>

                            {/* 4. Professional Proxy Server Card Cell + Instant Regenerate Proxy Button */}
                            <td className="py-4 px-4 align-middle whitespace-nowrap">
                              <div
                                className={`inline-flex flex-col gap-2 bg-[#070A10] border rounded-xl px-3 py-2.5 min-w-[330px] max-w-[420px] transition-colors ${
                                  justRegeneratedId === client.id
                                    ? 'border-emerald-500/90 shadow-md shadow-emerald-950/50'
                                    : 'border-slate-800/90'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div
                                    className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold tabular-nums text-slate-100"
                                    dir="ltr"
                                  >
                                    <Server className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    <span>
                                      {proxyDetails.cleanHost}:{client.proxy_port}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {proxyDetails.subUser && (
                                      <span
                                        className="px-1.5 py-0.5 rounded-md bg-sky-950/60 border border-sky-800/60 text-[10px] font-mono text-sky-300"
                                        dir="ltr"
                                      >
                                        👤 {proxyDetails.subUser}
                                      </span>
                                    )}
                                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-800/60 text-[10px] font-mono font-bold text-emerald-300">
                                      {proxyDetails.countryCode || 'SY'} 🇸🇾
                                    </span>
                                  </div>
                                </div>

                                {/* Full Proxy Username Display + Instant Regenerate Button Right in Front */}
                                <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-800/80">
                                  <div
                                    className="flex-1 min-w-0 bg-[#0B0F19] border border-slate-800/90 rounded-lg px-2.5 py-1.5 font-mono text-[11px] overflow-x-auto scrollbar-none whitespace-nowrap"
                                    dir="ltr"
                                    title={proxyDetails.fullProxyUsername}
                                  >
                                    {renderProxyStringWithHighlightedSid(
                                      proxyDetails.fullProxyUsername,
                                      justRegeneratedId === client.id
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleCheckProxyIp(client)}
                                    disabled={checkingIpId === client.id || regeneratingId === client.id}
                                    title="فحص الـ IP الفعلي الحالي لهذا البروكسي من بوابة NodeMaven"
                                    className="px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-[#0B0F19] hover:bg-slate-800 text-sky-300 border border-slate-800 shrink-0 transition-colors"
                                  >
                                    {checkingIpId === client.id ? 'يفحص...' : 'فحص IP'}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleRegenerateProxy(client)}
                                    disabled={regeneratingId === client.id}
                                    title="إعادة توليد البروكسي مباشرة من NodeMaven وتفعيل IP جديد مع بقاء كلمة المرور كما هي"
                                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 shrink-0 border transition-all ${
                                      justRegeneratedId === client.id
                                        ? 'bg-emerald-600 border-emerald-400 text-white'
                                        : 'bg-emerald-950/70 hover:bg-emerald-600 text-emerald-300 hover:text-white border-emerald-800/70'
                                    }`}
                                  >
                                    <RefreshCw
                                      className={`w-3.5 h-3.5 ${
                                        regeneratingId === client.id ? 'animate-spin' : ''
                                      }`}
                                    />
                                    <span>
                                      {regeneratingId === client.id
                                        ? 'يتصل بـ NodeMaven...'
                                        : justRegeneratedId === client.id
                                        ? 'تغير البروكسي ✓'
                                        : 'إعادة توليد'}
                                    </span>
                                  </button>
                                </div>

                                {/* Live Verified Exit IP & ISP from NodeMaven Gateway */}
                                {verifiedIpMap[client.id]?.ok && verifiedIpMap[client.id]?.exit_ip && (
                                  <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-[11px]">
                                    <span className="text-emerald-300 font-medium">
                                      الـ IP الفعلي في NodeMaven:
                                    </span>
                                    <span className="font-mono font-bold text-white" dir="ltr">
                                      {verifiedIpMap[client.id].exit_ip} ·{' '}
                                      <span className="text-emerald-400 font-normal">
                                        {verifiedIpMap[client.id].city || 'SY'} (
                                        {verifiedIpMap[client.id].isp || 'ISP'})
                                      </span>
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* 5. Professional Device Lock Cell */}
                            <td className="py-4 px-4 align-middle whitespace-nowrap">
                              {boundDevice ? (
                                <div className="inline-flex items-center gap-2.5 bg-[#070A10] border border-sky-900/60 rounded-xl px-3 py-2">
                                  <div className="p-1.5 rounded-lg bg-sky-950/60 border border-sky-800/60 text-sky-400">
                                    <Fingerprint className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="text-xs font-semibold text-sky-300">
                                      مرتبط بجهاز
                                    </div>
                                    <div
                                      className="text-[10px] font-mono text-slate-400"
                                      dir="ltr"
                                      title={boundDevice}
                                    >
                                      {shortHwid}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleResetDevice(client)}
                                    title="فك قفل الجهاز للسماح بجهاز جديد"
                                    className="mr-1 px-2 py-1 rounded-lg bg-sky-950/70 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-800/60 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>فك القفل</span>
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-2 bg-[#070A10] border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-slate-400">
                                  <div className="p-1.5 rounded-lg bg-slate-800/70 text-emerald-400">
                                    <Smartphone className="w-3.5 h-3.5" />
                                  </div>
                                  <div>
                                    <div className="font-semibold text-slate-300 text-xs">
                                      متاح للربط
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      يرتبط بأول جهاز يتصل
                                    </div>
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* 6. Unified Activation & Management Toolbar */}
                            <td className="py-4 px-5 align-middle whitespace-nowrap text-left">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Copy Encrypted Happ Code */}
                                <button
                                  type="button"
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

                                {/* Share Customer QR + Message (Opens Android vs iPhone share modal) */}
                                <button
                                  type="button"
                                  onClick={() => handleRequestCustomerMessage(client)}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap border ${
                                    isMsgCopied
                                      ? 'bg-sky-950 border-sky-600 text-sky-300'
                                      : 'bg-[#070A10] hover:bg-slate-800 border-slate-800 text-slate-300'
                                  }`}
                                  title="مشاركة الباركود QR ونص رسالة الاشتراك مباشرة إلى واتساب أو أي تطبيق"
                                >
                                  {isMsgCopied ? (
                                    <Check className="w-3.5 h-3.5 text-sky-400" />
                                  ) : (
                                    <Share2 className="w-3.5 h-3.5 text-sky-400" />
                                  )}
                                  <span>مشاركة</span>
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
                                  title={
                                    client.is_active
                                      ? 'إيقاف اشتراك المشترك فوراً داخل تطبيق Happ'
                                      : 'إعادة تفعيل اشتراك المشترك'
                                  }
                                  className={`p-1.5 rounded-lg border transition-colors ${
                                    client.is_active
                                      ? 'bg-[#070A10] border-slate-800 text-emerald-400 hover:bg-rose-950/50 hover:text-rose-400 hover:border-rose-800/60'
                                      : 'bg-rose-950/40 border-rose-800/60 text-rose-400 hover:text-emerald-400 hover:bg-slate-800'
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
                        </React.Fragment>
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
                const boundDevice = client.registered_ip ? client.registered_ip.trim() : null;
                const proxyDetails = parseProxyDetails(client);

                const quotaMb = client.quota_mb && client.quota_mb > 0 ? client.quota_mb : 0;
                const usedMb = client.used_mb && client.used_mb >= 0 ? client.used_mb : 0;
                const remainingMb =
                  quotaMb > 0 ? Math.max(0, Number((quotaMb - usedMb).toFixed(1))) : 0;
                const usagePct =
                  quotaMb > 0 ? Math.min(100, Math.round((usedMb / quotaMb) * 100)) : 0;

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
                            <span className="text-rose-400 font-medium">موقوف في Happ</span>
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
                              : 'bg-rose-950/40 border-rose-800/60 text-rose-400'
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

                    {/* NodeMaven Quota & Consumption Bar Underneath Mobile Subscriber Header */}
                    <div className="bg-[#070A10] border border-slate-800/90 rounded-xl p-3 space-y-2">
                      {quotaMb > 0 ? (
                        <>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 flex items-center gap-1.5">
                              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                              <span>NodeMaven ({proxyDetails.subUser || client.username}):</span>
                            </span>
                            <span className="font-mono font-bold text-slate-100" dir="ltr">
                              {formatDataMb(usedMb)} / {formatDataMb(quotaMb)}
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                usagePct >= 90
                                  ? 'bg-rose-500'
                                  : usagePct >= 75
                                  ? 'bg-amber-400'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${usagePct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                            <span>
                              متبقي:{' '}
                              <strong className="text-emerald-400 font-mono" dir="ltr">
                                {formatDataMb(remainingMb)}
                              </strong>
                            </span>
                            <span className="font-mono tabular-nums">{usagePct}%</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                            <span>
                              {!nodeMavenConnected
                                ? `جاري جلب (${proxyDetails.subUser || client.username})...`
                                : proxyDetails.subUser &&
                                  nodeMavenMap[proxyDetails.subUser.toLowerCase()]
                                ? 'مفتوح في NodeMaven (بدون حد)'
                                : `اليوزر (${proxyDetails.subUser || client.username}) غير موجود في NodeMaven`}
                            </span>
                          </span>
                          <span className="text-[11px] font-mono text-amber-400">
                            {!nodeMavenConnected
                              ? '...'
                              : proxyDetails.subUser &&
                                nodeMavenMap[proxyDetails.subUser.toLowerCase()]
                              ? '∞'
                              : 'محذوف'}
                          </span>
                        </div>
                      )}

                      {/* Mobile Refill Quota + Smart Domain Tracker Buttons */}
                      <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => handleRefillTraffic(client)}
                          disabled={refillingId === client.id}
                          className={`py-1.5 px-2.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 border transition-colors ${
                            justRefilledId === client.id
                              ? 'bg-emerald-600 border-emerald-400 text-white'
                              : 'bg-emerald-950/70 hover:bg-emerald-600 text-emerald-300 hover:text-white border-emerald-800/60'
                          }`}
                        >
                          <RotateCcw
                            className={`w-3.5 h-3.5 ${
                              refillingId === client.id ? 'animate-spin' : ''
                            }`}
                          />
                          <span>
                            {refillingId === client.id
                              ? 'يعيد الملء...'
                              : justRefilledId === client.id
                              ? 'تم ملء الحصة ✓'
                              : 'إعادة ملء الحصة'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openTrafficTracker(client)}
                          className="py-1.5 px-2.5 rounded-lg text-[11px] font-bold bg-sky-950/70 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-800/60 flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Activity className="w-3.5 h-3.5" />
                          <span>تتبع الصرف وحظر</span>
                        </button>
                      </div>
                    </div>

                    {/* Mobile Proxy Name Display + Instant Regenerate Button */}
                    <div
                      className={`bg-[#070A10] border rounded-xl p-2.5 space-y-2 transition-colors ${
                        justRegeneratedId === client.id
                          ? 'border-emerald-500/90'
                          : 'border-slate-800/90'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                          <Server className="w-3.5 h-3.5 text-emerald-400" />
                          <span>اسم البروكسي (NodeMaven):</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCheckProxyIp(client)}
                            disabled={checkingIpId === client.id || regeneratingId === client.id}
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#0B0F19] text-sky-300 border border-slate-800"
                          >
                            {checkingIpId === client.id ? 'يفحص...' : 'فحص IP'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRegenerateProxy(client)}
                            disabled={regeneratingId === client.id}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border transition-all ${
                              justRegeneratedId === client.id
                                ? 'bg-emerald-600 border-emerald-400 text-white'
                                : 'bg-emerald-950/70 hover:bg-emerald-600 text-emerald-300 hover:text-white border-emerald-800/70'
                            }`}
                          >
                            <RefreshCw
                              className={`w-3 h-3 ${
                                regeneratingId === client.id ? 'animate-spin' : ''
                              }`}
                            />
                            <span>
                              {regeneratingId === client.id
                                ? 'يتصل بـ NodeMaven...'
                                : justRegeneratedId === client.id
                                ? 'تغير البروكسي ✓'
                                : 'إعادة توليد'}
                            </span>
                          </button>
                        </div>
                      </div>
                      <div
                        className="bg-[#0B0F19] border border-slate-800/90 rounded-lg px-2.5 py-1.5 font-mono text-[11px] overflow-x-auto whitespace-nowrap"
                        dir="ltr"
                      >
                        {renderProxyStringWithHighlightedSid(
                          proxyDetails.fullProxyUsername,
                          justRegeneratedId === client.id
                        )}
                      </div>
                      {verifiedIpMap[client.id]?.ok && verifiedIpMap[client.id]?.exit_ip && (
                        <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-[11px]">
                          <span className="text-emerald-300 font-medium">IP الفعلي:</span>
                          <span className="font-mono font-bold text-white" dir="ltr">
                            {verifiedIpMap[client.id].exit_ip} ·{' '}
                            <span className="text-emerald-400 font-normal">
                              {verifiedIpMap[client.id].city || 'SY'} (
                              {verifiedIpMap[client.id].isp || 'ISP'})
                            </span>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Redesigned Mobile Info Grid (Expiry, Proxy, Device) */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-[#070A10] border border-slate-800/80 rounded-xl p-2.5">
                        <span className="text-slate-500 text-[11px] block">الانتهاء</span>
                        <span
                          className="font-mono font-semibold tabular-nums text-slate-100 mt-0.5 block"
                          dir="ltr"
                        >
                          {client.expiry_date}
                        </span>
                      </div>
                      <div className="bg-[#070A10] border border-slate-800/80 rounded-xl p-2.5">
                        <span className="text-slate-500 text-[11px] block">
                          الخادم {proxyDetails.subUser ? `(${proxyDetails.subUser})` : ''}
                        </span>
                        <span
                          className="font-mono font-semibold tabular-nums text-slate-100 mt-0.5 block truncate"
                          dir="ltr"
                        >
                          {proxyDetails.cleanHost}:{client.proxy_port}
                        </span>
                      </div>
                      <div className="bg-[#070A10] border border-slate-800/80 rounded-xl p-2.5">
                        <span className="text-slate-500 text-[11px] block">الجهاز</span>
                        {boundDevice ? (
                          <button
                            type="button"
                            onClick={() => handleResetDevice(client)}
                            className="text-sky-400 font-semibold mt-0.5 inline-flex items-center gap-1"
                          >
                            <span>مقفل (فك)</span>
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-emerald-400 font-medium mt-0.5 block">
                            متاح للربط
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleCopyHappCode(client)}
                        className="py-2 px-3 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5"
                      >
                        {isHappCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{isHappCopied ? 'تم النسخ' : 'كود Happ'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRequestCustomerMessage(client)}
                        className="py-2 px-3 rounded-xl text-xs font-semibold bg-[#070A10] border border-slate-800 text-slate-200 flex items-center justify-center gap-1.5"
                      >
                        {isMsgCopied ? (
                          <Check className="w-3.5 h-3.5 text-sky-400" />
                        ) : (
                          <Share2 className="w-3.5 h-3.5 text-sky-400" />
                        )}
                        <span>مشاركة</span>
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

      {/* Share Modal When Clicking "مشاركة" (Shares QR Code Image + Subscription Text) */}
      {messagePlatformClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm bg-[#0E131F] border border-slate-800/90 rounded-2xl shadow-2xl overflow-hidden my-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-bold text-white">
                  مشاركة اشتراك ({messagePlatformClient.username})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMessagePlatformClient(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Live QR Code Preview inside Share Modal */}
              <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#070A10] border border-slate-800/80">
                {happCache[messagePlatformClient.username] ? (
                  <div className="bg-white p-2 rounded-xl">
                    <img
                      src={getQrCodeImageUrl(happCache[messagePlatformClient.username], 220)}
                      alt={messagePlatformClient.username}
                      className="w-36 h-36 object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-36 h-36 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <span className="mt-2 text-[11px] text-slate-400">
                  سيتم إرفاق <strong className="text-white">صورة الـ QR Code + نص رسالة التفعيل</strong> معاً
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {/* Share for Android */}
                <div className="p-3 rounded-xl bg-[#070A10] border border-slate-800 space-y-2">
                  <button
                    type="button"
                    disabled={sharingPlatformLoading !== null}
                    onClick={() => handleConfirmSharePlatformMessage('android', 'native')}
                    className="w-full p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-between transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <Download className="w-4 h-4 shrink-0" />
                      <div className="text-right">
                        <div className="text-xs font-bold">
                          {sharingPlatformLoading === 'android'
                            ? 'جاري تجهيز الباركود والرسالة...'
                            : 'مشاركة لمشترك أندرويد (QR + الرسالة)'}
                        </div>
                        <div className="text-[10px] text-emerald-100/80">
                          يرسل صورة الباركود + رابط APK المباشر + الكود المشفر
                        </div>
                      </div>
                    </div>
                    <Share2 className="w-4 h-4 shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmSharePlatformMessage('android', 'whatsapp_link')}
                    className="w-full py-1.5 px-3 rounded-lg bg-[#0E131F] hover:bg-slate-800 border border-slate-800 text-[11px] font-medium text-emerald-300 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>إرسال النص مباشرة عبر واتساب ويب (WhatsApp)</span>
                  </button>
                </div>

                {/* Share for iPhone */}
                <div className="p-3 rounded-xl bg-[#070A10] border border-slate-800 space-y-2">
                  <button
                    type="button"
                    disabled={sharingPlatformLoading !== null}
                    onClick={() => handleConfirmSharePlatformMessage('ios', 'native')}
                    className="w-full p-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white flex items-center justify-between transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <Smartphone className="w-4 h-4 shrink-0" />
                      <div className="text-right">
                        <div className="text-xs font-bold">
                          {sharingPlatformLoading === 'ios'
                            ? 'جاري تجهيز الباركود والرسالة...'
                            : 'مشاركة لمشترك آيفون (QR + الرسالة)'}
                        </div>
                        <div className="text-[10px] text-sky-100/80">
                          يرسل صورة الباركود + رابط App Store + الكود المشفر
                        </div>
                      </div>
                    </div>
                    <Share2 className="w-4 h-4 shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmSharePlatformMessage('ios', 'whatsapp_link')}
                    className="w-full py-1.5 px-3 rounded-lg bg-[#0E131F] hover:bg-slate-800 border border-slate-800 text-[11px] font-medium text-sky-300 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>إرسال النص مباشرة عبر واتساب ويب (WhatsApp)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Generate Subscriber Modal: Creates Brand-New Sub-User in NodeMaven Parent Dashboard + Subscriber in Local Dashboard */}
      {autoGenModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-[#0E131F] border border-slate-800/90 rounded-2xl shadow-2xl overflow-hidden my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-bold text-white">
                  توليد بروكسي سوري جديد في اللوحة الأم (NodeMaven) + مشترك في لوحتك
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAutoGenModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmAutoGenerateSubscriber} className="p-6 space-y-4">
              {autoGenError && (
                <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs">
                  {autoGenError}
                </div>
              )}

              {/* 1. NodeMaven Parent Dashboard Proxy Prefix */}
              <div className="p-4 rounded-xl bg-[#070A10] border border-amber-800/50 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-amber-400" />
                    <span>1. بادئة اسم البروكسي الذي سيُنشأ في اللوحة الأم (NodeMaven)</span>
                  </label>
                  <span className="text-[10px] font-mono text-slate-400" dir="ltr">
                    ≥ 9 chars
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nmProxyPrefix}
                    onChange={(e) => handleNmProxyPrefixChange(e.target.value)}
                    placeholder="Ammarmedia أو Alishop"
                    dir="ltr"
                    className="flex-1 bg-[#0E131F] border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2 text-sm font-mono font-bold text-white placeholder-slate-600 focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => handleNmProxyPrefixChange('Ammarmedia')}
                    className="px-2.5 py-2 rounded-xl bg-[#0E131F] hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-slate-300"
                    dir="ltr"
                  >
                    Ammarmedia
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNmProxyPrefixChange('Alishop')}
                    className="px-2.5 py-2 rounded-xl bg-[#0E131F] hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-amber-300"
                    dir="ltr"
                  >
                    Alishop
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                  <span className="text-slate-400">اليوزر الجديد الذي سيُنشأ في اللوحة الأم:</span>
                  <span
                    className="font-mono text-sm font-extrabold text-amber-400 bg-amber-950/40 border border-amber-700/50 px-2.5 py-0.5 rounded-lg"
                    dir="ltr"
                  >
                    {previewNodeMavenSubUser}
                  </span>
                </div>

                <div
                  className="text-[11px] font-mono text-slate-400 bg-[#0B0F19] border border-slate-800/80 rounded-lg px-2.5 py-1.5 overflow-x-auto whitespace-nowrap"
                  dir="ltr"
                >
                  <span className="text-amber-300 font-bold">{previewNodeMavenSubUser}</span>
                  <span className="text-slate-400">
                    -country-sy-sid-xxxxxxxxxxxxx-filter-medium-norotate-true
                  </span>
                </div>
              </div>

              {/* 2. Subscriber Name in Our Local Dashboard */}
              <div className="p-4 rounded-xl bg-[#070A10] border border-emerald-800/50 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-300">
                    2. اسم المشترك الذي سيُضاف لديك في اللوحة
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCustomSubscriberName(previewNodeMavenSubUser)}
                      className="px-2 py-0.5 rounded bg-emerald-950/70 hover:bg-emerald-800 text-[11px] font-semibold text-emerald-300 border border-emerald-700/60"
                    >
                      مطابقة مع اسم البروكسي
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSubscriberPrefixGenerate(subscriberPrefix)}
                      className="px-2 py-0.5 rounded bg-[#0E131F] hover:bg-slate-800 text-[11px] font-semibold text-sky-300 border border-slate-700 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>توليد رقم تالي</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <span className="block text-[11px] text-slate-400 mb-1">
                      الاسم النهائي للمشترك في لوحتك:
                    </span>
                    <input
                      type="text"
                      value={customSubscriberName}
                      onChange={(e) => setCustomSubscriberName(e.target.value)}
                      placeholder="alishop1 أو اسم الزبون"
                      dir="ltr"
                      className="w-full bg-[#0E131F] border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-sm font-mono font-bold text-white placeholder-slate-600 focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400 mb-1">
                      بادئة التوليد السريع:
                    </span>
                    <input
                      type="text"
                      value={subscriberPrefix}
                      onChange={(e) => handleSubscriberPrefixGenerate(e.target.value)}
                      placeholder="alishop"
                      dir="ltr"
                      className="w-full bg-[#0E131F] border border-slate-800 focus:border-sky-500 rounded-xl px-2.5 py-2 text-xs font-mono text-sky-300 placeholder-slate-600 focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* 3. NodeMaven Quota MB & Subscription Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    الباقة في اللوحة الأم NodeMaven (MB)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      value={autoGenQuotaMb}
                      onChange={(e) => setAutoGenQuotaMb(e.target.value)}
                      dir="ltr"
                      className="w-20 bg-[#070A10] border border-slate-800 focus:border-emerald-500 rounded-xl px-2.5 py-2 text-xs font-mono font-bold text-white focus:outline-none"
                    />
                    {[50, 100, 500].map((mb) => (
                      <button
                        key={mb}
                        type="button"
                        onClick={() => setAutoGenQuotaMb(String(mb))}
                        className={`px-2 py-2 rounded-xl text-[11px] font-mono font-semibold border transition-colors ${
                          Number(autoGenQuotaMb) === mb
                            ? 'bg-emerald-950/70 border-emerald-600 text-emerald-300'
                            : 'bg-[#070A10] border-slate-800 text-slate-400 hover:text-white'
                        }`}
                        dir="ltr"
                      >
                        {mb}MB
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    مدة صلاحية الاشتراك
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { label: '7ي', days: 7 },
                      { label: '30ي', days: 30 },
                      { label: '90ي', days: 90 },
                      { label: 'سنة', days: 365 },
                    ].map((preset) => (
                      <button
                        key={preset.days}
                        type="button"
                        onClick={() => setAutoGenDays(preset.days)}
                        className={`py-2 px-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                          autoGenDays === preset.days
                            ? 'bg-emerald-950/70 border-emerald-600 text-emerald-300'
                            : 'bg-[#070A10] border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setAutoGenModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800/70 hover:bg-slate-800 rounded-xl transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={autoGenerating}
                  className="px-5 py-2.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {autoGenerating
                      ? 'جاري الإنشاء في NodeMaven واللوحة...'
                      : 'إنشاء البروكسي في اللوحة الأم + إضافة المشترك'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

      {/* Smart Traffic & Domain Tracker Modal */}
      <SmartTrafficTrackerModal
        isOpen={trackerModalOpen}
        initialClient={trackerClient}
        allClients={clients}
        onClose={() => setTrackerModalOpen(false)}
        onShowToast={showToast}
      />

      {/* PWA Install Guide Modal (iOS Safari / Mobile Browser Fallback) */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div
            className="w-full max-w-md bg-[#0E131F] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            dir="rtl"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80">
              <div className="flex items-center gap-3">
                <img
                  src="/pwa-192x192.png"
                  alt="VPN ALISHOP"
                  className="w-10 h-10 rounded-xl border border-emerald-500/40"
                />
                <div>
                  <h3 className="text-sm font-bold text-white">تثبيت تطبيق VPN ALISHOP</h3>
                  <p className="text-[11px] text-slate-400">
                    ثبّت لوحة التحكم كتطبيق هاتف بشعار VPN ALISHOP
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-300">
              {isIOS ? (
                <div className="space-y-3 bg-[#070A10] border border-slate-800 rounded-xl p-4">
                  <div className="font-bold text-emerald-400">خطوات التثبيت على آيفون (Safari):</div>
                  <ol className="space-y-2 list-decimal list-inside text-slate-200 leading-relaxed">
                    <li>
                      اضغط على زر <strong>المشاركة (Share)</strong> في شريط متصفح سفاري بالأسفل.
                    </li>
                    <li>
                      اختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
                    </li>
                    <li>
                      اضغط <strong>إضافة (Add)</strong> ليظهر تطبيق <strong>VPN ALISHOP</strong> بشعاره الرسمي على شاشة هاتفك.
                    </li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-3 bg-[#070A10] border border-slate-800 rounded-xl p-4">
                  <div className="font-bold text-emerald-400">
                    خطوات التثبيت على الهاتف (Chrome / Safari):
                  </div>
                  <ol className="space-y-2 list-decimal list-inside text-slate-200 leading-relaxed">
                    <li>
                      افتح رابط اللوحة في متصفح <strong>Chrome</strong> (أندرويد) أو <strong>Safari</strong> (آيفون).
                    </li>
                    <li>
                      اضغط على قائمة المتصفح <strong>(⋮)</strong> ثم اختر <strong>تثبيت التطبيق (Install App)</strong> أو <strong>إضافة إلى الشاشة الرئيسية</strong>.
                    </li>
                    <li>
                      سيتم تثبيت <strong>VPN ALISHOP</strong> كتطبيق مستقل بشعاره الرسمي.
                    </li>
                  </ol>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
                >
                  حسناً، فهمت
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
