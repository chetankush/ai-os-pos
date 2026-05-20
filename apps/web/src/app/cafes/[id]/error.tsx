'use client';

import Link from 'next/link';
import { Button, buttonClasses } from '@/components/ui/button';
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function CafeDetailError({ error, reset }: ErrorProps) {
  const message =
    error.message && error.message.length > 0
      ? error.message
      : 'We ran into an issue fetching the cafe details. Please try again.';

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Error
          </p>
          <CardTitle className="mt-2">Couldn&apos;t load this cafe</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardBody className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => reset()}>
            Try again
          </Button>
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
