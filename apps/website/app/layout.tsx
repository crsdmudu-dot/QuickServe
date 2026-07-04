import './globals.css';

export const metadata = {
  title: 'QuickServe',
  description: 'Trusted home services in Nairobi.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
