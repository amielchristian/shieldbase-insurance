function maskAll(text: string, pattern: RegExp, replacement: string): string {
  return text.replace(pattern, replacement);
}

export function redactForLogs(input: string, maxLen = 240): string {
  let text = input ?? "";
  if (!text) return "";

  text = maskAll(text, /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[email]");
  text = maskAll(text, /\b(\+?\d[\d ()-]{7,}\d)\b/g, "[phone]");
  text = maskAll(text, /\b\d{4,}\b/g, "[number]");
  text = text.replace(/\s+/g, " ").trim();

  if (text.length > maxLen) text = `${text.slice(0, maxLen - 1)}…`;
  return text;
}

