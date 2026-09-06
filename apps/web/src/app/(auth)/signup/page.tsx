import Link from 'next/link';
import { SignupForm } from './signup-form';

export const metadata = { title: 'Create your account · Sangam' };

export default function SignupPage() {
  return (
    <div className="mt-12 space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Start running your restaurant or cafe on Sangam
        </h1>
        <p className="text-sm text-muted">
          Set up your first cafe in under 10 minutes. No card required.
        </p>
      </div>
      <SignupForm />
      <p className="text-xs text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
