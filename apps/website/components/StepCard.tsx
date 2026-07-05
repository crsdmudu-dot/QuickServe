// StepCard — numbered step card for the "How It Works" section.
// Server component — no interactivity.

type Props = {
  index: number;
  title: string;
  body: string;
};

export default function StepCard({ index, title, body }: Props) {
  return (
    <div className="bg-surface border border-border rounded-lg p-6 flex flex-col gap-4">
      {/* Step badge */}
      <div className="w-10 h-10 rounded-pill bg-primary flex items-center justify-center flex-shrink-0">
        <span className="text-label font-bold text-white">{index}</span>
      </div>
      <div>
        <h3 className="text-heading font-semibold text-ink">{title}</h3>
        <p className="text-label text-textSecondary mt-2">{body}</p>
      </div>
    </div>
  );
}
