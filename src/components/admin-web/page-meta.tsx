import { Platform } from 'react-native';
import Head from 'expo-router/head';
import { ADMIN_TITLE_SUFFIX } from '@/constants/admin-web';

export type PageMetaProps = { title: string; description?: string };

/** Sets the browser <title> + basic meta for an admin-web screen (web only; no-op on native). */
export function PageMeta({ title, description }: PageMetaProps) {
  if (Platform.OS !== 'web') return null;
  return (
    <Head>
      <title>{`${title}${ADMIN_TITLE_SUFFIX}`}</title>
      {description ? <meta name="description" content={description} /> : null}
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </Head>
  );
}
