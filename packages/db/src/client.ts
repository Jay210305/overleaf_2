import pg from "pg";

export type UUID = string;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUUID(value: unknown): value is UUID {
  return typeof value === "string" && UUID_REGEX.test(value);
}

export function assertUUID(value: unknown, name = "id"): asserts value is UUID {
  if (!isUUID(value)) {
    throw new PersistenceError("CONSTRAINT_VIOLATION", `Invalid UUID format for ${name}`, false);
  }
}

export interface TransactionContext {
  query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<{ rows: Row[]; rowCount: number }>;
}

export type PersistenceErrorCode =
  "CONSTRAINT_VIOLATION" | "TRANSACTION_CONFLICT" | "DATABASE_UNAVAILABLE";

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;
  readonly retryable: boolean;

  constructor(code: PersistenceErrorCode, message: string, retryable: boolean, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PersistenceError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function mapDatabaseError(error: unknown): PersistenceError {
  if (error instanceof PersistenceError) {
    return error;
  }

  const err = error as { code?: string; message?: string };
  const sqlCode = err.code ?? "";

  // Postgres constraint violation codes
  if (
    sqlCode === "23505" || // unique_violation
    sqlCode === "23503" || // foreign_key_violation
    sqlCode === "23514" || // check_violation
    sqlCode === "23502" || // not_null_violation
    sqlCode.startsWith("22") // data exceptions (22P02 invalid text, 22007 invalid datetime, etc.)
  ) {
    return new PersistenceError("CONSTRAINT_VIOLATION", err.message || "Database constraint violation", false, { cause: error });
  }

  // Postgres transaction conflict / serialization failure / deadlock
  if (sqlCode === "40001" || sqlCode === "40P01") {
    return new PersistenceError("TRANSACTION_CONFLICT", "Transaction concurrency conflict", true, { cause: error });
  }

  // Database unavailable / connection errors
  if (
    sqlCode.startsWith("08") ||
    sqlCode === "57P01" ||
    sqlCode === "57P02" ||
    sqlCode === "57P03" ||
    (err.message && /ECONNREFUSED|connection timeout|Connection terminated/i.test(err.message))
  ) {
    return new PersistenceError("DATABASE_UNAVAILABLE", "Database service unavailable", true, { cause: error });
  }

  return new PersistenceError("CONSTRAINT_VIOLATION", err.message || "Database operation failed", false, { cause: error });
}

export class DatabaseClient {
  private readonly pool: pg.Pool;

  constructor(connection: string | pg.Pool) {
    if (typeof connection === "string") {
      this.pool = new pg.Pool({
        connectionString: connection,
        connectionTimeoutMillis: 5000,
        query_timeout: 10000,
        max: 10,
      });
    } else {
      this.pool = connection;
    }
  }

  getPool(): pg.Pool {
    return this.pool;
  }

  async query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<{ rows: Row[]; rowCount: number }> {
    try {
      const result = await this.pool.query<Row>(sql, parameters as unknown[]);
      if (Array.isArray(result)) {
        const last = result[result.length - 1];
        return {
          rows: last?.rows ?? [],
          rowCount: last?.rowCount ?? 0,
        };
      }
      return {
        rows: result.rows ?? [],
        rowCount: result.rowCount ?? result.rows?.length ?? 0,
      };
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async transaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const client = await this.pool.connect().catch((error) => {
      throw mapDatabaseError(error);
    });

    try {
      await client.query("BEGIN");
      const tx: TransactionContext = {
        async query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
          sql: string,
          parameters: readonly unknown[] = [],
        ) {
          try {
            const res = await client.query<Row>(sql, parameters as unknown[]);
            if (Array.isArray(res)) {
              const last = res[res.length - 1];
              return {
                rows: last?.rows ?? [],
                rowCount: last?.rowCount ?? 0,
              };
            }
            return {
              rows: res.rows ?? [],
              rowCount: res.rowCount ?? res.rows?.length ?? 0,
            };
          } catch (error) {
            throw mapDatabaseError(error);
          }
        },
      };

      const result = await work(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Rollback failure suppressed; prioritize original error
      }
      if (error instanceof PersistenceError) {
        throw error;
      }
      const err = error as { code?: string };
      // Application errors may also carry a `code`; only SQLSTATE values
      // should be translated into persistence failures here.
      if (typeof err.code === "string" && /^[0-9A-Z]{5}$/.test(err.code)) {
        throw mapDatabaseError(error);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
