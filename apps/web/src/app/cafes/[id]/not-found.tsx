import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata = { title: 'Cafe not found · Sangam' };

export default function CafeNotFound() {
  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">404</p>
          <CardTitle className="mt-2">Cafe not found</CardTitle>
          <CardDescription>
            This cafe doesn&apos;t exist, or you don&apos;t have access to it.
          </CardDescription>
        </CardHeader>
        <CardBody>
          <Link
            href="/cafes"
            className={buttonClasses({ variant: 'secondary' })}
          >
            Back to cafes
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
