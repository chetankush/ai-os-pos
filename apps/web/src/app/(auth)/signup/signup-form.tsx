'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { ApiError, signup } from '@/lib/api';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

// Subtle "*" marker for required fields. aria-hidden because requiredness is
// already conveyed via the input's required/aria-required attributes.
const RequiredMark = () => (
  <span className="text-danger" aria-hidden="true">
    {' '}
    *
  </span>
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
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
    if (password.length < MIN_PASSWORD) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD} characters.`);
      passwordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      // Step 1: create the user via the API (email auto-confirmed).
      await signup({
        email: email.trim().toLowerCase(),
        password,
        fullName: fullName.trim() || undefined,
      });

      // Step 2: sign in straight away — same credentials, no inbox round-trip.
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        // Account exists but sign-in failed — surface the message and let the
        // user retry from /login instead of being stranded.
        setFormError(
          `Account created, but signing in failed: ${signInError.message}. Try the sign-in page.`,
        );
        return;
      }

      // First-run lands on /cafes — the empty state has a clear "Create your
      // first cafe" CTA, so the onboarding path continues without docs.
      router.push('/cafes');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_ALREADY_REGISTERED') {
          setEmailError('An account with that email already exists. Sign in instead.');
          emailRef.current?.focus();
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Could not create your account. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <Field label="Your name" hint="Optional" htmlFor="fullName">
        <Input
          id="fullName"
          type="text"
          autoComplete="name"
          maxLength={120}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Anita Rao"
        />
      </Field>

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
        hint={passwordError ? undefined : `At least ${MIN_PASSWORD} characters.`}
        error={passwordError}
      >
        <PasswordInput
          id="password"
          ref={passwordRef}
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
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
        {submitting ? 'Creating your account' : 'Create account'}
      </Button>
    </form>
  );
}
