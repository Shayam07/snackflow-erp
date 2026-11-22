"""Domain error types mapped to HTTP responses by the application handlers.

They subclass ValueError so service-layer callers and tests can keep treating bad
business input as a ValueError while the API renders a precise status code.
"""


class DomainError(ValueError):
    """A business rule rejected the operation (HTTP 400)."""


class ConflictError(DomainError):
    """The operation clashes with current state, e.g. a duplicate or a shortage (HTTP 409)."""
