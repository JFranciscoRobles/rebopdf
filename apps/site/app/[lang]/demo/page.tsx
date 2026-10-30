import { DemoPage, demoMetadata } from '@/components/pages/DemoPage';
import type { Locale } from '@/lib/i18n';

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props) {
  return demoMetadata((await params).lang as Locale);
}

export default async function Demo({ params }: Props) {
  return <DemoPage locale={(await params).lang as Locale} />;
}
