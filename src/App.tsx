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
  Globe,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import {
  supabase,
  ProxyClient,
  ClientComputedStatus,
  ServiceMode,
  ExternalV2RaySource,
  isSystemConfigUsername,
  getCountryInfo,
  getClientStatusInfo,
  addDaysToDateString,
  fetchHappEncryptedLink,
  normalizeProxyClient,
  packProxyHostWithAuth,
  formatDataMb,
  parseProxyDetails,
  regenerateNodeMavenProxyUsername,
  regenerateProxyUsernameForMode,
  buildCustomerActivationMessage,
  fetchExternalV2RaySources,
  probeExternalV2RaySourceApi,
  getQrCodeImageUrl,
  HAPP_IOS_URL,
  HAPP_ANDROID_APK_URL,
} from './lib/supabase';
import { ClientModal } from './components/ClientModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { QrCodeModal, copyToClipboardSync, shareQrAndMessage } from './components/QrCodeModal';
import { SmartTrafficTrackerModal } from './components/SmartTrafficTrackerModal';
import { ExternalV2RaySourcesModal } from './components/ExternalV2RaySourcesModal';
import { AutoGenerateModal, VerifiedIpResult } from './components/AutoGenerateModal';
import { usePWAInstall } from './hooks/usePWAInstall';

const LOCAL_DELTA_STORAGE_KEY = 'shamcash_admin_local_delta_v1';

