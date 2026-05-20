import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins two string class names with a space', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('resolves conflicting Tailwind utility classes via twMerge', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('filters out falsy values (false, null, undefined)', () => {
    expect(cn('x', false && 'y', null, undefined, 'z')).toBe('x z');
  });

  it('supports object syntax (truthy keys included, falsy keys excluded)', () => {
    expect(cn({ foo: true, bar: false })).toBe('foo');
  });

  it('supports array syntax', () => {
    expect(cn(['a', 'b'])).toBe('a b');
  });

  it('returns an empty string when called with no arguments', () => {
    expect(cn()).toBe('');
  });
});
