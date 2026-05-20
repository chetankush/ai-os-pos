'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });
    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      router.push('/cafes');
      router.refresh();
      return;
    }

    setInfo('Account created — check your email to verify before signing in.');
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@mehfil.in"
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        hint="Minimum 6 characters."
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>

      {error && (
        <p
          className="text-xs text-danger px-3 py-2 rounded-md border border-danger/20 bg-danger/5"
          role="alert"
        >
          {error}
        </p>
      )}
      {info && (
        <p
          className="text-xs text-success px-3 py-2 rounded-md border border-success/20 bg-success/5"
          role="status"
        >
          {info}
        </p>
      )}

      <Button type="submit" loading={submitting} className="w-full" size="lg">
        {submitting ? 'Creating account' : 'Create account'}
      </Button>

      <p className="text-xs text-muted text-center pt-2">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-fg font-medium hover:underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
