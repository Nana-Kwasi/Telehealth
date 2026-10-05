import React from 'react';

/**
 * Render the small slice of Markdown the assistant actually produces.
 *
 * Deliberately hand-written rather than a library, and deliberately NOT
 * dangerouslySetInnerHTML: the model is not a trusted author, so its output is
 * parsed into React elements. The worst a malformed response can do is look
 * odd — it can never inject markup.
 *
 * Handles: ### headings, **bold**, `code`, bullets, numbered lists and
 * paragraph spacing. Anything else renders as plain text rather than exposing
 * its syntax, which is the failure people actually notice.
 */
export default function AiMarkdown({ text, color = '#1e293b', size = '0.92rem' }) {
  if (!text) return null;

  const out = [];
  let lastWasGap = true;   // suppress a leading gap

  String(text).split('\n').forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');

    if (!line.trim()) {
      // Collapse runs of blank lines into ONE spacer. The model emits several
      // in a row, and one each turned into an empty half-screen.
      if (!lastWasGap) { out.push(<div key={`g${i}`} style={{ height: '0.55rem' }} />); lastWasGap = true; }
      return;
    }
    lastWasGap = false;

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(
        <div key={`h${i}`} style={{
          fontWeight: 800,
          fontSize: level <= 2 ? '1.05rem' : '0.98rem',
          color, margin: '0.5rem 0 0.3rem', lineHeight: 1.4,
        }}>{inline(heading[2])}</div>,
      );
      return;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      out.push(
        <div key={`b${i}`} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.2rem' }}>
          <span style={{ color: '#1d4ed8', fontWeight: 700, lineHeight: 1.7 }}>•</span>
          <span style={{ flex: 1, fontSize: size, lineHeight: 1.7, color }}>{inline(bullet[1])}</span>
        </div>,
      );
      return;
    }

    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      out.push(
        <div key={`n${i}`} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.2rem' }}>
          <span style={{ color: '#1d4ed8', fontWeight: 700, lineHeight: 1.7, minWidth: '1.1rem' }}>
            {numbered[1]}.
          </span>
          <span style={{ flex: 1, fontSize: size, lineHeight: 1.7, color }}>{inline(numbered[2])}</span>
        </div>,
      );
      return;
    }

    out.push(
      <div key={`p${i}`} style={{ fontSize: size, lineHeight: 1.7, color }}>{inline(line)}</div>,
    );
  });

  return <div>{out}</div>;
}

/**
 * Inline **bold** and `code`.
 *
 * Split on the markers rather than replacing them, so an unmatched ** renders
 * literally instead of swallowing the rest of the paragraph.
 */
function inline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={i} style={{ background: '#f1f5f9', borderRadius: 4, padding: '0 4px',
                               fontSize: '0.87em', color: '#1d4ed8' }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
