'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders an AI answer as clean, scannable text: real tables (the model writes
 * GitHub-style tables, which plain react-markdown shows as raw pipe characters),
 * clear section headings, tidy lists. One renderer for every chat surface so an
 * answer looks the same on the dashboard and on the AI Assistant page.
 */
export default function AnswerMarkdown({ children, size = 13 }: { children: string; size?: number }) {
  const heading = (scale: number, top: number) =>
    function H({ children }: { children?: React.ReactNode }) {
      return (
        <div style={{ fontWeight: 700, fontSize: `${scale}em`, color: 'var(--text)', margin: `${top}px 0 6px`, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
          {children}
        </div>
      );
    };

  return (
    <div style={{ fontSize: size, lineHeight: 1.6, color: 'var(--text)' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: heading(1.12, 14),
          h2: heading(1.08, 14),
          h3: heading(1.04, 12),
          h4: heading(1, 10),
          p:  ({ children }) => <p style={{ margin: '0 0 10px' }}>{children}</p>,
          ul: ({ children }) => <ul style={{ margin: '0 0 10px', paddingLeft: 20 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '0 0 10px', paddingLeft: 20 }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
          strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'var(--text)' }}>{children}</strong>,
          hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />,
          blockquote: ({ children }) => (
            <blockquote style={{ margin: '0 0 10px', padding: '6px 12px', borderLeft: '3px solid #F37338', background: 'rgba(243,115,56,0.06)', color: 'var(--text2)' }}>{children}</blockquote>
          ),
          code: ({ children }) => (
            <code style={{ background: 'rgba(0,0,0,0.06)', borderRadius: 4, padding: '1px 5px', fontFamily: 'var(--font-mono)', fontSize: '0.92em' }}>{children}</code>
          ),
          // Tables scroll sideways on a phone instead of squeezing every column.
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '4px 0 14px', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.95em' }}>{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead style={{ background: 'rgba(243,115,56,0.08)' }}>{children}</thead>,
          th: ({ children, style }) => (
            <th style={{ ...style, textAlign: style?.textAlign ?? 'left', padding: '8px 12px', fontWeight: 700, fontSize: '0.9em', color: 'var(--text)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{children}</th>
          ),
          td: ({ children, style }) => (
            <td style={{ ...style, textAlign: style?.textAlign ?? 'left', padding: '8px 12px', borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>{children}</td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
