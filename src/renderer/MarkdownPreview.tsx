import { memo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SuperShellApi } from '../shared/external-url';
import { useT } from './i18n';

export function isMarkdownName(name: string): boolean { return /\.(?:md|markdown)$/iu.test(name); }
export function safeMarkdownLink(url: string): string {
  try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : ''; }
  catch { return ''; }
}
/** No raw HTML, executable links, remote images, or implicit file/network reads. */
export const MarkdownPreview = memo(function MarkdownPreview({ content, compact = false }: { content: string; compact?: boolean }) {
  const t = useT();
  return <div className={`markdown-preview${compact ? ' is-compact' : ''}`}>
    <Markdown skipHtml remarkPlugins={[remarkGfm]} urlTransform={safeMarkdownLink} components={{
      img: ({ alt }) => <span className="markdown-blocked-image">{alt || t('viewerUpgrade.remoteImage')}</span>,
      a: ({ href, children }) => href && !compact ? <a href={href} onClick={event => {
        event.preventDefault();
        const shell = (window as unknown as { super?: { shell?: SuperShellApi } }).super?.shell;
        if (window.confirm(href)) void shell?.openExternalUrl(href);
      }} rel="noreferrer noopener">{children}</a> : <span>{children}</span>,
    }}>{content}</Markdown>
  </div>;
});
