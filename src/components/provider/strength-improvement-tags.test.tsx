/**
 * Tests for StrengthImprovementTags
 *
 * Verifies:
 *   - Renders both "Strengths" and "Areas to improve" section headings.
 *   - Humanized tag labels appear for each group.
 *   - Empty strengths group shows a gentle hint.
 *   - Empty improvements group shows a gentle hint.
 *   - Both groups render correctly when both have content.
 */

// Mock @/lib/reviews to avoid Supabase initialization in the test env
jest.mock('@/lib/reviews', () => ({
  REVIEW_TAGS: [
    { key: 'on_time',            label: 'On time',            sentiment: 'positive' },
    { key: 'friendly',           label: 'Friendly',           sentiment: 'positive' },
    { key: 'clean_work',         label: 'Clean work',         sentiment: 'positive' },
    { key: 'good_communication', label: 'Good communication', sentiment: 'positive' },
    { key: 'fair_price',         label: 'Fair price',         sentiment: 'positive' },
    { key: 'late',               label: 'Late',               sentiment: 'negative' },
    { key: 'messy',              label: 'Messy',              sentiment: 'negative' },
    { key: 'poor_communication', label: 'Poor communication', sentiment: 'negative' },
    { key: 'overpriced',         label: 'Overpriced',         sentiment: 'negative' },
  ],
}));

import { render, screen } from '@testing-library/react-native';
import { StrengthImprovementTags } from '@/components/provider/strength-improvement-tags';

describe('StrengthImprovementTags', () => {
  it('renders both section headings', () => {
    render(<StrengthImprovementTags strengths={[]} improvements={[]} />);
    expect(screen.getByText('Strengths')).toBeOnTheScreen();
    expect(screen.getByText('Areas to improve')).toBeOnTheScreen();
  });

  it('shows humanized tag labels for strengths', () => {
    render(
      <StrengthImprovementTags
        strengths={['on_time', 'friendly']}
        improvements={[]}
      />,
    );
    expect(screen.getByText('On time')).toBeOnTheScreen();
    expect(screen.getByText('Friendly')).toBeOnTheScreen();
  });

  it('shows humanized tag labels for improvements', () => {
    render(
      <StrengthImprovementTags
        strengths={[]}
        improvements={['late', 'overpriced']}
      />,
    );
    expect(screen.getByText('Late')).toBeOnTheScreen();
    expect(screen.getByText('Overpriced')).toBeOnTheScreen();
  });

  it('shows empty hint when strengths is empty', () => {
    render(<StrengthImprovementTags strengths={[]} improvements={['late']} />);
    expect(screen.getByText('No strengths recorded yet.')).toBeOnTheScreen();
  });

  it('shows empty hint when improvements is empty', () => {
    render(<StrengthImprovementTags strengths={['friendly']} improvements={[]} />);
    expect(
      screen.getByText('No improvement areas noted — great work!'),
    ).toBeOnTheScreen();
  });

  it('renders all tags in both groups at once', () => {
    render(
      <StrengthImprovementTags
        strengths={['on_time', 'clean_work', 'fair_price']}
        improvements={['poor_communication', 'messy']}
      />,
    );
    expect(screen.getByText('On time')).toBeOnTheScreen();
    expect(screen.getByText('Clean work')).toBeOnTheScreen();
    expect(screen.getByText('Fair price')).toBeOnTheScreen();
    expect(screen.getByText('Poor communication')).toBeOnTheScreen();
    expect(screen.getByText('Messy')).toBeOnTheScreen();
  });

  it('shows empty hint for both groups when both are empty', () => {
    render(<StrengthImprovementTags strengths={[]} improvements={[]} />);
    expect(screen.getByText('No strengths recorded yet.')).toBeOnTheScreen();
    expect(
      screen.getByText('No improvement areas noted — great work!'),
    ).toBeOnTheScreen();
  });
});
