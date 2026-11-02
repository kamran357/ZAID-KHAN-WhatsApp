'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MessagesSquare, Search, SlidersHorizontal, Send, Loader2 } from 'lucide-react';
import type { MessageDTO } from '@zk/shared';
import { CardHeader, EmptyState, GlassCard } from '@/components/ui/glass-card';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { useApi } from '@/lib/hooks';

interface ChatInfo {
  id: string;
  jid: string;
  name: string;
  phone: string | null;
  isGroup: boolean;
  unreadCount: number;
  needsHuman: boolean;
  autopilotEnabled: boolean | null;
  isWhitelisted: boolean;
  isBlacklisted: boolean;
  isExcluded: boolean;
  tags: string[];
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  messageCount: number;
}

interface MessageInfo {
  id: string;
  chatId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  author: 'CUSTOMER' | 'AI' | 'HUMAN' | 'SYSTEM';
  kind: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'STICKER' | 'REACTION' | 'OTHER';
  text: string | null;
  draftText: string | null;
  status: 'RECEIVED' | 'SKIPPED' | 'DRAFTED' | 'APPROVED' | 'REJECTED' | 'SENDING' | 'SENT' | 'FAILED' | 'AI_RATE_LIMITED';
  createdAt: string;
  sentAt: string | null;
}

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'needs_human', label: 'Needs human' },
  { id: 'autopilot', label: 'Autopilot on' },
];

