export function findTaskReferences(text = "", tasks = []) {
  const haystack = String(text).trim().toLocaleLowerCase();
  if (!haystack) return [];

  return tasks
    .filter((task) => task?.id && task?.title?.trim())
    .filter((task) => haystack.includes(task.title.trim().toLocaleLowerCase()))
    .filter((task, index, matches) => matches.findIndex((item) => item.id === task.id) === index)
    .slice(0, 3);
}
