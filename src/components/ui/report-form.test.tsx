/**
 * Tests for src/components/ui/report-form.tsx with the REAL @/lib/moderation module; only the
 * Supabase client is mocked, so the RPC name and arguments sent to the server are checked too.
 */

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import { fireEvent, render, screen } from '@testing-library/react-native';

import { ReportForm } from '@/components/ui/report-form';
import { REPORT_CONFIRMATION, REPORT_REASONS } from '@/lib/moderation';

function renderForm(onClose = jest.fn()) {
  render(
    <ReportForm title="Report this message" targetType="message" targetId="msg-1" onClose={onClose} />,
  );
  return onClose;
}

describe('ReportForm', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('offers every reason and keeps Send disabled until one is chosen', () => {
    renderForm();
    for (const r of REPORT_REASONS) {
      expect(screen.getByText(r.label)).toBeOnTheScreen();
    }
    fireEvent.press(screen.getByTestId('report-send'));
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('sends the chosen reason to report_content and shows the 24-hour confirmation', async () => {
    mockRpc.mockResolvedValue({ data: 'report-1', error: null });
    renderForm();
    fireEvent.press(screen.getByTestId('report-reason-scam'));
    fireEvent.press(screen.getByTestId('report-send'));
    expect(await screen.findByText(REPORT_CONFIRMATION)).toBeOnTheScreen();
    expect(mockRpc).toHaveBeenCalledWith('report_content', {
      p_target_type: 'message',
      p_target_id: 'msg-1',
      p_reason: 'scam',
    });
    expect(REPORT_CONFIRMATION).toContain('within 24 hours');
  });

  it('shows a friendly error and stays open when the server refuses', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_found', code: 'P0002' } });
    renderForm();
    fireEvent.press(screen.getByTestId('report-reason-spam'));
    fireEvent.press(screen.getByTestId('report-send'));
    expect(await screen.findByText('Could not send the report. Please try again.')).toBeOnTheScreen();
    expect(screen.getByTestId('report-form')).toBeOnTheScreen();
  });

  it('explains the daily limit when the server rate-limits', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rate_limited', code: 'P0001' } });
    renderForm();
    fireEvent.press(screen.getByTestId('report-reason-spam'));
    fireEvent.press(screen.getByTestId('report-send'));
    expect(
      await screen.findByText('You have sent a lot of reports today. Please try again tomorrow.'),
    ).toBeOnTheScreen();
  });

  it('Cancel and Done both close the panel', async () => {
    const onClose = renderForm();
    fireEvent.press(screen.getByTestId('report-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);

    mockRpc.mockResolvedValue({ data: 'report-1', error: null });
    fireEvent.press(screen.getByTestId('report-reason-hate'));
    fireEvent.press(screen.getByTestId('report-send'));
    fireEvent.press(await screen.findByTestId('report-done'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('tells the reporter they stay anonymous to the other person', () => {
    renderForm();
    expect(screen.getByText(/not told who reported them/)).toBeOnTheScreen();
  });
});
