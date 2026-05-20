import { SignupForm } from './signup-form';

export const metadata = { title: 'Create account · Sangam' };

export default function SignupPage() {
  return (
    <div className="mt-12 space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted">
          Get your cafe set up in a few minutes.
        </p>
      </div>
      <SignupForm />
    </div>
  );
}
