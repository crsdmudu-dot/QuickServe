// SeoJsonLd — renders a JSON-LD script tag for structured data (SEO).
// Server component — no interactivity needed.

export default function SeoJsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
