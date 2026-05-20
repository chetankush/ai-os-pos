'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// Subtle "*" marker for required fields. aria-hidden because requiredness is
// already conveyed via the input's required/aria-required attributes.
const RequiredMark = () => (
  <span className="text-danger" aria-hidden="true">
    {' '}
    *
  </span>
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  // Field-level errors sit next to the input that caused them.
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  // Form-level error is reserved for server/network failures only.
  const [formError, setFormError] = useState<string | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setEmailError(null);
    setPasswordError(null);

    if (!email.trim()) {
      setEmailError('Enter your email address.');
      emailRef.current?.focus();
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Enter a valid email address (e.g. you@sangam.in).');
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      setPasswordError('Enter your password.');
      passwordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);

    if (signInError) {
      setFormError(signInError.message);
      return;
    }

    router.push('/cafes');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <Field
        label={
          <>
            Email
            <RequiredMark />
          </>
        }
        htmlFor="email"
        error={emailError}
      >
        <Input
          id="email"
          ref={emailRef}
          type="email"
          autoComplete="email"
          required
          aria-required="true"
          aria-invalid={emailError ? true : undefined}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError(null);
          }}
          placeholder="you@sangam.in"
        />
      </Field>

      <Field
        label={
          <>
            Password
            <RequiredMark />
          </>
        }
        htmlFor="password"
        error={passwordError}
      >
        <PasswordInput
          id="password"
          ref={passwordRef}
          autoComplete="current-password"
          required
          minLength={6}
          aria-required="true"
          aria-invalid={passwordError ? true : undefined}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (passwordError) setPasswordError(null);
          }}
          placeholder="••••••••"
        />
      </Field>

      {formError && (
        <p
          className="text-xs text-danger px-3 py-2 rounded-md border border-danger/20 bg-danger/5"
          role="alert"
        >
          {formError}
        </p>
      )}

      <Button type="submit" loading={submitting} className="w-full" size="lg">
        {submitting ? 'Signing in' : 'Sign in'}
      </Button>

      <p className="text-xs text-muted text-center pt-2">
        New to Sangam?{' '}
        <Link
          href="/signup"
          className="text-fg font-medium hover:underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
