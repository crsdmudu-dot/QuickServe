import { render, screen, fireEvent } from '@testing-library/react-native';
import { SectionHeader } from '@/components/ui/section-header';

describe('SectionHeader', () => {
  it('renders the title', () => {
    render(<SectionHeader title="Popular" />);
    expect(screen.getByText('Popular')).toBeOnTheScreen();
  });
  it('hides See all when no handler', () => {
    render(<SectionHeader title="Popular" />);
    expect(screen.queryByText('See all')).toBeNull();
  });
  it('shows and fires See all', () => {
    const onSeeAll = jest.fn();
    render(<SectionHeader title="Popular" onSeeAll={onSeeAll} />);
    fireEvent.press(screen.getByText('See all'));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });
});
