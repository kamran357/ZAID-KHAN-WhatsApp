'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { QrCode, RefreshCw, ShieldAlert, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { WaStatusPayload } from '@zk/shared';
import { CardHeader, GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { useApi } from '@/lib/hooks';

interface QrState {
  qr: string | null;
  generatedAt: string | null;
  available: boolean;
}

interface ChatPreview {
  id: string;
  jid: string;
  name: string;
  phone: string | null;
  isGroup: boolean;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  messageCount: number;
}

export default function ConnectPage() {
  const wa = useApi<WaStatusPayload>('/api/wa/status', { intervalMs: 5000 });
  const [qrData, setQrData] = useState<QrState>({ qr: null, generatedAt: null, available: false });
  const [showQr, setShowQr] = useState(false);
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<{ disconnect: () => void } | null>(null);

  // Connect to Socket.IO for live updates
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const connectSocket = async () => {
      try {
        const { io } = await import('socket.io-client');
        const socket = io('/socket.io', {
          transports: ['websocket'],
          withCredentials: true,
        });

        socketRef.current = socket;

        // Listen for WhatsApp status updates
        socket.on('wa:status', (payload: WaStatusPayload) => {
          // Update status via the polling hook
          setError(null);
        });

        // Listen for QR code updates
        socket.on('wa:qr', (payload: QrState) => {
          if (payload.qr && payload.available) {
            setQrData({
              qr: payload.qr,
              generatedAt: payload.generatedAt,
              available: true,
            });
            setShowQr(true);
          } else {
            setShowQr(false);
            setQrData((prev) => ({ ...prev, qr: null, available: false }));
          }
        });

        // Listen for new messages
        socket.on('wa:message:new', (payload: { contact: ChatPreview }) => {
          setChats((prev) => {
            const existing = prev.find((c) => c.id === payload.contact.id);
            if (existing) {
              return prev.map((c) =>
                c.id === payload.contact.id
                  ? {
                      ...c,
                      unreadCount: (c.unreadCount || 0) + 1,
                      lastMessagePreview: payload.contact.lastMessagePreview,
                      lastMessageAt: payload.contact.lastMessageAt,
                    }
                  : c
              );
            }
            return [
              {
                id: payload.contact.id,
                jid: payload.contact.waJid,
                name: payload.contact.name,
                phone: payload.contact.waJid.includes('@')
                  ? payload.contact.waJid.split('@')[0]
                  : payload.contact.waJid,
                isGroup: payload.contact.isGroup,
                unreadCount: 1,
                lastMessagePreview: payload.contact.lastMessagePreview,
                lastMessageAt: payload.contact.lastMessageAt,
                messageCount: 1,
              },
              ...prev,
            ];
          });
        });

        socket.on('connect', () => {
          // Fetch chats when connected
          loadChats();
        });

        socket.on('connect_error', (err) => {
          console.error('Socket connection error:', err.message);
        });

        return () => {
          socket.disconnect();
        };
      } catch (err) {
        console.error('Socket import failed:', err);
        setError('Socket connection failed');
      }
    };

    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Load chats list
  const loadChats = useCallback(async () => {
    try {
      setLoadingChats(true);
      const response = await fetch('/api/wa/chats');
      const data = await response.json();
      if (data.chats) {
        setChats(data.chats);
      }
    } catch (err) {
      console.error('Failed to load chats:', err);
    } finally {
      setLoadingChats(false);
    }
  }, []);

  // Refresh chats
  const refreshChats = useCallback(() => {
    loadChats();
  }, [loadChats]);

  // Handle connect button
  const handleConnect = async () => {
    setError(null);
    try {
      const response = await fetch('/api/wa/connect', {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to connect');
      }
    } catch (err) {
      setError('Failed to connect to WhatsApp');
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await fetch('/api/wa/logout', { method: 'POST' });
      setQrData({ qr: null, generatedAt: null, available: false });
      setShowQr(false);
      setChats([]);
      refreshChats();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // Generate QR data URL from base64
  const qrDataUrl = qrData.qr
    ? `data:image/png;base64,${Buffer.from(qrData.qr, 'binary').toString('base64')}`
    : null;

  const connected = wa.data?.status === 'CONNECTED';
  const connecting = wa.data?.status === 'CONNECTING' || wa.data?.status === 'RECONNECTING';
  const qrPending = wa.data?.status === 'QR_PENDING';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-navy md:text-2xl">
            WhatsApp Connect
          </h1>
          <p className="mt-1 text-xs text-ink-muted">
            Scan once with your phone. The session is saved so a restart never asks again.
          </p>
        </div>
        <Chip
          tone={connected ? 'green' : connecting ? 'blue' : qrPending ? 'yellow' : 'red'}
          dot
        >
          {wa.data?.status ?? 'DISCONNECTED'}
        </Chip>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <GlassCard>
          <CardHeader
            title="Pair this device"
            subtitle="QR refreshes automatically until it is scanned"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={handleConnect}
                disabled={connected || connecting}
              >
                {connecting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Connecting...
                  </>
                ) : qrPending ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh QR
                  </>
                ) : connected ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Connected
                  </>
                ) : (
                  <>
                    <QrCode className="h-3.5 w-3.5" />
                    Connect
                  </>
                )}
              </Button>
            }
          />

          {error && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/80 p-3 text-xs font-medium text-red-600">
              {error}
              <button
                className="ml-2 underline hover:text-red-800"
                onClick={() => setError(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="mt-4">
            {/* QR Code Display */}
            {showQr && qrData.qr ? (
              <div className="relative">
                <img
                  src={qrDataUrl || ''}
                  alt="WhatsApp QR Code"
                  className="h-full w-full max-w-[240px] rounded-2xl border border-navy/10 bg-white object-contain"
                />
                <p className="mt-2 text-center text-[11px] text-ink-muted">
                  Scan with WhatsApp → Linked Devices → Link a Device
                </p>
                {qrData.generatedAt && (
                  <p className="mt-1 text-center text-[10px] text-ink-muted">
                    Generated at{' '}
                    {new Date(qrData.generatedAt).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </p>
                )}
              </div>
            ) : connecting ? (
              <div className="grid aspect-square w-full place-items-center rounded-2xl border border-dashed border-navy/15 bg-white/60">
                <div className="flex flex-col items-center gap-2 text-center">
                  <Loader2 className="h-10 w-10 animate-spin text-navy/30" />
                  <p className="text-xs font-semibold text-navy">Connecting...</p>
                  <p className="max-w-[240px] text-[11px] leading-relaxed text-ink-muted">
                    Waiting for connection and QR code generation...
                  </p>
                </div>
              </div>
            ) : connected ? (
              <div className="grid aspect-square w-full place-items-center rounded-2xl border border-green-200/50 bg-green-50/40">
                <div className="flex flex-col items-center gap-2 text-center">
                  <CheckCircle2 className="h-10 w-10 text-green-600" />
                  <p className="text-xs font-semibold text-green-700">Connected</p>
                  <p className="max-w-[240px] text-[11px] leading-relaxed text-ink-muted">
                    {wa.data?.phoneNumber
                      ? `Number: ${wa.data.phoneNumber}`
                      : 'WhatsApp is connected'}
                  </p>
                </div>
              </div>
            ) : wa.data?.status === 'LOGGED_OUT' ? (
              <div className="grid aspect-square w-full place-items-center rounded-2xl border border-red-200/50 bg-red-50/40">
                <div className="flex flex-col items-center gap-2 text-center">
                  <XCircle className="h-10 w-10 text-red-500" />
                  <p className="text-xs font-semibold text-red-600">Logged Out</p>
                  <p className="max-w-[240px] text-[11px] leading-relaxed text-ink-muted">
                    Session expired. Click &quot;Connect&quot; to re-link.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid aspect-square w-full place-items-center rounded-2xl border border-dashed border-navy/15 bg-white/60">
                <div className="flex flex-col items-center gap-2 text-center">
                  <QrCode className="h-10 w-10 text-navy/30" />
                  <p className="text-xs font-semibold text-navy">Not Connected</p>
                  <p className="max-w-[240px] text-[11px] leading-relaxed text-ink-muted">
                    Click &quot;Connect&quot; to start linking your WhatsApp account.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-ink-muted">
            <span>Session: {connected ? 'saved' : 'not linked'}</span>
            <span>{wa.data?.phoneNumber ?? 'no number'}</span>
          </div>

          {/* Logout button */}
          {connected && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleLogout}
            >
              Disconnect
            </Button>
          )}
        </GlassCard>

        <div className="space-y-4">
          {/* Chats Preview */}
          <GlassCard>
            <CardHeader
              title="Recent Chats"
              subtitle={chats.length > 0 ? `${chats.length} conversations` : 'No conversations yet'}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshChats}
                  disabled={loadingChats || !connected}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${loadingChats ? 'animate-spin' : ''}`}
                    aria-hidden
                  />
                  Refresh
                </Button>
              }
            />

            {loadingChats ? (
              <div className="mt-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-12 rounded-2xl border border-white/80 bg-white/50 animate-pulse"
                  />
                ))}
              </div>
            ) : chats.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-navy/10 bg-white/45 p-6 text-center">
                <p className="text-xs text-ink-muted">
                  {connected
                    ? 'Start chatting with this number to see conversations here.'
                    : 'Link a number first, then chats will appear here.'}
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {chats.slice(0, 10).map((chat) => (
                  <div
                    key={chat.id}
                    className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/55 p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy truncate">
                        {chat.name}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted truncate">
                        {chat.lastMessagePreview || 'No messages yet'}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {chat.unreadCount > 0 && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard>
            <CardHeader title="How linking works" />
            <ol className="mt-4 space-y-2.5 text-xs leading-relaxed text-ink-muted">
              <li>
                <span className="font-semibold text-navy">1.</span> Open WhatsApp on your phone →{' '}
                Settings → Linked devices.
              </li>
              <li>
                <span className="font-semibold text-navy">2.</span> Tap &ldquo;Link a device&rdquo; and scan the QR
                from this screen.
              </li>
              <li>
                <span className="font-semibold text-navy">3.</span> Credentials are stored in{' '}
                <code className="rounded bg-white/70 px-1 py-0.5 text-[11px]">apps/server/data/baileys</code>{' '}
                so restarts keep the session.
              </li>
              <li>
                <span className="font-semibold text-navy">4.</span> Use a secondary number first — this{' '}
                uses an unofficial client.
              </li>
            </ol>
          </GlassCard>

          <GlassCard className="border-amber-200/70 bg-amber-50/60">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Ban risk is real</p>
                <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
                  Baileys is not an official API. The app mitigates it with a random 4–12 s delay,
                  typing presence, a daily reply cap and no bulk messaging — but no mitigation is a
                  guarantee. Never use your primary business number while testing.
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
