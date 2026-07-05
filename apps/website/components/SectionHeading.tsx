// SectionHeading — reusable heading block with optional eyebrow + subtitle.
// Server component — no interactivity.

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  as?: 'h1' | 'h2' | 'h3';
  align?: 'left' | 'center';
};

export default function SectionHeading({
  eyebrow,
  title,
  subtitle,
  as: Tag = 'h2',
  align = 'left',
}: Props) {
  const alignClass = align === 'center' ? 'text-center' : 'text-left';

  return (
    <div className={`flex flex-col gap-2 ${alignClass}`}>
      {eyebrow && (
        <span className="text-caption uppercase tracking-widest font-semibold text-primary">
          {eyebrow}
        </span>
      )}
      <Tag className="text-display font-bold text-ink leading-tight">{title}</Tag>
      {subtitle && (
        <p className="text-body text-textSecondary max-w-2xl">{subtitle}</p>
      )}
    </div>
  );
}
