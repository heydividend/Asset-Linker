export function markdownToPlainText(md: string): string {
  if (!md) return "";
  let text = md.replace(/\r\n/g, "\n");

  text = text.replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g, (_m, code) => code.trim());
  text = text.replace(/`([^`]+)`/g, "$1");

  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");

  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, "");

  text = text.replace(/^\s{0,3}>\s?/gm, "");

  text = text.replace(/^[ \t]*[-*+]\s+/gm, "• ");
  text = text.replace(/^([ \t]*)(\d+)\.\s+/gm, "$1$2. ");

  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");

  text = text.replace(/^\s*([-*_])\s*\1\s*\1[\s\S]*?$/gm, "");

  text = text.replace(/\|/g, "  ");
  text = text.replace(/^\s*[:\- ]+\s*$/gm, "");

  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
