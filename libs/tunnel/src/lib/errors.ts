export class TunnelError extends Error {}

export class ServerError extends TunnelError {}

export class ServerBusyError extends TunnelError {}

export class ResourceNotFoundError extends TunnelError {}

export class ClientBadRequestError extends TunnelError {}

export class ClientTooManyError extends TunnelError {}

export class ClientForbiddenError extends TunnelError {}

export class UpstreamTimeoutError extends TunnelError {}

export class UpstreamNotFoundError extends TunnelError {}

export class UpstreamUnavailableError extends TunnelError {}

