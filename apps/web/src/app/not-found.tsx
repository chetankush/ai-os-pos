import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Not found · Mehfil' };

export default function RootNotFound() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">404</p>
          <CardTitle className="mt-2 text-2xl">Page not found</CardTitle>
          <CardDescription>
            We couldn&apos;t find what you were looking for.
          </CardDescription>
        </CardHeader>
        <CardBody>
          <Link href="/" className={buttonClasses()}>
            Go home
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
