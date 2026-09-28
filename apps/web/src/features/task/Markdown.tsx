import { Check, Copy } from 'lucide-react';
import { memo, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/cn';

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object' && 'props' in node)
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  return '';
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = textOf(children);
  return (
    <div className="group/code relative my-3">
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(code.replace(/\n$/, '')).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="absolute top-2 right-2 inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-line bg-surface px-2 text-xs text-fg opacity-0 transition-opacity duration-200 group-hover/code:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      >
        {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        {copied ? 'Скопировано' : 'Копировать'}
      </button>
      <pre className="scroll-paper overflow-x-auto rounded-control border border-line bg-sunken p-3 text-[13px] leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

const components: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  code: ({ className, children }) =>
    className ? (
      <code className={cn(className, 'font-mono')}>{children}</code>
    ) : (
      <code className="rounded-[6px] bg-sunken px-1.5 py-0.5 font-mono text-[0.9em]">
        {children}
      </code>
    ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-heading underline underline-offset-4"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="scroll-paper my-3 overflow-x-auto rounded-control border border-line">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-line bg-sunken px-3 py-2 font-medium">{children}</th>
  ),
  td: ({ children }) => <td className="border-t border-line px-3 py-2 align-top">{children}</td>,
};

/** Markdown ответа модели: GFM (таблицы, списки задач), подсветка кода цветами токенов. */
export const Markdown = memo(function Markdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={cn('md-body', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
