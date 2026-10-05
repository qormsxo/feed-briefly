const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const objectTag = Object.prototype.toString;

function isString(value: unknown): value is string {
  return objectTag.call(value) === '[object String]';
}

interface PlainRecord {
  readonly parsed?: true;
}

function isPlainRecord(value: unknown): value is PlainRecord {
  return objectTag.call(value) === '[object Object]';
}

interface ErrorPayload {
  message?: string | string[];
}

function isErrorPayload(value: unknown): value is ErrorPayload {
  if (!isPlainRecord(value)) {
    return false;
  }

  if (!('message' in value) || value.message === undefined) {
    return true;
  }

  return isString(value.message) || isStringArray(value.message);
}

function isStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) {
    return false;
  }

  for (const item of value) {
    if (!isString(item)) {
      return false;
    }
  }

  return true;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }

  if (response.status === 204) {
    // SAFETY: 204 responses have an empty body, and callers of those routes use void.
    return undefined as T;
  }

  const body: unknown = await response.json();

  // SAFETY: T is the response contract the caller picked for this path.
  return body as T;
}

async function readErrorMessage(response: Response) {
  const body = await response.text();

  try {
    const json: unknown = JSON.parse(body);

    if (!isErrorPayload(json)) {
      return body || response.statusText;
    }

    if (isStringArray(json.message)) {
      return json.message.join(', ');
    }

    if (isString(json.message) && json.message) {
      return json.message;
    }
  } catch {
    // text/plain
  }

  return body || response.statusText;
}
