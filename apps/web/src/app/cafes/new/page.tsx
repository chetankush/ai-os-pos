import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { NewCafeForm } from './new-cafe-form';

export const metadata = { title: 'New cafe · Sangam' };

export default function NewCafePage() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <Link
          href="/cafes"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="size-3" />
          Back to cafes
        </Link>
        <div className="mt-3 space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Create a cafe
          </h1>
          <p className="text-sm text-muted">
            You can update any of these later. Pincode and AC flag affect GST rates.
          </p>
        </div>
      </div>
      <NewCafeForm />
    </div>
  );
}
