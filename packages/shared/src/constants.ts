/**
 * Shared bb-browser constants.
 */

/** Daemon HTTP port. */
export const DAEMON_PORT = 19824;

/** Daemon host. */
export const DAEMON_HOST = "127.0.0.1";

/** SSE heartbeat interval in milliseconds. */
export const SSE_HEARTBEAT_INTERVAL = 15000;

/** Command execution timeout in milliseconds. */
export const COMMAND_TIMEOUT = 120000;

/** SSE reconnect delay in milliseconds. */
export const SSE_RECONNECT_DELAY = 3000;

/** Maximum SSE reconnect attempts. */
export const SSE_MAX_RECONNECT_ATTEMPTS = 5;
