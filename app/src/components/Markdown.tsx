/**
 * Minimal Markdown renderer for the Appendix pages.
 *
 * Supports: H1~H3, GFM tables, unordered lists, paragraphs, **bold**.
 * Skips the alignment row (|---|---|) and tolerates leading/trailing pipes.
 * No dependencies; safe because all input is built-in data.
 */
import { Fragment } from 'react';

type Block =
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] };

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

function isAlignmentRow(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function parse(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      blocks.push({ kind: 'h', level: h[1].length as 1 | 2 | 3, text: h[2].trim() });
      i++;
      continue;
    }

    // Table: current line starts with | AND next non-empty line is an alignment row
    if (line.trim().startsWith('|') && i + 1 < lines.length && isAlignmentRow(lines[i + 1])) {
      const headers = splitRow(line);
      i += 2; // skip header + alignment row
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ kind: 'table', headers, rows });
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, '').trim());
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    // Paragraph (collect consecutive non-empty, non-special lines)
    const buf: string[] = [line.trim()];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith('|')
    ) {
      buf.push(lines[i].trim());
      i++;
    }
    blocks.push({ kind: 'p', text: buf.join(' ') });
  }

  return blocks;
}

function renderInline(text: string): JSX.Element {
  // Split on **bold** while keeping pieces; render bold for odd-indexed segments.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, idx) => {
        if (/^\*\*[^*]+\*\*$/.test(p)) {
          return (
            <strong key={idx} className="font-semibold text-fg">
              {p.slice(2, -2)}
            </strong>
          );
        }
        return <Fragment key={idx}>{p}</Fragment>;
      })}
    </>
  );
}

export default function Markdown({ source }: { source: string }): JSX.Element {
  const blocks = parse(source);
  return (
    <div className="space-y-4 text-fg leading-relaxed">
      {blocks.map((b, idx) => {
        if (b.kind === 'h') {
          if (b.level === 1)
            return (
              <h2 key={idx} className="text-lg font-bold text-fg mt-4">
                {renderInline(b.text)}
              </h2>
            );
          if (b.level === 2)
            return (
              <h3 key={idx} className="text-base font-bold text-fg mt-5 pb-1 border-b border-divider">
                {renderInline(b.text)}
              </h3>
            );
          return (
            <h4 key={idx} className="text-sm font-bold text-fg mt-3">
              {renderInline(b.text)}
            </h4>
          );
        }
        if (b.kind === 'p') {
          return (
            <p key={idx} className="text-sm sm:text-base text-fg/95">
              {renderInline(b.text)}
            </p>
          );
        }
        if (b.kind === 'ul') {
          return (
            <ul key={idx} className="list-disc pl-5 space-y-1 text-sm sm:text-base text-fg/95">
              {b.items.map((it, i2) => (
                <li key={i2}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        // table
        return (
          <div key={idx} className="overflow-x-auto -mx-1">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-primary-soft">
                  {b.headers.map((h, i2) => (
                    <th
                      key={i2}
                      className="border border-divider px-2 py-1.5 text-left font-bold text-fg"
                    >
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, i2) => (
                  <tr key={i2} className="odd:bg-surface even:bg-bg">
                    {row.map((cell, i3) => (
                      <td
                        key={i3}
                        className="border border-divider px-2 py-1.5 align-top text-fg/95"
                      >
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
