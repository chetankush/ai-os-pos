import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Inline tokenizer for the subset our AI replies use: **bold**, `code`,
// *italic* / _italic_. Builds React nodes (never raw HTML / dangerouslySetInnerHTML)
// so model output can't inject markup.
const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null;
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: static one-shot render of a parsed string
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: static one-shot render of a parsed string
        <code key={i} className="rounded bg-fg/10 px-1 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (
      part.length > 2 &&
      ((part.startsWith('*') && part.endsWith('*')) ||
        (part.startsWith('_') && part.endsWith('_')))
    ) {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: static one-shot render of a parsed string
        <em key={i}>{part.slice(1, -1)}</em>
      );
    }
    // biome-ignore lint/suspicious/noArrayIndexKey: static one-shot render of a parsed string
    return <Fragment key={i}>{part}</Fragment>;
  });
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*\d+\.\s+(.*)$/;

/**
 * Minimal, dependency-free, XSS-safe markdown for chat bubbles: paragraphs,
 * bold/italic/inline-code, and bullet + numbered lists. Anything else renders
 * as plain text. Keeps the bundle small (perf) and avoids raw-HTML rendering.
 */
export function ChatMarkdown({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let ordered = false;

  const flushList = () => {
    if (listItems.length === 0) return;
    const items = listItems;
    const key = blocks.length;
    blocks.push(
      ordered ? (
        <ol key={key} className="list-decimal space-y-0.5 pl-5">
          {items.map((it, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static one-shot list render
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="list-disc space-y-0.5 pl-5">
          {items.map((it, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static one-shot list render
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>
      ),
    );
    listItems = [];
  };

  for (const line of text.split('\n')) {
    const bullet = line.match(BULLET);
    const numbered = line.match(ORDERED);
    if (bullet) {
      if (ordered) flushList();
      ordered = false;
      listItems.push(bullet[1] ?? '');
    } else if (numbered) {
      if (!ordered) flushList();
      ordered = true;
      listItems.push(numbered[1] ?? '');
    } else {
      flushList();
      if (line.trim()) {
        blocks.push(
          <p key={blocks.length}>{renderInline(line)}</p>,
        );
      }
    }
  }
  flushList();

  return <div className={cn('space-y-2 leading-relaxed', className)}>{blocks}</div>;
}
