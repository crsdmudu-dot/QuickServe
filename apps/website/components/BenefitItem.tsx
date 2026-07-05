// BenefitItem — a single benefit row with emoji icon, title, and descriptive text.
// Server component — no interactivity.

type Props = {
  icon: string;
  title: string;
  text: string;
};

export default function BenefitItem({ icon, title, text }: Props) {
  return (
    <div className="flex items-start gap-4">
      <span className="text-2xl flex-shrink-0 mt-0.5" role="img" aria-label={title}>
        {icon}
      </span>
      <div>
        <h3 className="text-label font-semibold text-ink">{title}</h3>
        <p className="text-label text-textSecondary mt-1">{text}</p>
      </div>
    </div>
  );
}
