import {
  buildSelectInterestingPrompt,
  parseInspectIndex,
  parseSelectIndices,
} from './select-interesting';

describe('select-interesting helpers', () => {
  const items = [
    { title: 'A', lead: 'alpha' },
    { title: 'B', lead: 'beta' },
    { title: 'C', lead: 'gamma' },
  ];

  it('builds a prompt that names the quota and indices', () => {
    const prompt = buildSelectInterestingPrompt(
      items,
      2,
      'tech',
      '반도체',
    );

    expect(prompt).toContain('테마: tech');
    expect(prompt).toContain('관심: 반도체');
    expect(prompt).toContain('글 2개');
    expect(prompt).toContain('0. A');
    expect(prompt).toContain('select_briefs');
  });

  it('accepts a valid inspect index', () => {
    expect(parseInspectIndex({ index: 1 }, 3)).toEqual({
      ok: true,
      index: 1,
    });
  });

  it('rejects an out-of-range inspect index', () => {
    expect(parseInspectIndex({ index: 9 }, 3).ok).toBe(false);
  });

  it('accepts unique select indices of the requested length', () => {
    expect(parseSelectIndices({ indices: [2, 0] }, 3, 2)).toEqual({
      ok: true,
      indices: [2, 0],
    });
  });

  it('rejects wrong select length or duplicates', () => {
    expect(parseSelectIndices({ indices: [0] }, 3, 2).ok).toBe(false);
    expect(parseSelectIndices({ indices: [0, 0] }, 3, 2).ok).toBe(false);
  });
});
