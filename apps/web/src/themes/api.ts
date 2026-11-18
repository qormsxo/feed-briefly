import { http } from '../lib/http';

export type NewsThemeOption = {
  id: string;
  label: string;
};

export type UserThemes = {
  catalog: NewsThemeOption[];
  selected: string[];
};

export function listThemes() {
  return http<UserThemes>('/api/themes');
}

export function saveThemes(themeIds: string[]) {
  return http<UserThemes>('/api/themes', {
    method: 'PUT',
    body: JSON.stringify({ themeIds }),
  });
}

export type UserKeywords = {
  focus: string;
  exclude: string[];
};

export function listKeywords() {
  return http<UserKeywords>('/api/keywords');
}

export function saveKeywords(keywords: UserKeywords) {
  return http<UserKeywords>('/api/keywords', {
    method: 'PUT',
    body: JSON.stringify(keywords),
  });
}
