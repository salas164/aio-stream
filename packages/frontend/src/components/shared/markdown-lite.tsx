import React from 'react';
import { toast } from 'sonner';

interface MarkdownLiteProps {
  children: string;
  className?: string;
  stopPropagation?: boolean;
}

// Supports [text](url) and `code` only
const MarkdownLite: React.FC<MarkdownLiteProps> = ({
  children,
  className,
  stopPropagation = false,
}) => {
  if (!children) return null;
  // Regex for [text](url) and `code`
  const regex = /(`[^`]+`|\[[^\]]+\]\([^\)]+\))/g;
  const parts = children.split(regex);
  const matches = children.match(regex) || [];
  let matchIdx = 0;

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (i === parts.length - 1 && part === '') return null;
        if (i % 2 === 0) {
          // Plain text
          return part;
        } else {
          const match = matches[matchIdx++];
          if (!match) return null;
          if (match.startsWith('`') && match.endsWith('`')) {
            // Inline code
            return (
              <code
                key={i}
                onClick={async (e) => {
                  if (stopPropagation) {
                    e.stopPropagation();
                  }
                  // copy to clipboard
                  try {
                    await navigator.clipboard.writeText(match.slice(1, -1));
                    toast.success('Copied to clipboard');
                  } catch (error) {
                    console.error('Failed to copy to clipboard:', error);
                    toast.error('Failed to copy to clipboard');
                  }
                }}
                className="bg-muted px-1 py-0.5 rounded text-[--brand] font-mono text-xs break-all"
              >
                {match.slice(1, -1)}
              </code>
            );
          } else {
            // Link
            const linkMatch = match.match(/\[([^\]]+)\]\(([^\)]+)\)/);
            if (linkMatch) {
              const [, text, url] = linkMatch;
              return (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[--brand] hover:underline"
                  onClick={(e) => stopPropagation && e.stopPropagation()}
                >
                  {text}
                </a>
              );
            }
          }
          return match;
        }
      })}
    </span>
  );
};

export default MarkdownLite;