type FilterTab = 'all' | ClientComputedStatus | 'expiring_soon';
type ModeFilterTab = 'all' | ServiceMode;

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
  const [modeFilter, setModeFilter] = useState<ModeFilterTab>('all');
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

  // External V2Ray Sources state
  const [externalSources, setExternalSources] = useState<ExternalV2RaySource[]>([]);
  const [externalSourcesModalOpen, setExternalSourcesModalOpen] = useState<boolean>(false);
  const [probingExternalId, setProbingExternalId] = useState<string | null>(null);

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

  // Auto-generate subscriber modal state (Supports ShamCash SY, Custom Residential Proxy, and External V2Ray VPN)
  const [autoGenModalOpen, setAutoGenModalOpen] = useState<boolean>(false);

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

  const syncExternalSources = useCallback(async (refresh = false) => {
    const res = await fetchExternalV2RaySources(refresh);
    if (res.success) {
      setExternalSources(res.sources);
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
          syncExternalSources(false),
        ]);

        if (!error && data) {
          const normalized = (data as ProxyClient[])
            .filter((row) => !isSystemConfigUsername(row.username))
            .map(normalizeProxyClient);
          setRemoteClients(normalized);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [syncNodeMavenUsage, syncExternalSources]
  );

  useEffect(() => {
    fetchClients();
    const timer = setInterval(() => {
      syncNodeMavenUsage();
    }, 20000);
    return () => clearInterval(timer);
  }, [fetchClients, syncNodeMavenUsage]);

  const externalSourceMap = useMemo(() => {
    const map: Record<string, ExternalV2RaySource> = {};
    for (const src of externalSources) {
      map[src.id] = src;
    }
    return map;
  }, [externalSources]);

  const nearLimitExternalSources = useMemo(() => {
    return externalSources.filter((s) => Boolean(s.userinfo?.near_limit));
  }, [externalSources]);

  const clients = useMemo(() => {
    const map = new Map<string, ProxyClient>();
    for (const c of remoteClients) {
      if (isSystemConfigUsername(c.username)) continue;
      if (!localDelta.deletedIds.includes(c.id)) {
        map.set(c.id, c);
      }
    }
    for (const [id, c] of Object.entries(localDelta.upserted)) {
      if (isSystemConfigUsername(c.username)) continue;
      if (!localDelta.deletedIds.includes(id)) {
        map.set(id, c);
      }
    }
    return Array.from(map.values())
      .map((client) => {
        const mode = client.service_mode || 'shamcash_sy';
        const isNodeMavenBacked =
          mode === 'shamcash_sy' ||
          (mode === 'residential_custom' && (client.proxy_provider || 'nodemaven') === 'nodemaven');
        if (!isNodeMavenBacked) return client;

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

  const modeCounts = useMemo(() => {
    let shamcash_sy = 0;
    let residential_custom = 0;
    let external_v2ray = 0;
    for (const c of clients) {
      const m = c.service_mode || 'shamcash_sy';
      if (m === 'residential_custom') residential_custom++;
      else if (m === 'external_v2ray') external_v2ray++;
      else shamcash_sy++;
    }
    return { shamcash_sy, residential_custom, external_v2ray };
  }, [clients]);

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const info = getClientStatusInfo(client);
      if (statusFilter === 'expiring_soon') {
        if (info.status !== 'active' || !info.isExpiringSoon) return false;
      } else if (statusFilter !== 'all' && info.status !== statusFilter) {
        return false;
      }

      const clientMode = client.service_mode || 'shamcash_sy';
      if (modeFilter !== 'all' && clientMode !== modeFilter) {
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
        const country = getCountryInfo(client.country_code);
        const matchCountry =
          country.code.toLowerCase().includes(q) ||
          country.nameAr.toLowerCase().includes(q) ||
          country.nameEn.toLowerCase().includes(q);
        const extSrc = client.external_source_id ? externalSourceMap[client.external_source_id] : null;
        const matchExtSrc = extSrc ? extSrc.name.toLowerCase().includes(q) : false;
        return (
          matchUser ||
          matchIp ||
          matchPort ||
          matchRegIp ||
          matchProxyUser ||
          matchCountry ||
          matchExtSrc
        );
      }
      return true;
    });
  }, [clients, statusFilter, modeFilter, searchQuery, externalSourceMap]);

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

  // Open Auto-Generate Subscriber Modal
  const openAutoGenModal = () => {
    setAutoGenModalOpen(true);
  };

  // Save Client (Add / Edit Modal & Auto-Generate Modal)
  const handleSaveClient = async (
    clientData: Omit<ProxyClient, 'id' | 'created_at' | 'updated_at'>,
    id?: string
  ): Promise<ProxyClient | null> => {
    const packedHost = packProxyHostWithAuth(
      clientData.proxy_host,
      clientData.proxy_username,
      clientData.proxy_password,
      clientData.quota_mb,
      clientData.used_mb,
      {
        service_mode: clientData.service_mode || 'shamcash_sy',
        proxy_provider: clientData.proxy_provider || 'nodemaven',
        country_code: clientData.country_code,
        external_source_id: clientData.external_source_id,
        external_custom_url: clientData.external_custom_url,
      }
    );
    const dbPayload = {
      username: clientData.username,
      is_active: clientData.is_active,
      expiry_date: clientData.expiry_date,
      proxy_host: packedHost,
      proxy_port: clientData.proxy_port,
    };

    if (!id) {
      const { data, error } = await supabase
        .from('proxy_clients')
        .insert([{ ...dbPayload, registered_ip: null }])
        .select();

      if (!error && data && data.length > 0) {
        const created = normalizeProxyClient(data[0] as ProxyClient);
        setRemoteClients((prev) => [created, ...prev]);
        syncNodeMavenUsage();
        showToast(`تمت إضافة ${created.username}`);
        return created;
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
      return fallbackClient;
    } else {
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
        return updated;
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
      return updatedFallback;
    }
  };

  // Wrapper for AutoGenerateModal to persist subscriber + record live verified exit IP immediately
  const handleAutoGenerateCreateClient = async (
    clientData: Omit<ProxyClient, 'id' | 'created_at' | 'updated_at'>,
    verifiedIp?: VerifiedIpResult
  ) => {
    const created = await handleSaveClient(clientData);
    if (created && verifiedIp?.ok && verifiedIp.exit_ip) {
      setVerifiedIpMap((prev) => ({
        ...prev,
        [created.id]: verifiedIp,
      }));
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

  // Check Live Exit IP on Proxy Gateway
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
              `عنوان الـ IP الفعلي: ${data.exit_ip} (${data.city || 'SY'} - ${data.isp || ''})`
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

  // Refill / Reset Traffic Quota directly in Master Server + Local Dashboard
  const handleRefillTraffic = async (client: ProxyClient) => {
    if (refillingId === client.id) return;
    setRefillingId(client.id);

    const quotaToRefill = client.quota_mb && client.quota_mb > 0 ? client.quota_mb : 50;
    const isDataImpulse =
      client.service_mode === 'residential_custom' && client.proxy_provider === 'dataimpulse';

    if (isDataImpulse) {
      try {
        const packedHost = packProxyHostWithAuth(
          client.proxy_host,
          client.proxy_username,
          client.proxy_password,
          quotaToRefill,
          0,
          {
            service_mode: client.service_mode,
            proxy_provider: client.proxy_provider,
            country_code: client.country_code,
          }
        );
        const { data, error } = await supabase
          .from('proxy_clients')
          .update({
            proxy_host: packedHost,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', client.id)
          .select();

        if (!error && data && data.length > 0) {
          const updated = normalizeProxyClient(data[0] as ProxyClient);
          setRemoteClients((prev) => prev.map((c) => (c.id === client.id ? updated : c)));
        } else {
          setRemoteClients((prev) =>
            prev.map((c) =>
              c.id === client.id ? { ...c, quota_mb: quotaToRefill, used_mb: 0, is_active: true } : c
            )
          );
        }
        setJustRefilledId(client.id);
        setTimeout(() => {
          setJustRefilledId((prev) => (prev === client.id ? null : prev));
        }, 3500);
        showToast(`تم تصفير وإعادة ملء حصة البيانات لـ ${client.username} (0 / ${quotaToRefill}MB)`);
      } finally {
        setRefillingId(null);
      }
      return;
    }

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
              service_mode: client.service_mode || 'shamcash_sy',
              proxy_provider: client.proxy_provider || 'nodemaven',
              country_code: client.country_code || 'SY',
              external_source_id: client.external_source_id || null,
              external_custom_url: client.external_custom_url || null,
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
              `تم إعادة ملء وتصفير حصة البيانات في الخادم الرئيسي لـ ${client.username} (0 / ${quotaToRefill}MB)`
            );
            syncNodeMavenUsage();
            return;
          }
        } catch {
          // try next endpoint
        }
      }
      showToast('تعذر إعادة ملء الحصة حالياً، تأكد من تسجيل المعرف الفرعي في الخادم الرئيسي');
    } finally {
      setRefillingId(null);
    }
  };

  // Probe External V2Ray Source directly from subscriber card
  const handleProbeClientExternalSource = async (sourceId: string) => {
    if (!sourceId || probingExternalId) return;
    setProbingExternalId(sourceId);
    try {
      const res = await probeExternalV2RaySourceApi({ source_id: sourceId });
      if (res.sources) {
        setExternalSources(res.sources);
      }
      if (res.success) {
        const ui = res.probe?.userinfo;
        if (ui && ui.total_mb && ui.total_mb > 0) {
          showToast(
            `تحديث المصدر: ${formatDataMb(ui.used_mb || 0)} / ${formatDataMb(ui.total_mb)} (${ui.usage_pct || 0}%)`
          );
        } else {
          showToast(`المصدر نشط · ${res.probe?.server_count || 0} خادم متاح`);
        }
      } else {
        showToast(res.probe?.error_msg || res.error || 'تعذر فحص المصدر الخارجي');
      }
    } finally {
      setProbingExternalId(null);
    }
  };

  // Open Smart Traffic Tracker Modal (either for a single subscriber or global radar)
  const openTrafficTracker = (client: ProxyClient | null = null) => {
    setTrackerClient(client);
    setTrackerModalOpen(true);
  };

  // Regenerate Proxy Session Username via Live Gateway Verification
  const handleRegenerateProxy = async (client: ProxyClient) => {
    if (regeneratingId === client.id) return;
    setRegeneratingId(client.id);

    const previousIp = verifiedIpMap[client.id]?.exit_ip || '';
    const clientMode = client.service_mode || 'shamcash_sy';
    const clientProvider = client.proxy_provider || 'nodemaven';
    const clientCountry = client.country_code || 'SY';

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
              service_mode: clientMode,
              proxy_provider: clientProvider,
              country_code: clientCountry,
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
      const nmSub =
        clientProvider === 'nodemaven' && subPrefix ? nodeMavenMap[subPrefix] : undefined;

      const newProxyUsername =
        apiResult?.new_proxy_username ||
        (clientMode === 'residential_custom'
          ? regenerateProxyUsernameForMode(
              clientProvider,
              client.proxy_username,
              nmSub?.proxy_username || client.username,
              clientCountry
            ).newProxyUsername
          : regenerateNodeMavenProxyUsername(
              client.proxy_username,
              nmSub?.proxy_username || client.username
            ).newProxyUsername);

      const officialPassword =
        apiResult?.proxy_password || nmSub?.proxy_password || client.proxy_password;

      const packedHost =
        apiResult?.packed_host ||
        packProxyHostWithAuth(
          client.proxy_host,
          newProxyUsername,
          officialPassword,
          client.quota_mb,
          client.used_mb,
          {
            service_mode: clientMode,
            proxy_provider: clientProvider,
            country_code: clientCountry,
          }
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
          `تم توليد جلسة بروكسي جديدة · الـ IP الجديد: ${apiResult.live_check.exit_ip} (${apiResult.live_check.city || clientCountry})`
        );
      } else {
        showToast(`تم إعادة توليد جلسة البروكسي ومزامنتها لـ ${client.username}`);
      }
    } finally {
      setRegeneratingId(null);
    }
  };

  const renderProxyStringWithHighlightedSid = (rawUsername: string, isHighlighted: boolean) => {
    if (!rawUsername) {
      return <span className="text-slate-500">بدون معرف جلسة</span>;
    }
    const nmMatch = rawUsername.match(/^(.*?-sid-)([a-zA-Z0-9]+)(.*)$/i);
    if (nmMatch) {
      const [, beforeSid, sidValue, afterSid] = nmMatch;
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
    }
    const diMatch = rawUsername.match(/^(.*?;sessid\.)([a-zA-Z0-9]+)(.*)$/i);
    if (diMatch) {
      const [, beforeSid, sidValue, afterSid] = diMatch;
      return (
        <>
          <span className="text-slate-300">{beforeSid}</span>
          <span
            className={`px-1 py-0.5 rounded font-bold transition-colors ${
              isHighlighted
                ? 'bg-sky-400 text-slate-950'
                : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
            }`}
          >
            {sidValue}
          </span>
          <span className="text-slate-400">{afterSid}</span>
        </>
      );
    }
    return <span className="text-slate-200">{rawUsername}</span>;
  };

  const renderPackageAndCountryBadge = (client: ProxyClient) => {
    const mode = client.service_mode || 'shamcash_sy';
    const country = getCountryInfo(
      client.country_code || (mode === 'external_v2ray' ? 'AUTO' : 'SY')
    );

    if (mode === 'residential_custom') {
      const providerLabel =
        (client.proxy_provider || 'nodemaven') === 'dataimpulse' ? 'DataImpulse' : 'NodeMaven';
      return (
        <div className="flex items-center flex-wrap gap-1">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-950/75 border border-sky-700/60 text-[10px] font-bold text-sky-300 whitespace-nowrap">
            <Globe className="w-3 h-3 text-sky-400 shrink-0" />
            <span>بروكسي منزلي</span>
            <span className="text-sky-500/70">·</span>
            <span>
              {country.flag} {country.nameAr} ({country.code})
            </span>
          </span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800/90 border border-slate-700/80 text-[9px] font-mono font-semibold text-slate-300">
            {providerLabel}
          </span>
        </div>
      );
    }

    if (mode === 'external_v2ray') {
      return (
        <div className="flex items-center flex-wrap gap-1">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-950/75 border border-violet-700/60 text-[10px] font-bold text-violet-300 whitespace-nowrap">
            <Zap className="w-3 h-3 text-violet-400 shrink-0" />
            <span>VPN عام V2Ray</span>
            <span className="text-violet-500/70">·</span>
            <span>
              {country.flag} {country.nameAr}
            </span>
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center flex-wrap gap-1">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/75 border border-emerald-700/60 text-[10px] font-bold text-emerald-300 whitespace-nowrap">
          <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
          <span>شام كاش</span>
          <span className="text-emerald-600/80">·</span>
          <span>🇸🇾 سوريا (SY)</span>
        </span>
      </div>
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
      {/* Top Corporate Header: Clean 2-Row Layout on Mobile, Symmetrical 3-Zone Enterprise Navbar on Desktop */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#070A10]/95 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-3 sm:px-6 py-2.5 sm:py-0 sm:h-[68px] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          {/* Top Row on Mobile / Zone 1 on Desktop: Brand Identity + Mobile Refresh */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setStatusFilter('all');
                setModeFilter('all');
              }}
              className="flex items-center gap-2.5 sm:gap-3 whitespace-nowrap shrink-0 min-w-0"
            >
              <svg
                className="w-8 h-8 sm:w-9 sm:h-9 shrink-0"
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
                  className="fill-emerald-950 stroke-emerald-500/60"
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
              <div className="flex flex-col min-w-0">
                <span className="text-sm sm:text-base font-extrabold tracking-wide sm:tracking-wider text-white font-mono truncate">
                  VPN ALISHOP
                </span>
                <span className="text-[10px] text-slate-400 font-medium truncate">
                  إدارة اشتراكات شام كاش والبروكسي و VPN
                </span>
              </div>
            </a>

            {/* Mobile-only compact Sync button on top-left */}
            <button
              type="button"
              onClick={() => fetchClients(true)}
              disabled={refreshing}
              className="sm:hidden h-8 px-2.5 rounded-lg bg-[#0E131F] hover:bg-slate-800/80 border border-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 text-[11px] font-semibold shrink-0"
              title="مزامنة وتحديث البيانات"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : 'text-emerald-400'}`} />
              <span>تحديث</span>
            </button>
          </div>

          {/* Mobile-only Primary Actions Row (Symmetrical 2 Equal Full-Width Buttons) */}
          <div className="grid grid-cols-2 gap-2 sm:hidden">
            <button
              type="button"
              onClick={openAutoGenModal}
              className="h-9 px-3 text-xs font-bold text-amber-300 hover:text-white bg-amber-950/75 hover:bg-amber-600 border border-amber-700/70 rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
              title="التوليد التلقائي السريع للمشتركين (شام كاش / بروكسي منزلي / VPN عام V2Ray)"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>توليد تلقائي</span>
            </button>

            <button
              type="button"
              onClick={openAddModal}
              className="h-9 px-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm shadow-emerald-950"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>مشترك جديد</span>
            </button>
          </div>

          {/* Zone 2: Unified Enterprise Utility Bar (Desktop XL Only) */}
          <div className="hidden xl:flex items-center gap-1.5 bg-[#0C101B] border border-slate-800/90 rounded-xl p-1">
            <button
              type="button"
              onClick={handleCopyAndroidLink}
              className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                copiedAndroidApp
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              {copiedAndroidApp ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Download className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>{copiedAndroidApp ? 'تم نسخ أندرويد' : 'تطبيق أندرويد (Happ)'}</span>
            </button>

            <span className="w-px h-4 bg-slate-800" aria-hidden="true" />

            <button
              type="button"
              onClick={handleCopyIosLink}
              className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                copiedIosApp
                  ? 'bg-sky-950 text-sky-300 border border-sky-700/60'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              {copiedIosApp ? (
                <Check className="w-3.5 h-3.5 text-sky-400" />
              ) : (
                <Smartphone className="w-3.5 h-3.5 text-sky-400" />
              )}
              <span>{copiedIosApp ? 'تم نسخ آيفون' : 'تطبيق آيفون (Happ)'}</span>
            </button>

            <span className="w-px h-4 bg-slate-800" aria-hidden="true" />

            <button
              type="button"
              onClick={handleExportCsv}
              className="h-8 px-3 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>نسخة احتياطية CSV</span>
            </button>

            {!isInstalled && (
              <>
                <span className="w-px h-4 bg-slate-800" aria-hidden="true" />
                <button
                  type="button"
                  onClick={promptInstall}
                  className="h-8 px-3 rounded-lg text-xs font-semibold text-emerald-300 hover:text-white hover:bg-emerald-600/30 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>تثبيت النظام</span>
                </button>
              </>
            )}

            <span className="w-px h-4 bg-slate-800" aria-hidden="true" />

            <button
              type="button"
              onClick={() => fetchClients(true)}
              disabled={refreshing}
              className="h-8 px-2.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors flex items-center gap-1.5"
              title="مزامنة وتحديث البيانات من الخادم الرئيسي"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : 'text-emerald-400'}`} />
              <span>تحديث</span>
            </button>
          </div>

          {/* Zone 3: Primary Action Toolbar (Tablet & Desktop sm+) */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setExternalSourcesModalOpen(true)}
              className="hidden lg:flex h-9 px-3 text-xs font-bold text-violet-300 hover:text-white bg-violet-950/70 hover:bg-violet-600 border border-violet-700/70 rounded-xl transition-colors items-center gap-1.5 whitespace-nowrap shrink-0 relative"
              title="إدارة مصادر VPN عام (سيرفرات V2Ray / VLESS / Trojan الخارجية)"
            >
              <Zap className="w-4 h-4 text-violet-400 shrink-0" />
              <span>مصادر V2Ray</span>
              {nearLimitExternalSources.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-extrabold font-mono leading-none">
                  {nearLimitExternalSources.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => openTrafficTracker(null)}
              className="hidden lg:flex h-9 px-3 text-xs font-bold text-sky-300 hover:text-white bg-sky-950/70 hover:bg-sky-600 border border-sky-700/70 rounded-xl transition-colors items-center gap-1.5 whitespace-nowrap shrink-0"
              title="رادار التتبع الذكي للصرف وحظر العناوين الخارجة عن شام كاش"
            >
              <Activity className="w-4 h-4 text-sky-400 shrink-0" />
              <span>رادار الصرف</span>
            </button>

            <button
              type="button"
              onClick={() => fetchClients(true)}
              disabled={refreshing}
              className="xl:hidden p-2 rounded-xl bg-[#0E131F] hover:bg-slate-800/80 border border-slate-800 text-slate-300 hover:text-white transition-colors shrink-0"
              title="مزامنة وتحديث البيانات"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            <button
              type="button"
              onClick={openAutoGenModal}
              className="h-9 px-3.5 text-xs font-bold text-amber-300 hover:text-white bg-amber-950/70 hover:bg-amber-600 border border-amber-700/70 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              title="التوليد التلقائي السريع للمشتركين (شام كاش / بروكسي منزلي / VPN عام V2Ray)"
            >
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>توليد تلقائي</span>
            </button>

            <button
              type="button"
              onClick={openAddModal}
              className="h-9 px-4 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-sm shadow-emerald-950"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>مشترك جديد</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-6 py-3.5 sm:py-6 space-y-3.5 sm:space-y-5">
        {/* Mobile & Tablet Quick Tools Card (Symmetrical 2-Column Grid, Zero Crowding) */}
        <section className="bg-[#0E131F] border border-slate-800/80 rounded-2xl p-2.5 space-y-2 lg:hidden">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setExternalSourcesModalOpen(true)}
              className="h-9 px-2.5 rounded-xl text-xs font-bold bg-violet-950/80 hover:bg-violet-800 border border-violet-700/70 text-violet-200 flex items-center justify-center gap-1.5 min-w-0"
            >
              <Zap className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="truncate">مصادر V2Ray</span>
              {nearLimitExternalSources.length > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-extrabold font-mono leading-none shrink-0">
                  {nearLimitExternalSources.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => openTrafficTracker(null)}
              className="h-9 px-2.5 rounded-xl text-xs font-bold bg-sky-950/80 hover:bg-sky-800 border border-sky-700/70 text-sky-300 flex items-center justify-center gap-1.5 min-w-0"
            >
              <Activity className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate">رادار الصرف والحظر</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopyAndroidLink}
              className="h-9 px-2.5 rounded-xl text-xs font-medium bg-[#070A10] border border-slate-800 text-slate-200 flex items-center justify-center gap-1.5 min-w-0"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">{copiedAndroidApp ? 'تم نسخ أندرويد' : 'تطبيق أندرويد'}</span>
            </button>
            <button
              type="button"
              onClick={handleCopyIosLink}
              className="h-9 px-2.5 rounded-xl text-xs font-medium bg-[#070A10] border border-slate-800 text-slate-200 flex items-center justify-center gap-1.5 min-w-0"
            >
              <Smartphone className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate">{copiedIosApp ? 'تم نسخ آيفون' : 'تطبيق آيفون'}</span>
            </button>
          </div>

          {!isInstalled && (
            <button
              type="button"
              onClick={promptInstall}
              className="w-full h-9 px-3 rounded-xl text-xs font-semibold bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-700/60 text-emerald-300 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>تثبيت لوحة التحكم كتطبيق على الهاتف</span>
            </button>
          )}
        </section>

        {/* 5 Symmetrical Enterprise KPI Cards (Prominent General Remaining Balance on Mobile & Desktop) */}
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-4">
          {/* Card 1: General Remaining Traffic Balance (Full width on mobile col-span-2, 1st card on desktop) */}
          <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-emerald-950/60 via-[#0E131F] to-[#0E131F] border border-emerald-700/60 rounded-2xl p-3.5 sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-emerald-300 font-bold flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>الرصيد العام المتبقي</span>
              </span>
              <button
                type="button"
                onClick={() => syncNodeMavenUsage()}
                title="تحديث الرصيد العام المتبقي"
                className="p-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-800/80 border border-emerald-800/70 text-emerald-300 transition-colors shrink-0"
              >
                <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="mt-2 sm:mt-2.5 flex items-baseline justify-between gap-2 flex-wrap">
              <span
                className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-white tracking-tight"
                dir="ltr"
              >
                {nodeMavenAccountMb !== null ? formatDataMb(nodeMavenAccountMb) : '...'}
              </span>
              <span className="text-[11px] text-emerald-400 font-medium">
                {nodeMavenAccountMb !== null ? 'متاح في الخادم' : 'جاري المزامنة'}
              </span>
            </div>
          </div>

          {/* Card 2: Total Subscribers */}
          <div className="bg-[#0E131F] border border-slate-800/80 rounded-2xl p-3.5 sm:p-5 flex flex-col justify-between">
            <div className="text-[11px] sm:text-xs text-slate-400 font-medium">إجمالي المشتركين</div>
            <div className="mt-2 sm:mt-2.5 flex items-baseline justify-between gap-1.5 flex-wrap">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-white">
                {stats.total}
              </span>
              <span className="text-[11px] sm:text-xs text-slate-500 font-mono tabular-nums">
                مرتبط: {stats.boundDevices}
              </span>
            </div>
          </div>

          {/* Card 3: Active Subscriptions */}
          <div className="bg-[#0E131F] border border-slate-800/80 rounded-2xl p-3.5 sm:p-5 flex flex-col justify-between">
            <div className="text-[11px] sm:text-xs text-slate-400 font-medium">الاشتراكات النشطة</div>
            <div className="mt-2 sm:mt-2.5 flex items-baseline justify-between gap-1.5 flex-wrap">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-400">
                {stats.active}
              </span>
              <span className="text-[11px] sm:text-xs text-emerald-500/80">فعال الآن</span>
            </div>
          </div>

          {/* Card 4: Expiring Soon */}
          <div className="bg-[#0E131F] border border-slate-800/80 rounded-2xl p-3.5 sm:p-5 flex flex-col justify-between">
            <div className="text-[11px] sm:text-xs text-slate-400 font-medium">تنتهي خلال 5 أيام</div>
            <div className="mt-2 sm:mt-2.5 flex items-baseline justify-between gap-1.5 flex-wrap">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-amber-400">
                {stats.expiringSoon}
              </span>
              <span className="text-[11px] sm:text-xs text-slate-500">تجديد قريب</span>
            </div>
          </div>

          {/* Card 5: Expired / Paused */}
          <div className="bg-[#0E131F] border border-slate-800/80 rounded-2xl p-3.5 sm:p-5 flex flex-col justify-between">
            <div className="text-[11px] sm:text-xs text-slate-400 font-medium">منتهية / موقوفة</div>
            <div className="mt-2 sm:mt-2.5 flex items-baseline justify-between gap-1.5 flex-wrap">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-rose-400">
                {stats.expired + stats.inactive}
              </span>
              <span className="text-[11px] sm:text-xs text-slate-500">غير فعال</span>
            </div>
          </div>
        </section>

        {/* External V2Ray Near-Exhaustion Alert Banner (shown only when a source is near limit) */}
        {nearLimitExternalSources.length > 0 && (
          <section className="bg-amber-950/35 border border-amber-600/60 rounded-2xl px-3.5 sm:px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="flex items-start sm:items-center gap-2 text-xs text-amber-200 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                <strong className="text-amber-300">تنبيه قرب نفاد مصادر V2Ray:</strong>{' '}
                {nearLimitExternalSources
                  .map(
                    (s) =>
                      `${s.name} (${
                        s.userinfo?.total_mb
                          ? `${s.userinfo.usage_pct ?? 0}% مستهلك`
                          : 'قرب الانتهاء'
                      })`
                  )
                  .join(' · ')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setExternalSourcesModalOpen(true)}
              className="px-3 py-2 sm:py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold whitespace-nowrap shrink-0 transition-colors text-center"
            >
              فحص وتجديد المصادر
            </button>
          </section>
        )}

        {/* Search & Filter Bar (Symmetrical Grid on Mobile, Inline Row on Desktop) */}
        <section className="flex flex-col gap-2.5 bg-[#0E131F] border border-slate-800/80 rounded-2xl p-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 sm:gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالاسم، الدولة، المزود، أو المصدر..."
                className="w-full bg-[#070A10] border border-slate-800/90 focus:border-emerald-500 rounded-xl pr-10 pl-3.5 py-2.5 sm:py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#070A10] border border-slate-800/90 rounded-xl overflow-x-auto scrollbar-none">
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
                  className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === tab.id
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Package / Service Mode Filter Row (2x2 Clean Grid on Mobile, Flex Row on Desktop) */}
          <div className="pt-2.5 border-t border-slate-800/70 flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500 shrink-0">
              تصفية حسب الباقة:
            </span>
            <div className="grid grid-cols-2 sm:flex sm:items-center sm:flex-wrap gap-1.5">
              {(
                [
                  {
                    id: 'all',
                    label: `جميع الباقات (${stats.total})`,
                    activeClass: 'bg-slate-800 text-white border-slate-700',
                  },
                  {
                    id: 'shamcash_sy',
                    label: `شام كاش · سوريا (${modeCounts.shamcash_sy})`,
                    activeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/70',
                  },
                  {
                    id: 'residential_custom',
                    label: `بروكسي منزلي (${modeCounts.residential_custom})`,
                    activeClass: 'bg-sky-950/80 text-sky-300 border-sky-700/70',
                  },
                  {
                    id: 'external_v2ray',
                    label: `VPN عام V2Ray (${modeCounts.external_v2ray})`,
                    activeClass: 'bg-violet-950/80 text-violet-300 border-violet-700/70',
                  },
                ] as { id: ModeFilterTab; label: string; activeClass: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setModeFilter(tab.id)}
                  className={`px-2.5 sm:px-3 py-1.5 sm:py-1 text-[11px] font-semibold rounded-lg border transition-colors text-center truncate ${
                    modeFilter === tab.id
                      ? tab.activeClass
                      : 'bg-[#070A10] border-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
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
              {searchQuery || statusFilter !== 'all' || modeFilter !== 'all'
                ? 'لا توجد نتائج مطابقة'
                : 'لا يوجد مشتركون حالياً'}
            </div>
            <div>
              {searchQuery || statusFilter !== 'all' || modeFilter !== 'all' ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setModeFilter('all');
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
            {/* DESKTOP TABLE: Symmetrical 6-Column Corporate SaaS Grid */}
            <div className="hidden md:block bg-[#0E131F] border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/90 bg-[#070A10]/90 text-xs font-bold text-slate-400">
                      <th className="py-3.5 px-4 whitespace-nowrap">المشترك والحالة</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">حصة البيانات والتحكم بالصرف</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">الصلاحية والتمديد</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">بوابة الاتصال والجلسة</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">بصمة الجهاز</th>
                      <th className="py-3.5 px-4 text-left whitespace-nowrap">أدوات التفعيل والإدارة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-sm">
                    {filteredClients.map((client) => {
                      const statusInfo = getClientStatusInfo(client);
                      const isHappCopied = copiedHappId === client.id;
                      const isMsgCopied = copiedMsgId === client.id;
                      const boundDevice = client.registered_ip ? client.registered_ip.trim() : null;
                      const proxyDetails = parseProxyDetails(client);

                      const clientMode = client.service_mode || 'shamcash_sy';
                      const countryInfo = getCountryInfo(
                        client.country_code || (clientMode === 'external_v2ray' ? 'AUTO' : 'SY')
                      );
                      const linkedExtSource = client.external_source_id
                        ? externalSourceMap[client.external_source_id]
                        : undefined;
                      const extUserinfo = linkedExtSource?.userinfo;

                      const quotaMb = client.quota_mb && client.quota_mb > 0 ? client.quota_mb : 0;
                      const usedMb = client.used_mb && client.used_mb >= 0 ? client.used_mb : 0;
                      const remainingMb =
                        quotaMb > 0 ? Math.max(0, Number((quotaMb - usedMb).toFixed(1))) : 0;
                      const usagePct =
                        quotaMb > 0 ? Math.min(100, Math.round((usedMb / quotaMb) * 100)) : 0;
                      const isQuotaExhausted =
                        clientMode !== 'external_v2ray' && quotaMb > 0 && usedMb >= quotaMb;

                      const rawHwid = boundDevice
                        ? boundDevice.replace(/^HWID:/i, '').trim()
                        : '';
                      const shortHwid =
                        rawHwid.length > 12
                          ? `${rawHwid.slice(0, 6)}...${rawHwid.slice(-4)}`
                          : rawHwid;

                      return (
                        <React.Fragment key={client.id}>
                          <tr className="hover:bg-slate-800/20 transition-colors">
                            {/* Column 1: Subscriber Identity, Package & Country Badge, Active Status */}
                            <td className="py-3.5 px-4 align-middle whitespace-nowrap">
                              <div className="bg-[#070A10] border border-slate-800/90 rounded-xl p-3 min-w-[215px] space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span
                                    className="font-mono font-extrabold text-sm text-white tracking-tight"
                                    dir="ltr"
                                  >
                                    {client.username}
                                  </span>
                                  {statusInfo.status === 'active' && !isQuotaExhausted && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-800/60 text-[11px] font-semibold text-emerald-400">
                                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                                      <span>نشط</span>
                                    </span>
                                  )}
                                  {statusInfo.status === 'active' && isQuotaExhausted && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/60 border border-rose-800/60 text-[11px] font-semibold text-rose-400">
                                      <PauseCircle className="w-3 h-3 shrink-0" />
                                      <span>نفدت الباقة</span>
                                    </span>
                                  )}
                                  {statusInfo.status === 'expired' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/60 border border-amber-800/60 text-[11px] font-semibold text-amber-400">
                                      <Clock className="w-3 h-3 shrink-0" />
                                      <span>منتهي</span>
                                    </span>
                                  )}
                                  {statusInfo.status === 'inactive' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/60 border border-rose-800/60 text-[11px] font-semibold text-rose-400">
                                      <PauseCircle className="w-3 h-3 shrink-0" />
                                      <span>موقوف</span>
                                    </span>
                                  )}
                                </div>

                                {/* Required Clear Package Type & Country Badge */}
                                {renderPackageAndCountryBadge(client)}

                                <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-800/70 text-[11px]">
                                  {clientMode === 'external_v2ray' ? (
                                    <>
                                      <span className="text-slate-500">المصدر:</span>
                                      <span
                                        className="font-semibold text-violet-300 truncate max-w-[140px]"
                                        title={linkedExtSource?.name || 'رابط خارجي مخصص'}
                                      >
                                        {linkedExtSource?.name || 'رابط خارجي مخصص'}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-slate-500">المعرف الفرعي:</span>
                                      <span
                                        className="font-mono font-semibold text-sky-400 truncate max-w-[125px]"
                                        dir="ltr"
                                        title={proxyDetails.subUser || client.username}
                                      >
                                        {proxyDetails.subUser || client.username}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Column 2: Data Quota & Traffic Control Card */}
                            <td className="py-3.5 px-4 align-middle whitespace-nowrap">
                              {clientMode === 'external_v2ray' ? (
                                <div
                                  className={`bg-[#070A10] border rounded-xl p-3 w-[255px] space-y-2 ${
                                    extUserinfo?.near_limit
                                      ? 'border-amber-500/70'
                                      : 'border-slate-800/90'
                                  }`}
                                >
                                  {extUserinfo && extUserinfo.total_mb && extUserinfo.total_mb > 0 ? (
                                    <>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-400 flex items-center gap-1">
                                          <Zap className="w-3 h-3 text-violet-400" />
                                          <span>استهلاك المصدر:</span>
                                        </span>
                                        <span
                                          className="font-mono tabular-nums font-bold text-slate-100"
                                          dir="ltr"
                                        >
                                          {formatDataMb(extUserinfo.used_mb || 0)} /{' '}
                                          {formatDataMb(extUserinfo.total_mb)}
                                        </span>
                                      </div>
                                      <div className="w-full h-1.5 bg-slate-800/90 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all duration-300 ${
                                            (extUserinfo.usage_pct || 0) >= 85
                                              ? 'bg-rose-500'
                                              : (extUserinfo.usage_pct || 0) >= 70
                                              ? 'bg-amber-400'
                                              : 'bg-violet-500'
                                          }`}
                                          style={{
                                            width: `${Math.min(100, extUserinfo.usage_pct || 0)}%`,
                                          }}
                                        />
                                      </div>
                                      <div className="flex items-center justify-between text-[10px]">
                                        {extUserinfo.near_limit ? (
                                          <span className="text-amber-400 font-bold flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3 shrink-0" />
                                            <span>قرب النفاد!</span>
                                          </span>
                                        ) : (
                                          <span className="text-slate-400">
                                            المتبقي:{' '}
                                            <strong
                                              className="text-emerald-400 font-mono"
                                              dir="ltr"
                                            >
                                              {formatDataMb(extUserinfo.remaining_mb || 0)}
                                            </strong>
                                          </span>
                                        )}
                                        <span className="font-mono text-slate-300">
                                          {extUserinfo.usage_pct || 0}%
                                        </span>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 py-1">
                                      <span className="flex items-center gap-1.5">
                                        <Zap className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                                        <span>
                                          {linkedExtSource
                                            ? 'توزيع ديناميكي (Userinfo غير متوفر)'
                                            : 'رابط V2Ray مخصص (مدة زمنية)'}
                                        </span>
                                      </span>
                                      <span className="text-[10px] font-mono text-violet-300">
                                        ∞
                                      </span>
                                    </div>
                                  )}

                                  <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-800/80">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        linkedExtSource
                                          ? handleProbeClientExternalSource(linkedExtSource.id)
                                          : setExternalSourcesModalOpen(true)
                                      }
                                      disabled={
                                        Boolean(linkedExtSource) &&
                                        probingExternalId === linkedExtSource?.id
                                      }
                                      className="h-7 px-2 rounded-lg text-[10px] font-bold bg-violet-950/70 hover:bg-violet-600 text-violet-200 hover:text-white border border-violet-800/60 flex items-center justify-center gap-1 transition-colors"
                                    >
                                      <RefreshCw
                                        className={`w-3 h-3 shrink-0 ${
                                          linkedExtSource &&
                                          probingExternalId === linkedExtSource.id
                                            ? 'animate-spin'
                                            : ''
                                        }`}
                                      />
                                      <span className="truncate">فحص الاستهلاك</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setExternalSourcesModalOpen(true)}
                                      className="h-7 px-2 rounded-lg text-[10px] font-bold bg-[#0E131F] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 flex items-center justify-center gap-1 transition-colors"
                                    >
                                      <Zap className="w-3 h-3 text-violet-400 shrink-0" />
                                      <span className="truncate">المصادر</span>
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-[#070A10] border border-slate-800/90 rounded-xl p-3 w-[255px] space-y-2">
                                  {quotaMb > 0 ? (
                                    <>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-400 flex items-center gap-1">
                                          <HardDrive className="w-3 h-3 text-emerald-400" />
                                          <span>المستهلك:</span>
                                        </span>
                                        <span
                                          className="font-mono tabular-nums font-bold text-slate-100"
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
                                              انتهت الحصة المخصصة
                                            </span>
                                          ) : (
                                            <>
                                              المتبقي:{' '}
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
                                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 py-1">
                                      <span className="flex items-center gap-1.5">
                                        <HardDrive className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                        <span>
                                          {client.proxy_provider === 'dataimpulse'
                                            ? 'حصة DataImpulse (غير محددة)'
                                            : !nodeMavenConnected
                                            ? 'جاري مزامنة الحصة...'
                                            : proxyDetails.subUser &&
                                              nodeMavenMap[proxyDetails.subUser.toLowerCase()]
                                            ? 'مفتوح (من الرصيد العام)'
                                            : 'المعرف غير مسجل في الخادم'}
                                        </span>
                                      </span>
                                      <span className="text-[10px] font-mono text-amber-400">
                                        {client.proxy_provider === 'dataimpulse'
                                          ? '∞'
                                          : !nodeMavenConnected
                                          ? '...'
                                          : proxyDetails.subUser &&
                                            nodeMavenMap[proxyDetails.subUser.toLowerCase()]
                                          ? '∞'
                                          : 'غير متوفر'}
                                      </span>
                                    </div>
                                  )}

                                  {/* Equal-Width Symmetrical Traffic Action Buttons */}
                                  <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-800/80">
                                    <button
                                      type="button"
                                      onClick={() => handleRefillTraffic(client)}
                                      disabled={refillingId === client.id}
                                      title="إعادة ملء وتصفير حصة البيانات لهذا المشترك فوراً"
                                      className={`h-7 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 border transition-colors ${
                                        justRefilledId === client.id
                                          ? 'bg-emerald-600 border-emerald-400 text-white'
                                          : 'bg-emerald-950/70 hover:bg-emerald-600 text-emerald-300 hover:text-white border-emerald-800/60'
                                      }`}
                                    >
                                      <RotateCcw
                                        className={`w-3 h-3 shrink-0 ${
                                          refillingId === client.id ? 'animate-spin' : ''
                                        }`}
                                      />
                                      <span className="truncate">
                                        {refillingId === client.id
                                          ? 'يعيد الملء...'
                                          : justRefilledId === client.id
                                          ? 'تم الملء ✓'
                                          : 'إعادة ملء'}
                                      </span>
                                    </button>

                                    {clientMode === 'residential_custom' ? (
                                      <div
                                        className="h-7 px-2 rounded-lg text-[10px] font-bold bg-sky-950/40 text-sky-300 border border-sky-800/50 flex items-center justify-center gap-1"
                                        title="وضع التصفح المفتوح متجاوزاً حظر العناوين"
                                      >
                                        <Globe className="w-3 h-3 shrink-0 text-sky-400" />
                                        <span className="truncate">تصفح مفتوح</span>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => openTrafficTracker(client)}
                                        title="تتبع ذكي للمواقع التي تستهلك باقة هذا المشترك مع إمكانية حظر أي عنوان"
                                        className="h-7 px-2 rounded-lg text-[10px] font-bold bg-sky-950/70 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-800/60 flex items-center justify-center gap-1 transition-colors"
                                      >
                                        <Activity className="w-3 h-3 shrink-0" />
                                        <span className="truncate">تتبع الصرف</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Column 3: Expiry Date & Quick Extend Card */}
                            <td className="py-3.5 px-4 align-middle whitespace-nowrap">
                              <div className="bg-[#070A10] border border-slate-800/90 rounded-xl p-3 min-w-[175px] space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    <span>الانتهاء:</span>
                                  </span>
                                  <span
                                    className="font-mono text-xs font-bold tabular-nums text-white"
                                    dir="ltr"
                                  >
                                    {client.expiry_date}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-800/80">
                                  <span
                                    className={`text-[11px] font-medium ${
                                      statusInfo.status === 'expired' || statusInfo.isExpiringSoon
                                        ? 'text-amber-400'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    {statusInfo.daysText}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleQuickExtend30Days(client)}
                                    title="تمديد الصلاحية 30 يوماً"
                                    className="h-7 px-2.5 text-[10px] font-bold bg-emerald-950/60 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-800/60 rounded-lg transition-colors flex items-center gap-1"
                                  >
                                    <CalendarPlus className="w-3 h-3" />
                                    <span>+30 يوم</span>
                                  </button>
                                </div>
                              </div>
                            </td>

                            {/* Column 4: Proxy Gateway & Session Card (or External V2Ray Source Card) */}
                            <td className="py-3.5 px-4 align-middle whitespace-nowrap">
                              {clientMode === 'external_v2ray' ? (
                                <div className="bg-[#070A10] border border-violet-900/60 rounded-xl p-3 w-[325px] space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-200 min-w-0">
                                      <Zap className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                                      <span className="truncate">
                                        {linkedExtSource?.name || 'رابط V2Ray خارجي مباشر'}
                                      </span>
                                    </div>
                                    <span className="px-1.5 py-0.5 rounded-md bg-violet-950/70 border border-violet-800/60 text-[10px] font-mono font-bold text-violet-300 shrink-0">
                                      {countryInfo.code} {countryInfo.flag}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-800/80 text-[11px]">
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {(linkedExtSource?.protocols?.length
                                        ? linkedExtSource.protocols
                                        : ['VLESS / Trojan']
                                      ).map((proto) => (
                                        <span
                                          key={proto}
                                          className="px-1.5 py-0.5 rounded bg-sky-950/60 border border-sky-800/50 text-[10px] font-mono text-sky-300"
                                        >
                                          {proto}
                                        </span>
                                      ))}
                                      {linkedExtSource?.server_count ? (
                                        <span className="text-[10px] text-slate-400 font-mono">
                                          · {linkedExtSource.server_count} سيرفر
                                        </span>
                                      ) : null}
                                    </div>
                                    <span className="text-[10px] text-emerald-400 font-semibold">
                                      رابط ديناميكي
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={`bg-[#070A10] border rounded-xl p-3 w-[325px] space-y-2 transition-colors ${
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
                                      <Server
                                        className={`w-3.5 h-3.5 shrink-0 ${
                                          clientMode === 'residential_custom'
                                            ? 'text-sky-400'
                                            : 'text-emerald-400'
                                        }`}
                                      />
                                      <span>
                                        {proxyDetails.cleanHost}:{client.proxy_port}
                                      </span>
                                    </div>
                                    <span
                                      className={`px-1.5 py-0.5 rounded-md border text-[10px] font-mono font-bold ${
                                        clientMode === 'residential_custom'
                                          ? 'bg-sky-950/70 border-sky-800/60 text-sky-300'
                                          : 'bg-emerald-950/70 border-emerald-800/60 text-emerald-300'
                                      }`}
                                    >
                                      {countryInfo.code} {countryInfo.flag}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-800/80">
                                    <div
                                      className="flex-1 min-w-0 bg-[#0B0F19] border border-slate-800/90 rounded-lg px-2 py-1 font-mono text-[11px] overflow-x-auto scrollbar-none whitespace-nowrap"
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
                                      disabled={
                                        checkingIpId === client.id || regeneratingId === client.id
                                      }
                                      title="فحص عنوان الـ IP الفعلي الحالي لهذه الجلسة"
                                      className="h-7 px-2 rounded-lg text-[10px] font-bold bg-[#0B0F19] hover:bg-slate-800 text-sky-300 border border-slate-800 shrink-0 transition-colors"
                                    >
                                      {checkingIpId === client.id ? 'يفحص...' : 'فحص IP'}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleRegenerateProxy(client)}
                                      disabled={regeneratingId === client.id}
                                      title="توليد جلسة Sticky جديدة وتفعيل IP جديد فوراً"
                                      className={`h-7 px-2.5 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 border transition-all ${
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
                                          ? 'يولّد...'
                                          : justRegeneratedId === client.id
                                          ? 'تغيرت ✓'
                                          : 'توليد جلسة'}
                                      </span>
                                    </button>
                                  </div>

                                  {verifiedIpMap[client.id]?.ok && verifiedIpMap[client.id]?.exit_ip && (
                                    <div className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-[10px]">
                                      <span className="text-emerald-300 font-medium">
                                        عنوان الـ IP الفعلي:
                                      </span>
                                      <span className="font-mono font-bold text-white" dir="ltr">
                                        {verifiedIpMap[client.id].exit_ip} ·{' '}
                                        <span className="text-emerald-400 font-normal">
                                          {verifiedIpMap[client.id].city || countryInfo.code} (
                                          {verifiedIpMap[client.id].isp || 'ISP'})
                                        </span>
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Column 5: Device Fingerprint Protection */}
                            <td className="py-3.5 px-4 align-middle whitespace-nowrap">
                              {boundDevice ? (
                                <div className="bg-[#070A10] border border-sky-900/60 rounded-xl p-3 min-w-[160px] space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-sky-300 flex items-center gap-1">
                                      <Fingerprint className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                      <span>مرتبط بجهاز</span>
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-800/80">
                                    <span
                                      className="text-[10px] font-mono text-slate-400"
                                      dir="ltr"
                                      title={boundDevice}
                                    >
                                      {shortHwid}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleResetDevice(client)}
                                      title="فك قفل الجهاز للسماح بجهاز جديد"
                                      className="h-7 px-2 rounded-lg bg-sky-950/70 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-800/60 text-[10px] font-bold flex items-center gap-1 transition-colors"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                      <span>فك القفل</span>
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-[#070A10] border border-slate-800/80 rounded-xl p-3 min-w-[160px] space-y-2">
                                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                                    <Smartphone className="w-3.5 h-3.5 shrink-0" />
                                    <span>متاح للربط</span>
                                  </div>
                                  <div className="pt-1.5 border-t border-slate-800/80 text-[10px] text-slate-500">
                                    يرتبط تلقائياً بأول جهاز
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Column 6: Symmetrical Activation & Management Toolbar */}
                            <td className="py-3.5 px-4 align-middle whitespace-nowrap text-left">
                              <div className="bg-[#070A10] border border-slate-800/90 rounded-xl p-2 inline-flex flex-col gap-1.5 min-w-[195px]">
                                {/* Top Row: Primary Client Delivery Actions */}
                                <div className="grid grid-cols-2 gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyHappCode(client)}
                                    className={`h-8 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap border ${
                                      isHappCopied
                                        ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                                        : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
                                    }`}
                                  >
                                    {isHappCopied ? (
                                      <Check className="w-3.5 h-3.5 shrink-0" />
                                    ) : (
                                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                                    )}
                                    <span>{isHappCopied ? 'تم النسخ' : 'كود Happ'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleRequestCustomerMessage(client)}
                                    className={`h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap border ${
                                      isMsgCopied
                                        ? 'bg-sky-950 border-sky-600 text-sky-300'
                                        : 'bg-[#0E131F] hover:bg-slate-800 border-slate-800 text-slate-200'
                                    }`}
                                    title="مشاركة الباركود QR ونص رسالة الاشتراك مباشرة إلى واتساب أو أي تطبيق"
                                  >
                                    {isMsgCopied ? (
                                      <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                    ) : (
                                      <Share2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                    )}
                                    <span>مشاركة</span>
                                  </button>
                                </div>

                                {/* Bottom Row: 4 Equal-Width Admin Control Buttons */}
                                <div className="grid grid-cols-4 gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenQrModal(client)}
                                    title="عرض باركود التفعيل QR"
                                    className="h-7 rounded-lg bg-[#0E131F] hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                                  >
                                    <QrCode className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleActive(client)}
                                    title={
                                      client.is_active
                                        ? 'إيقاف اشتراك المشترك فوراً داخل تطبيق Happ'
                                        : 'إعادة تفعيل اشتراك المشترك'
                                    }
                                    className={`h-7 rounded-lg border flex items-center justify-center transition-colors ${
                                      client.is_active
                                        ? 'bg-[#0E131F] border-slate-800 text-emerald-400 hover:bg-rose-950/50 hover:text-rose-400 hover:border-rose-800/60'
                                        : 'bg-rose-950/40 border-rose-800/60 text-rose-400 hover:text-emerald-400 hover:bg-slate-800'
                                    }`}
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => openEditModal(client)}
                                    title="تعديل بيانات المشترك"
                                    className="h-7 rounded-lg bg-[#0E131F] hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setDeletingClient(client)}
                                    title="حذف المشترك"
                                    className="h-7 rounded-lg bg-[#0E131F] hover:bg-rose-950/60 border border-slate-800 hover:border-rose-800/60 text-slate-400 hover:text-rose-300 flex items-center justify-center transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
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

                const clientMode = client.service_mode || 'shamcash_sy';
                const countryInfo = getCountryInfo(
                  client.country_code || (clientMode === 'external_v2ray' ? 'AUTO' : 'SY')
                );
                const linkedExtSource = client.external_source_id
                  ? externalSourceMap[client.external_source_id]
                  : undefined;
                const extUserinfo = linkedExtSource?.userinfo;

                const quotaMb = client.quota_mb && client.quota_mb > 0 ? client.quota_mb : 0;
                const usedMb = client.used_mb && client.used_mb >= 0 ? client.used_mb : 0;
                const remainingMb =
                  quotaMb > 0 ? Math.max(0, Number((quotaMb - usedMb).toFixed(1))) : 0;
                const usagePct =
                  quotaMb > 0 ? Math.min(100, Math.round((usedMb / quotaMb) * 100)) : 0;

                return (
                  <div
                    key={client.id}
                    className="bg-[#0E131F] border border-slate-800/80 rounded-2xl p-3.5 space-y-3"
                  >
                    {/* Card Header: Row 1 (Username + Action Icons) + Row 2 (Full-Width Badge & Status) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div
                          className="font-mono font-bold text-base text-white truncate min-w-0"
                          dir="ltr"
                        >
                          {client.username}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenQrModal(client)}
                            title="عرض QR"
                            className="w-8 h-8 rounded-lg bg-[#070A10] border border-slate-800 text-slate-200 flex items-center justify-center"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(client)}
                            title={client.is_active ? 'إيقاف الاشتراك' : 'تفعيل الاشتراك'}
                            className={`w-8 h-8 rounded-lg border flex items-center justify-center ${
                              client.is_active
                                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400'
                                : 'bg-rose-950/40 border-rose-800/60 text-rose-400'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(client)}
                            title="تعديل"
                            className="w-8 h-8 rounded-lg bg-[#070A10] border border-slate-800 text-slate-300 flex items-center justify-center"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingClient(client)}
                            title="حذف"
                            className="w-8 h-8 rounded-lg bg-[#070A10] border border-slate-800 text-rose-400 flex items-center justify-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Full-Width Package/Country Badge + Status Row (Zero Squeezing) */}
                      <div className="flex items-center justify-between flex-wrap gap-1.5 pt-1.5 border-t border-slate-800/60">
                        {renderPackageAndCountryBadge(client)}
                        <div className="flex items-center gap-1.5 text-[11px] shrink-0">
                          {statusInfo.status === 'active' && (
                            <span className="text-emerald-400 font-bold">نشط</span>
                          )}
                          {statusInfo.status === 'expired' && (
                            <span className="text-amber-400 font-bold">منتهي</span>
                          )}
                          {statusInfo.status === 'inactive' && (
                            <span className="text-rose-400 font-bold">موقوف</span>
                          )}
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-400">{statusInfo.daysText}</span>
                        </div>
                      </div>
                    </div>

                    {/* Data Quota / External V2Ray Userinfo Card on Mobile */}
                    {clientMode === 'external_v2ray' ? (
                      <div
                        className={`bg-[#070A10] border rounded-xl p-3 space-y-2 ${
                          extUserinfo?.near_limit ? 'border-amber-500/70' : 'border-violet-900/60'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="text-violet-300 font-bold flex items-center gap-1.5 min-w-0">
                            <Zap className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                            <span className="truncate">
                              {linkedExtSource?.name || 'رابط V2Ray خارجي مخصص'}
                            </span>
                          </span>
                          <span className="font-mono text-[11px] text-slate-300 shrink-0">
                            {linkedExtSource?.server_count || 0} سيرفر
                          </span>
                        </div>
                        {extUserinfo && extUserinfo.total_mb && extUserinfo.total_mb > 0 ? (
                          <>
                            <div className="flex items-center justify-between text-[11px] gap-2">
                              <span className="text-slate-400">استهلاك المصدر:</span>
                              <span className="font-mono font-bold text-slate-100 shrink-0" dir="ltr">
                                {formatDataMb(extUserinfo.used_mb || 0)} /{' '}
                                {formatDataMb(extUserinfo.total_mb)}
                              </span>
                            </div>
                            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  (extUserinfo.usage_pct || 0) >= 85
                                    ? 'bg-rose-500'
                                    : (extUserinfo.usage_pct || 0) >= 70
                                    ? 'bg-amber-400'
                                    : 'bg-violet-500'
                                }`}
                                style={{ width: `${Math.min(100, extUserinfo.usage_pct || 0)}%` }}
                              />
                            </div>
                            {extUserinfo.near_limit && (
                              <div className="text-[11px] text-amber-300 font-bold flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span>تنبيه: المصدر الخارجي اقترب من النفاد!</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-[11px] text-slate-400">
                            توزيع ديناميكي عبر {(linkedExtSource?.protocols || ['VLESS / Trojan']).join(' · ')}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-800/80">
                          <button
                            type="button"
                            onClick={() =>
                              linkedExtSource
                                ? handleProbeClientExternalSource(linkedExtSource.id)
                                : setExternalSourcesModalOpen(true)
                            }
                            disabled={
                              Boolean(linkedExtSource) &&
                              probingExternalId === linkedExtSource?.id
                            }
                            className="h-8 px-2 rounded-lg text-[11px] font-bold bg-violet-950/70 hover:bg-violet-600 text-violet-200 border border-violet-800/60 flex items-center justify-center gap-1.5 whitespace-nowrap"
                          >
                            <RefreshCw
                              className={`w-3.5 h-3.5 shrink-0 ${
                                linkedExtSource && probingExternalId === linkedExtSource.id
                                  ? 'animate-spin'
                                  : ''
                              }`}
                            />
                            <span>فحص الاستهلاك</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setExternalSourcesModalOpen(true)}
                            className="h-8 px-2 rounded-lg text-[11px] font-bold bg-[#0E131F] text-slate-300 border border-slate-800 flex items-center justify-center gap-1.5 whitespace-nowrap"
                          >
                            <Zap className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                            <span>إدارة المصادر</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Data Quota & Consumption Bar Underneath Mobile Subscriber Header */}
                        <div className="bg-[#070A10] border border-slate-800/90 rounded-xl p-3 space-y-2">
                          {quotaMb > 0 ? (
                            <>
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-slate-400 flex items-center gap-1.5 min-w-0">
                                  <HardDrive className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  <span className="truncate">
                                    الحصة ({proxyDetails.subUser || client.username})
                                  </span>
                                </span>
                                <span className="font-mono font-bold text-slate-100 shrink-0" dir="ltr">
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
                                  المتبقي:{' '}
                                  <strong className="text-emerald-400 font-mono" dir="ltr">
                                    {formatDataMb(remainingMb)}
                                  </strong>
                                </span>
                                <span className="font-mono tabular-nums">{usagePct}%</span>
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                              <span className="flex items-center gap-1.5 min-w-0">
                                <HardDrive className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                <span className="truncate">
                                  {client.proxy_provider === 'dataimpulse'
                                    ? 'حصة DataImpulse (غير محددة)'
                                    : !nodeMavenConnected
                                    ? `جاري جلب حصة (${proxyDetails.subUser || client.username})...`
                                    : proxyDetails.subUser &&
                                      nodeMavenMap[proxyDetails.subUser.toLowerCase()]
                                    ? 'مفتوح (من الرصيد العام)'
                                    : `المعرف (${proxyDetails.subUser || client.username}) غير مسجل`}
                                </span>
                              </span>
                              <span className="text-[11px] font-mono text-amber-400 shrink-0">
                                {client.proxy_provider === 'dataimpulse'
                                  ? '∞'
                                  : !nodeMavenConnected
                                  ? '...'
                                  : proxyDetails.subUser &&
                                    nodeMavenMap[proxyDetails.subUser.toLowerCase()]
                                  ? '∞'
                                  : 'غير متوفر'}
                              </span>
                            </div>
                          )}

                          {/* Mobile Refill Quota + Smart Domain Tracker Buttons */}
                          <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-800/80">
                            <button
                              type="button"
                              onClick={() => handleRefillTraffic(client)}
                              disabled={refillingId === client.id}
                              className={`h-8 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 border transition-colors whitespace-nowrap ${
                                justRefilledId === client.id
                                  ? 'bg-emerald-600 border-emerald-400 text-white'
                                  : 'bg-emerald-950/70 hover:bg-emerald-600 text-emerald-300 hover:text-white border-emerald-800/60'
                              }`}
                            >
                              <RotateCcw
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  refillingId === client.id ? 'animate-spin' : ''
                                }`}
                              />
                              <span className="truncate">
                                {refillingId === client.id
                                  ? 'يعيد الملء...'
                                  : justRefilledId === client.id
                                  ? 'تم الملء ✓'
                                  : 'إعادة ملء الحصة'}
                              </span>
                            </button>

                            {clientMode === 'residential_custom' ? (
                              <div className="h-8 px-2 rounded-lg text-[11px] font-bold bg-sky-950/40 text-sky-300 border border-sky-800/50 flex items-center justify-center gap-1.5 whitespace-nowrap">
                                <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                <span className="truncate">تصفح مفتوح</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openTrafficTracker(client)}
                                className="h-8 px-2 rounded-lg text-[11px] font-bold bg-sky-950/70 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-800/60 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                              >
                                <Activity className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">تتبع الصرف وحظر</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Mobile Proxy Session Card (Structured Top Label + Monospace String + 2 Equal Buttons) */}
                        <div
                          className={`bg-[#070A10] border rounded-xl p-3 space-y-2 transition-colors ${
                            justRegeneratedId === client.id
                              ? 'border-emerald-500/90'
                              : 'border-slate-800/90'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                              <Server className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>معرف جلسة البروكسي ({countryInfo.flag} {countryInfo.code})</span>
                            </span>
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
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleCheckProxyIp(client)}
                              disabled={checkingIpId === client.id || regeneratingId === client.id}
                              className="h-8 px-2 rounded-lg text-[11px] font-semibold bg-[#0B0F19] hover:bg-slate-800 text-sky-300 border border-slate-800 flex items-center justify-center gap-1.5 whitespace-nowrap"
                            >
                              <Globe className="w-3.5 h-3.5 shrink-0" />
                              <span>{checkingIpId === client.id ? 'يفحص الـ IP...' : 'فحص IP'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRegenerateProxy(client)}
                              disabled={regeneratingId === client.id}
                              className={`h-8 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 border transition-all whitespace-nowrap ${
                                justRegeneratedId === client.id
                                  ? 'bg-emerald-600 border-emerald-400 text-white'
                                  : 'bg-emerald-950/70 hover:bg-emerald-600 text-emerald-300 hover:text-white border-emerald-800/70'
                              }`}
                            >
                              <RefreshCw
                                className={`w-3 h-3 shrink-0 ${
                                  regeneratingId === client.id ? 'animate-spin' : ''
                                }`}
                              />
                              <span>
                                {regeneratingId === client.id
                                  ? 'جاري التوليد...'
                                  : justRegeneratedId === client.id
                                  ? 'تغيرت الجلسة ✓'
                                  : 'إعادة توليد الجلسة'}
                              </span>
                            </button>
                          </div>
                          {verifiedIpMap[client.id]?.ok && verifiedIpMap[client.id]?.exit_ip && (
                            <div className="flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-[11px]">
                              <span className="text-emerald-300 font-medium shrink-0">الـ IP الفعلي:</span>
                              <span className="font-mono font-bold text-white truncate max-w-full" dir="ltr">
                                {verifiedIpMap[client.id].exit_ip} ·{' '}
                                <span className="text-emerald-400 font-normal">
                                  {verifiedIpMap[client.id].city || countryInfo.code}
                                  {verifiedIpMap[client.id].isp ? ` (${verifiedIpMap[client.id].isp})` : ''}
                                </span>
                              </span>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* Structured 2-Column Mobile Info Grid (No Cramped 3-Column Wrapping) */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-[#070A10] border border-slate-800/80 rounded-xl p-2.5">
                        <span className="text-slate-500 text-[10px] block">تاريخ الانتهاء</span>
                        <span
                          className="font-mono font-semibold tabular-nums text-slate-100 mt-0.5 block"
                          dir="ltr"
                        >
                          {client.expiry_date}
                        </span>
                      </div>
                      <div className="bg-[#070A10] border border-slate-800/80 rounded-xl p-2.5">
                        <span className="text-slate-500 text-[10px] block">قفل الجهاز (HWID)</span>
                        {boundDevice ? (
                          <button
                            type="button"
                            onClick={() => handleResetDevice(client)}
                            className="text-sky-400 font-semibold mt-0.5 inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <span>مقفل (فك القفل)</span>
                            <RotateCcw className="w-3 h-3 shrink-0" />
                          </button>
                        ) : (
                          <span className="text-emerald-400 font-medium mt-0.5 block">
                            متاح للربط
                          </span>
                        )}
                      </div>
                      <div className="col-span-2 bg-[#070A10] border border-slate-800/80 rounded-xl px-2.5 py-2 flex items-center justify-between gap-2">
                        <span className="text-slate-500 text-[10px] shrink-0">
                          {clientMode === 'external_v2ray'
                            ? 'الدولة / المصدر:'
                            : `الخادم${proxyDetails.subUser ? ` (${proxyDetails.subUser})` : ''}:`}
                        </span>
                        <span
                          className="font-mono font-semibold tabular-nums text-slate-200 text-[11px] truncate"
                          dir="ltr"
                        >
                          {clientMode === 'external_v2ray'
                            ? `${countryInfo.flag} ${countryInfo.nameAr} (${countryInfo.code})`
                            : `${proxyDetails.cleanHost}:${client.proxy_port}`}
                        </span>
                      </div>
                    </div>

                    {/* Symmetrical Bottom Action Row */}
                    <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleCopyHappCode(client)}
                        className="h-9 px-2 rounded-xl text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1 whitespace-nowrap"
                      >
                        {isHappCopied ? <Check className="w-3.5 h-3.5 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                        <span>{isHappCopied ? 'تم النسخ' : 'كود Happ'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRequestCustomerMessage(client)}
                        className="h-9 px-2 rounded-xl text-[11px] font-semibold bg-[#070A10] border border-slate-800 text-slate-200 flex items-center justify-center gap-1 whitespace-nowrap"
                      >
                        {isMsgCopied ? (
                          <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        ) : (
                          <Share2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        )}
                        <span>مشاركة</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickExtend30Days(client)}
                        className="h-9 px-2 rounded-xl text-[11px] font-semibold bg-[#070A10] border border-slate-800 text-emerald-400 flex items-center justify-center gap-1 whitespace-nowrap"
                      >
                        <CalendarPlus className="w-3.5 h-3.5 shrink-0" />
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

      {/* Auto-Generate Subscriber Modal (Supports ShamCash SY, Custom Residential Proxy, and External V2Ray VPN) */}
      <AutoGenerateModal
        isOpen={autoGenModalOpen}
        onClose={() => setAutoGenModalOpen(false)}
        clients={clients}
        existingNodeMavenSubUserNames={existingNodeMavenSubUserNames}
        externalSources={externalSources}
        initialMode={modeFilter === 'all' ? 'shamcash_sy' : modeFilter}
        onOpenExternalSources={() => setExternalSourcesModalOpen(true)}
        onCreateClient={handleAutoGenerateCreateClient}
        onSyncUsage={syncNodeMavenUsage}
        onToast={showToast}
      />

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
        externalSources={externalSources}
        defaultProxyHost={defaultHost}
        defaultProxyPort={defaultPort}
        defaultProxyUsername={clients[0]?.proxy_username || ''}
        defaultProxyPassword={clients[0]?.proxy_password || ''}
        onClose={() => setModalOpen(false)}
        onOpenExternalSources={() => setExternalSourcesModalOpen(true)}
        onSubmit={async (data, id) => {
          await handleSaveClient(data, id);
        }}
      />

      {/* External V2Ray Sources Manager Modal */}
      <ExternalV2RaySourcesModal
        isOpen={externalSourcesModalOpen}
        sources={externalSources}
        allClients={clients}
        onClose={() => setExternalSourcesModalOpen(false)}
        onSourcesChange={setExternalSources}
        onRefreshAll={() => syncExternalSources(true)}
        onShowToast={showToast}
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
