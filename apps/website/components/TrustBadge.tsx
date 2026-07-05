// TrustBadge — compact badge with icon, label, and optional description.
// Server component — no interactivity.

type Props = {
  icon: string;
  label: string;
  description?: string;
};

export default function TrustBadge({ icon, label, description }: Props) {
  return (
    <div className="flex flex-col items-center text-center gap-2 p-4">
      <span className="text-3xl" role="img" aria-label={label}>
        {icon}
      </span>
      <span className="text-label font-semibold text-ink">{label}</span>
      {description && (
        <p className="text-caption text-textSecondary">{description}</p>
      )}
    </div>
  );
}
