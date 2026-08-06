const isWordCharacter = (character) => Boolean(character && /[\p{L}\p{N}]/u.test(character));

export function buildTaskMentionParts(value, taskTitles = []) {
  if (!value) return [];

  const titles = [...new Set(taskTitles
    .map((title) => String(title ?? "").trim())
    .filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  if (!titles.length) return [{ text: value, taskTitle: null }];

  const lowerValue = value.toLocaleLowerCase();
  const matches = [];

  for (const title of titles) {
    const lowerTitle = title.toLocaleLowerCase();
    let fromIndex = 0;
    while (fromIndex < value.length) {
      const start = lowerValue.indexOf(lowerTitle, fromIndex);
      if (start === -1) break;
      const end = start + title.length;
      const hasCleanStart = !isWordCharacter(value[start - 1]) || !isWordCharacter(title[0]);
      const hasCleanEnd = !isWordCharacter(value[end]) || !isWordCharacter(title[title.length - 1]);
      if (hasCleanStart && hasCleanEnd) matches.push({ start, end, taskTitle: title });
      fromIndex = start + Math.max(1, title.length);
    }
  }

  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const parts = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    if (match.start > cursor) {
      parts.push({ text: value.slice(cursor, match.start), taskTitle: null });
    }
    parts.push({ text: value.slice(match.start, match.end), taskTitle: match.taskTitle });
    cursor = match.end;
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor), taskTitle: null });
  return parts.length ? parts : [{ text: value, taskTitle: null }];
}
