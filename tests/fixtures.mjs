const json = JSON.stringify;
export const fixtures = {
  'lizard-dashboard.hidden-cards.v1': json(['weather-card']),
  'lizard-dashboard.card-order.v1': json(['todo-card', 'quiz-card', 'countdown-card', 'weather-card']),
  'lizard-dashboard.recent-tools.v1': json(['delim-lizard', 'compare-lizard', 'format-lizard']),
  'lizard-dashboard.optional-cards.v1': json([]),
  'luftblasen.progress.v1': json({ version: 1, settings: { theme: 'classic', difficulty: 3, music: true, pops: false }, scores: [{ scoringVersion: 1, score: 12840, difficulty: 3, round: 12, timePlayedMs: 95000, bestStreak: 9, bubblesPopped: 76, date: '2026-11-19T12:00:00.000Z', theme: 'classic' }] }),
  'todo-lizard:v1': json([{ id: 't1', title: 'Back up the planner', dueDate: '2028-02-29', priority: 'high', completed: false, createdAt: '2026-11-18T12:00:00Z', completedAt: null }]),
  'todo-lizard:settings:v1': json({ filter: 'active', sort: 'due', search: '' }),
  'timeuntil.events.v1': json({ events: [{ id: 'e1', name: 'Holiday', target: '2026-12-25T12:00:00.000Z', color: 'gold' }], selected: 'e1' }),
  'timeuntil.clock.color.v1': 'violet',
  'quiz-your-lizard:v1': json({ version: 1, quizzes: [{ id: 'q1', name: 'Practice', description: '', base: { id: 'q1', revision: 2, modified: true }, cards: [{ id: 'c1', question: '2 + 2', answer: '4', notes: '', wrongAnswers: ['5'] }] }], settings: { count: 20, reverse: true, secondChance: true }, history: [{ quizName: 'Practice', mode: 'quiz', total: 1, first: 1, second: 0, wrong: 0, date: '2026-11-18T12:00:00Z' }] }),
  'weather-lizard.location.v1': json({ latitude: 39.103, longitude: -84.512 }),
  'format-lizard.workspace.v1': json({ input: '{"message":"hello"}', output: '{\n  "message": "hello"\n}', format: 'json', indent: '2', sortKeys: true, view: 'tree', outputFormat: 'json' }),
  'format-lizard.workspace.v2': json({ input: '<root/>', output: '<root/>', format: 'xml', indent: '2', sortKeys: false, view: 'text', outputFormat: 'xml' }),
  'compare-lizard.workspace.v1': json({ left: '{"a":1}', right: '{"a":2}', format: 'json', mode: 'semantic', filter: 'all', strictValues: true, ignoreKeyOrder: false, includeEqual: true, rows: [{ path: '$.a', type: 'changed', left: 1, right: 2 }], fileNames: { left: 'a.json', right: 'b.json' }, status: { message: '1 difference', type: 'valid' } }),
  'delim-lizard.workspace.v1': json({ input: 'a\nb', settings: { preset: 'sql', delimiter: ',', customDelimiter: '', quoteStyle: 'single', prefix: 'IN (', suffix: ')', inputSeparator: 'line', customInputSeparator: '', trimValues: true, removeBlanks: true, removeDuplicates: true, sortValues: false } })
};
