import { Fragment } from "react";
import { Link } from "react-router";

// Turns Yarnie's reply into safe React elements (never raw HTML).
// Understands only: **bold**, [text](link), and lines starting with "- " or "1. ".
// Shop links (/products/3) open inside the site; https links (rider tracking)
// open in a new tab; anything else is shown as plain text.

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

function Inline({ text, onNavigate }) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const [, bold, label, href] = match;

    if (bold) {
      parts.push(<strong key={match.index}>{bold}</strong>);
    } else if (href.startsWith("/") && !href.startsWith("//")) {
      parts.push(
        <Link key={match.index} to={href} className="link" onClick={onNavigate}>
          {label}
        </Link>
      );
    } else if (href.startsWith("https://")) {
      parts.push(
        <a key={match.index} href={href} target="_blank" rel="noopener noreferrer" className="link">
          {label}
        </a>
      );
    } else {
      parts.push(label);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((part, i) => <Fragment key={i}>{part}</Fragment>);
}

export default function ChatText({ text, onNavigate }) {
  // Group the lines into paragraphs and lists.
  const blocks = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    const kind = bullet ? (/^\d/.test(line) ? "ol" : "ul") : "p";
    const content = bullet ? bullet[1] : line;

    if (!line) {
      blocks.push(null); // blank line ends the current paragraph/list
      continue;
    }
    const current = blocks.at(-1);
    if (current && current.kind === kind) current.lines.push(content);
    else blocks.push({ kind, lines: [content] });
  }

  return blocks.filter(Boolean).map((block, i) => {
    if (block.kind === "p") {
      return (
        <p key={i}>
          {block.lines.map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              <Inline text={line} onNavigate={onNavigate} />
            </Fragment>
          ))}
        </p>
      );
    }
    const List = block.kind;
    return (
      <List key={i} className={List === "ol" ? "list-decimal pl-5" : "list-disc pl-5"}>
        {block.lines.map((line, j) => (
          <li key={j}>
            <Inline text={line} onNavigate={onNavigate} />
          </li>
        ))}
      </List>
    );
  });
}
