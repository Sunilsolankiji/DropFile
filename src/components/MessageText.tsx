import type { ReactNode } from 'react';
import { LinkifyIt } from 'linkify-it';

const linkify = new LinkifyIt({ fuzzyEmail: false, fuzzyLink: true });

export default function MessageText({ text }: { text: string }) {
  const matches = linkify.match(text) || [];
  const content: ReactNode[] = [];
  let offset = 0;

  for (const match of matches) {
    if (!/^https?:\/\//i.test(match.url)) continue;
    content.push(text.slice(offset, match.index));
    content.push(
      <a key={match.index} href={match.url} target="_blank" rel="noopener noreferrer">
        {match.raw}
      </a>
    );
    offset = match.lastIndex;
  }
  content.push(text.slice(offset));

  return <div className="message-text">{content}</div>;
}
