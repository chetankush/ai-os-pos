import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · Sangam' };

export default function LoginPage() {
  return (
    <div className="mt-12 space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted">
          Sign in to manage your cafe.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
