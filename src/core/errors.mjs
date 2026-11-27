export class TravelGuideError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'TravelGuideError';
    this.code = options.code ?? 'EGENERIC';
    this.exitCode = options.exitCode ?? 1;
    this.details = options.details;
    if (options.cause) this.cause = options.cause;
  }
}

export class UsageError extends TravelGuideError {
  constructor(message, options = {}) {
    super(message, { code: 'EUSAGE', exitCode: 2, ...options });
    this.name = 'UsageError';
  }
}

export class ValidationError extends TravelGuideError {
  constructor(message, options = {}) {
    super(message, { code: 'EVALIDATION', exitCode: 1, ...options });
    this.name = 'ValidationError';
  }
}

export class ProviderError extends TravelGuideError {
  constructor(message, options = {}) {
    super(message, { code: 'EPROVIDER', exitCode: 1, ...options });
    this.name = 'ProviderError';
    this.provider = options.provider;
    this.status = options.status;
  }
}

export function assert(condition, message, options = {}) {
  if (!condition) throw new TravelGuideError(message, options);
}
