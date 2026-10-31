/** Repository-layer domain errors. Kept free of HTTP concepts. */
export class DuplicateEmailError extends Error {
  constructor() {
    super('Email is already registered.');
    this.name = 'DuplicateEmailError';
    this.code = 'DUPLICATE_EMAIL';
  }
}

export class RepositoryConflictError extends Error {
  constructor(message, code = 'CONFLICT') {
    super(message);
    this.name = 'RepositoryConflictError';
    this.code = code;
  }
}
