// LegalMarkdown — renders the blocks of an approved text (lib/legal-markdown.ts) as plain, styled HTML.
// Server component — no interactivity. React escapes every piece of text, and no HTML string is ever injected.
//
// It adds no words of its own: every visible character comes from the approved file. `afterFirstHeading` lets the
// page place the version line right under the text's own title (the Terms, Privacy and account-deletion pages).

import type { ReactNode } from 'react';
import type { Block, Inline } from '@/lib/legal-markdown';

const HEADING_CLASS: Record<number, string> = {
  1: 'text-display font-bold text-ink leading-tight',
  2: 'text-title font-bold text-ink mt-6',
  3: 'text-heading font-semibold text-ink mt-4',
  4: 'text-body font-semibold text-ink mt-2',
  5: 'text-label font-semibold text-ink mt-2',
  6: 'text-label font-semibold text-textSecondary mt-2',
};

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, i) => {
    if (node.type === 'text') return node.value;
    if (node.type === 'strong') return <strong key={i} className="font-semibold text-ink">{renderInline(node.children)}</strong>;
    if (node.type === 'em') return <em key={i}>{renderInline(node.children)}</em>;
    return (
      <a key={i} href={node.href} className="text-primary underline underline-offset-2 hover:text-primaryDark">
        {renderInline(node.children)}
      </a>
    );
  });
}

function renderBlock(block: Block, key: number): ReactNode {
  if (block.type === 'heading') {
    const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    return <Tag key={key} className={HEADING_CLASS[block.level]}>{renderInline(block.children)}</Tag>;
  }
  if (block.type === 'paragraph') {
    return <p key={key} className="text-body text-textSecondary">{renderInline(block.children)}</p>;
  }
  const items = block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>);
  return block.ordered ? (
    <ol key={key} start={block.start === 1 ? undefined : block.start} className="list-decimal pl-6 text-body text-textSecondary flex flex-col gap-1">
      {items}
    </ol>
  ) : (
    <ul key={key} className="list-disc pl-6 text-body text-textSecondary flex flex-col gap-1">
      {items}
    </ul>
  );
}

type Props = {
  blocks: Block[];
  /** Placed after the text's first block when that block is a level-1 heading, otherwise before the text. */
  afterFirstHeading?: ReactNode;
};

export default function LegalMarkdown({ blocks, afterFirstHeading }: Props) {
  const titled = blocks[0]?.type === 'heading' && blocks[0].level === 1;
  const head = titled ? [renderBlock(blocks[0], 0)] : [];
  const rest = (titled ? blocks.slice(1) : blocks).map((b, i) => renderBlock(b, i + 1));
  return (
    <>
      {head}
      {afterFirstHeading}
      {rest}
    </>
  );
}
