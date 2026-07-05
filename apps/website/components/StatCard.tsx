// StatCard — displays a large stat value and a descriptive label below it.
// Server component — no interactivity.

type Props = {
  value: string;
  label: string;
};

export default function StatCard({ value, label }: Props) {
  return (
    <div className="flex flex-col items-center text-center gap-1 px-6 py-4">
      <span className="text-display font-bold text-primary">{value}</span>
      <span className="text-label text-textSecondary">{label}</span>
    </div>
  );
}
