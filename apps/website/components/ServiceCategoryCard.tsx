// ServiceCategoryCard — rounded card displaying a service category with emoji, title, subtitle.
// Server component — no interactivity.

type Props = {
  title: string;
  subtitle: string;
  icon: string;
};

export default function ServiceCategoryCard({ title, subtitle, icon }: Props) {
  return (
    <div className="bg-surface border border-border rounded-lg p-6 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <span className="text-3xl" role="img" aria-label={title}>
        {icon}
      </span>
      <div>
        <h3 className="text-heading font-semibold text-ink">{title}</h3>
        <p className="text-label text-textSecondary mt-1">{subtitle}</p>
      </div>
    </div>
  );
}
