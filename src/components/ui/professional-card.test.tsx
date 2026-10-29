import { render, screen } from '@testing-library/react-native';
import { ProfessionalCard } from '@/components/ui/professional-card';

describe('ProfessionalCard', () => {
  it('shows name, skill and job count, and no Verified badge even when is_verified is true', () => {
    render(
      <ProfessionalCard
        professional={{
          full_name: 'Jane',
          skills: ['Plumbing'],
          is_verified: true,
          completed_jobs_count: 5,
          profile_photo_url: null,
        }}
      />
    );
    expect(screen.getByText('Jane')).toBeOnTheScreen();
    expect(screen.getByText('Plumbing')).toBeOnTheScreen();
    expect(screen.queryByText('Verified by KwikServe')).toBeNull();
    expect(screen.getByText('5 jobs completed')).toBeOnTheScreen();
  });

  it('hides verified badge when is_verified is false', () => {
    render(
      <ProfessionalCard
        professional={{
          full_name: 'Jane',
          skills: ['Plumbing'],
          is_verified: false,
          completed_jobs_count: 5,
          profile_photo_url: null,
        }}
      />
    );
    expect(screen.queryByText('Verified by KwikServe')).toBeNull();
  });
});
