const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

function distance(left: string, right: string): number {
  let row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 0; i < left.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < right.length; j++) {
      next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (left[i] === right[j] ? 0 : 1)));
    }
    row = next;
  }
  return row[right.length];
}

export function exerciseSuggestions(exercises: string[], input: string, limit = 8): string[] {
  const query = normalize(input);
  const seen = new Set<string>();
  return exercises.flatMap((name, index) => {
    const value = normalize(name);
    if (!value || seen.has(value)) return [];
    seen.add(value);
    let score = 0;
    if (query && value !== query) {
      if (value.startsWith(query)) score = 1;
      else if (value.includes(query)) score = 2;
      else {
        const tokens = query.split(' ');
        const words = value.split(' ');
        const matches = tokens.every(token => words.some(word => word.startsWith(token) ||
          (token.length >= 3 && distance(token, word) <= (token.length >= 6 ? 2 : 1))));
        let position = 0;
        for (const character of value) if (character === query[position]) position++;
        if (matches) score = 3;
        else if (query.length >= 2 && position === query.length) score = 4;
        else return [];
      }
    }
    return [{ name, score, index }];
  }).sort((a, b) => a.score - b.score || a.index - b.index).slice(0, limit).map(item => item.name);
}
