// TestimonialCard — displays a customer or provider quote, author name, and optional role.
// Server component — no interactivity.

type Props = {
  quote: string;
  author: string;
  role?: string;
};

export default function TestimonialCard({ quote, author, role }: Props) {
  return (
    <blockquote className="bg-surface border border-border rounded-lg p-6 flex flex-col gap-4">
      <p className="text-body text-ink leading-relaxed">&ldquo;{quote}&rdquo;</p>
      <footer className="mt-auto">
        <span className="text-label font-semibold text-ink">{author}</span>
        {role && (
          <span className="text-caption text-textSecondary ml-2">{role}</span>
        )}
      </footer>
    </blockquote>
  );
}
