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
import { ReportForm } from '@/components/ui/report-form';
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
  // What the participant is reporting, if the report panel is open.
  const [reportTarget, setReportTarget] = useState<
    { type: 'message' | 'user'; id: string; title: string } | null
  >(null);

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

  // The other person in this booking (only a participant has one).
  const counterpartId =
    currentUserId === booking.customer_id
      ? booking.assigned_provider_id
      : currentUserId != null && currentUserId === booking.assigned_provider_id
        ? booking.customer_id
        : null;
  const canReport = mode === 'participant' && counterpartId != null;

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
        <View style={styles.headerRow}>
          <Text variant="heading">{headingText}</Text>
          {canReport ? (
            <Button
              label="Report"
              variant="ghost"
              size="sm"
              testID="chat-report-person"
              onPress={() =>
                setReportTarget({
                  type: 'user',
                  id: counterpartId as string,
                  title: `Report ${peerName ?? 'this person'}`,
                })
              }
            />
          ) : null}
        </View>
        {canReport ? (
          <Text variant="caption" color="textSecondary">
            Long-press a message to report it.
          </Text>
        ) : null}
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
              const fromPeer = m.sender_id !== currentUserId;
              return (
                <MessageBubble
                  key={m.id}
                  testID={`message-${m.id}`}
                  text={m.message_text}
                  timestamp={m.created_at}
                  align={fromPeer ? 'left' : 'right'}
                  onLongPress={
                    fromPeer && canReport
                      ? () => setReportTarget({ type: 'message', id: m.id, title: 'Report this message' })
                      : undefined
                  }
                />
              );
            }
            // readonly — show label so the admin knows who said what
            return (
              <MessageBubble
                key={m.id}
                testID={`message-${m.id}`}
                text={m.message_text}
                timestamp={m.created_at}
                align="left"
                label={labelSender(m.sender_id, booking)}
                note={m.hidden_at ? 'Hidden by moderation' : undefined}
              />
            );
          })
        )}
      </ScrollView>

      {/* Report panel — opened from the header or by long-pressing a message */}
      {reportTarget ? (
        <ReportForm
          key={`${reportTarget.type}-${reportTarget.id}`}
          title={reportTarget.title}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          onClose={() => setReportTarget(null)}
        />
      ) : null}

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
    gap: Spacing.one,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
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
