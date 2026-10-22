export type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{results: T[]}>;
  run(): Promise<unknown>;
};
export type PlayerDatabase = {prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown>};
