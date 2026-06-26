// chat-thread.tsx — Shared conversation UI used by customer/provider screens
// (participant mode) and the admin viewer (readonly mode).
// Participant mode shows the input bar and lets users send messages.
// Readonly mode (admin) shows all messages with sender labels but no input.

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { MessageBubble } from '@/components/ui/message-bubble';
import { Text } from '@/components/ui/text';
import {
  getChatPeerName,
  getBookingMessages,
  labelSender,
  sendBookingMessage,
  type BookingMessage,
} from '@/lib/messages';

// ── Props ──────────────────────────────────────────────────────────────────

export type ChatThreadProps = {
  bookingId: string;
  booking: { customer_id: string; assigned_provider_id: string | null; status: string };
  mode: 'participant' | 'readonly';
};

// ── Component ──────────────────────────────────────────────────────────────

/**
 * ChatThread renders a full conversation thread for a booking.
 *
 * - participant: shows your messages on the right, peer's on the left.
 *   Includes an input bar unless the booking is completed/cancelled.
 * - readonly (admin): shows all messages aligned left with "Customer" /
 *   "Provider" labels. No input bar is rendered.
 */
export function ChatThread({ bookingId, booking, mode }: ChatThreadProps) {
  const theme = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  // ── State ────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [peerName, setPeerName] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // ── Load data on mount ───────────────────────────────────────────────────
  useEffect(() => {
    getBookingMessages(bookingId).then(setMessages);
    if (mode === 'participant') {
      getChatPeerName(bookingId).then(setPeerName);
    }
  }, [bookingId, mode]);

  // ── Derived state ────────────────────────────────────────────────────────
  // A terminal booking can no longer receive messages.
  const terminal =
    booking.status === 'completed' || booking.status === 'cancelled';

  // Header text differs by mode.
  const headingText = mode === 'readonly' ? 'Conversation' : peerName ?? 'Chat';

  // ── Send handler ─────────────────────────────────────────────────────────
  async function handleSend() {
    setError(null);
    const r = await sendBookingMessage(bookingId, input);
    if (r.ok) {
      setInput('');
      setMessages(await getBookingMessages(bookingId)); // reload
    } else {
      setError(r.error ?? 'Could not send message.');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text variant="heading">{headingText}</Text>
      </View>

      {/* Message list */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {messages.length === 0 ? (
          <EmptyState
            icon="💬"
            title="No messages yet"
            message="Messages will appear here."
          />
        ) : (
          messages.map((m) => {
            if (mode === 'participant') {
              return (
                <MessageBubble
                  key={m.id}
                  text={m.message_text}
                  timestamp={m.created_at}
                  align={m.sender_id === currentUserId ? 'right' : 'left'}
                />
              );
            }
            // readonly — show label so the admin knows who said what
            return (
              <MessageBubble
                key={m.id}
                text={m.message_text}
                timestamp={m.created_at}
                align="left"
                label={labelSender(m.sender_id, booking)}
              />
            );
          })
        )}
      </ScrollView>

      {/* Send area — only for participant mode */}
      {mode === 'participant' && (
        <View style={[styles.sendArea, { borderTopColor: theme.border, backgroundColor: theme.surfaceMuted, borderRadius: Radii.lg }]}>
          {terminal ? (
            <Text variant="caption" color="textSecondary">
              This conversation is closed.
            </Text>
          ) : (
            <>
              <Input
                label=""
                value={input}
                onChangeText={setInput}
                placeholder="Type a message…"
              />
              <Button label="Send" onPress={handleSend} />
              {error ? (
                <Text variant="caption" color="error">
                  {error}
                </Text>
              ) : null}
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  sendArea: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
