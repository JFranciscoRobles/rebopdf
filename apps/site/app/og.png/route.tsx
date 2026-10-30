import { ogCard } from '@/lib/og';

export const dynamic = 'force-static';

export function GET() {
  return ogCard('en');
}