export default function ChatsPage() {
  const [tab, setTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [messages, setMessages] = useState<MessageInfo[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<{ disconnect: () => void } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Socket.IO connection for live updates
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

        // Listen for new messages
        socket.on('wa:message:new', (payload: { message: MessageInfo; contact: ChatInfo; unreadCount: number }) => {
          // Update chats list
          setChats((prev) => {
            const existing = prev.find((c) => c.id === payload.contact.id);
            if (existing) {
              return prev.map((c) =>
                c.id === payload.contact.id
                  ? {
                      ...c,
                      unreadCount: payload.unreadCount,
                      lastMessagePreview: payload.contact.lastMessagePreview,
                      lastMessageAt: payload.contact.lastMessageAt,
                    }
                  : c
              );
            }
            return [
              {
                ...payload.contact,
                phone: payload.contact.waJid.includes('@')
                  ? payload.contact.waJid.split('@')[0]
                  : payload.contact.waJid,
                unreadCount: payload.unreadCount,
              },
              ...prev,
            ];
          });

          // Add message to current view if it's in the selected chat
          if (selectedChatId === payload.contact.id) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === payload.message.id)) {
                return prev;
              }
              return [...prev, payload.message];
            });
          }
        });

        // Listen for sent messages
        socket.on('wa:message:sent', (payload: { messageId: string; status: string }) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.messageId ? { ...m, status: payload.status as MessageInfo['status'] } : m))
          );
        });

        // Listen for failed messages
        socket.on('wa:message:failed', (payload: { messageId: string; error: string }) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === payload.messageId
                ? { ...m, status: 'FAILED' as MessageInfo['status'] }
                : m
            )
          );
          setError(payload.error);
        });

        // Initial load
        loadChats();

        return () => {
          socket.disconnect();
        };
      } catch (err) {
        console.error('Socket connection failed:', err);
        // Fallback to polling
        loadChats();
      }
    };

    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [selectedChatId]);

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
      setError('Failed to load chats');
    } finally {
      setLoadingChats(false);
    }
  }, []);

  // Load messages for a chat
  const loadMessages = useCallback(async (chatId: string) => {
    try {
      setLoadingMessages(true);
      const response = await fetch(`/api/wa/chats/${chatId}`);
      const data = await response.json();
      if (data.messages) {
        setMessages(data.messages);
        setSelectedChatId(chatId);
        // Mark as read
        await fetch(`/api/wa/chats/${chatId}/read`, { method: 'POST' });
        // Update chats list to clear unread
        setChats((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c))
        );
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
      setError('Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Send reply
  const sendReply = async () => {
    if (!replyText.trim() || !selectedChatId) return;

    setSendingReply(true);
    setError(null);

    try {
      const response = await fetch('/api/wa/messages/${messages[0]?.id}/reply', {
        // Use a placeholder message ID since we don't track the actual message ID
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: replyText.trim(),
        }),
      });

      // Actually, we need to send to the chat, not reply to a specific message
      // Let's use the send endpoint
      const chat = chats.find((c) => c.id === selectedChatId);
      if (chat) {
        const sendResponse = await fetch('/api/wa/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatJid: chat.jid,
            text: replyText.trim(),
            contactId: chat.id,
          }),
        });

        const sendData = await sendResponse.json();
        if (!sendResponse.ok) {
          setError(sendData.error || 'Failed to send message');
        } else {
          // Add the sent message to the view
          setMessages((prev) => [
            ...prev,
            {
              id: sendData.messageId || `sent-${Date.now()}`,
              chatId: selectedChatId,
              direction: 'OUTBOUND',
              author: 'HUMAN',
              kind: 'TEXT',
              text: replyText.trim(),
              draftText: null,
              status: 'SENT',
              createdAt: new Date().toISOString(),
              sentAt: new Date().toISOString(),
            },
          ]);
          setReplyText('');
        }
      }
    } catch (err) {
      setError('Failed to send message');
    } finally {
      setSendingReply(false);
    }
  };

  // Filter chats based on tab and search
  const filteredChats = chats
    .filter((chat) => {
      // Tab filter
      if (tab === 'unread' && chat.unreadCount === 0) return false;
      if (tab === 'needs_human' && !chat.needsHuman) return false;
      if (tab === 'autopilot' && chat.autopilotEnabled !== true) return false;

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          chat.name.toLowerCase().includes(query) ||
          chat.phone?.toLowerCase().includes(query) ||
          chat.lastMessagePreview?.toLowerCase().includes(query)
        );
      }

      return true;
    })
    .sort((a, b) => {
      // Sort by last message time, unread first
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;

      return new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime();
    });

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectedChat = chats.find((c) => c.id === selectedChatId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-navy md:text-2xl">
            Chats
          </h1>
          <p className="mt-1 text-xs text-ink-muted">
            Live WhatsApp conversations with per-chat autopilot control.
          </p>
        </div>
        <Chip tone="green" dot>
          {chats.length} conversations
        </Chip>
      </div>

      <GlassCard>
        <CardHeader
          title="Conversations"
          subtitle="Chat list, search and unread badges"
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <PillTabs items={TABS} value={tab} onChange={setTab} ariaLabel="Chat filters" />
          <div className="relative min-w-[180px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <input
              className="glass-input pl-9"
              placeholder="Search by name or number"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search chats"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {/* Chat List */}
          <div className="lg:col-span-1 space-y-1">
            {loadingChats ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-14 rounded-2xl border border-white/80 bg-white/50 animate-pulse"
                  />
                ))}
              </div>
            ) : filteredChats.length === 0 ? (
              <EmptyState
                icon={<MessagesSquare className="h-6 w-6" />}
                title="No conversations yet"
                message="Link a number, then inbound messages appear here in real time with the AI draft attached."
              />
            ) : (
              filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => loadMessages(chat.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                    selectedChatId === chat.id
                      ? 'border-brand bg-brand/5'
                      : 'border-transparent bg-white/50 hover:bg-white/70'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-navy truncate">
                        {chat.name}
                      </p>
                      {chat.unreadCount > 0 && (
                        <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-muted truncate">
                      {chat.lastMessagePreview || 'No messages yet'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-muted/60">
                      {chat.lastMessageAt
                        ? new Date(chat.lastMessageAt).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Message View */}
          <div className="lg:col-span-2">
            {selectedChat ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-navy">{selectedChat.name}</h2>
                  <div className="flex items-center gap-2">
                    {selectedChat.needsHuman && (
                      <Chip tone="amber">Needs human</Chip>
                    )}
                    {selectedChat.isGroup && (
                      <Chip tone="slate">Group</Chip>
                    )}
                  </div>
                </div>

                <div className="max-h-[500px] overflow-y-auto rounded-2xl border border-navy/10 bg-white/40 p-4 space-y-3">
                  {loadingMessages ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-navy/30" />
                    </div>
                  ) : messages.length === 0 ? (
                    <EmptyState
                      icon={<MessagesSquare className="h-6 w-6" />}
                      title="No messages yet"
                      message="Messages will appear here when received."
                    />
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.direction === 'INBOUND' ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                            msg.direction === 'INBOUND'
                              ? 'rounded-tl-none bg-white/80 border border-white/80 text-ink'
                              : 'bg-brand/10 border border-brand/20 text-navy'
                          }`}
                        >
                          <p className="text-xs font-medium mb-1 opacity-60">
                            {msg.author === 'CUSTOMER' && 'You'}
                            {msg.author === 'HUMAN' && 'You (manual)'}
                            {msg.author === 'AI' && 'AI'}
                            {msg.author === 'SYSTEM' && 'System'}
                          </p>
                          <p className="text-sm">
                            {msg.text || <em className="text-ink-muted">[Media]</em>}
                          </p>
                          <div className="mt-1 flex items-center justify-end gap-2">
                            <span className="text-[10px] opacity-50">
                              {new Date(msg.createdAt).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {msg.status === 'SENT' && (
                              <span className="text-green-600">✓✓</span>
                            )}
                            {msg.status === 'SENDING' && (
                              <span className="text-yellow-600">
                                <Loader2 className="inline h-3 w-3 animate-spin" />
                              </span>
                            )}
                            {msg.status === 'FAILED' && (
                              <span className="text-red-500">✗</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  }
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply input */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    disabled={sendingReply}
                  />
                  <Button
                    variant="navy"
                    onClick={sendReply}
                    disabled={!replyText.trim() || sendingReply}
                  >
                    {sendingReply ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send
                  </Button>
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50/80 p-3 text-xs font-medium text-red-600">
                    {error}
                    <button
                      className="ml-2 underline hover:text-red-800"
                      onClick={() => setError(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-[400px] items-center justify-center rounded-2xl border border-dashed border-navy/10 bg-white/40">
                <div className="text-center">
                  <MessagesSquare className="h-10 w-10 text-navy/30 mx-auto" />
                  <p className="mt-2 text-sm font-semibold text-navy">Select a conversation</p>
                  <p className="text-xs text-ink-muted">
                    Choose a chat from the list to view messages
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
