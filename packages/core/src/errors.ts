export class PonderError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = "PonderError";
  }
}

export class MemoryNotFoundError extends PonderError {
  constructor(identifier: string) {
    super(`Memory not found: ${identifier}`, "MEMORY_NOT_FOUND", 404);
    this.name = "MemoryNotFoundError";
  }
}

export class DuplicateKeyError extends PonderError {
  constructor(key: string) {
    super(`Memory with key already exists: ${key}`, "DUPLICATE_KEY", 409);
    this.name = "DuplicateKeyError";
  }
}

export class ValidationError extends PonderError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends PonderError {
  constructor(message = "Invalid or missing API key") {
    super(message, "AUTHENTICATION_ERROR", 401);
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends PonderError {
  constructor(message = "Rate limit exceeded") {
    super(message, "RATE_LIMIT_ERROR", 429);
    this.name = "RateLimitError";
  }
}
