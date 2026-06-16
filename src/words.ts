export async function loadWords(): Promise<Set<string>> {
  const response = await fetch(import.meta.env.BASE_URL + 'words.txt');
  const text = await response.text();
  const words = new Set<string>();
  for (const line of text.split('\n')) {
    const word = line.trim().toLowerCase();
    if (word) words.add(word);
  }
  return words;
}
