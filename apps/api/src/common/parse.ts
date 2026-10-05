const objectTag = Object.prototype.toString;

export function isString(value: unknown): value is string {
  return objectTag.call(value) === '[object String]';
}

export function isNumber(value: unknown): value is number {
  return objectTag.call(value) === '[object Number]';
}

export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

export interface PlainRecord {
  readonly parsed?: true;
}

export function isPlainRecord(value: unknown): value is PlainRecord {
  return objectTag.call(value) === '[object Object]';
}
