/**
 * Logging utilities for the daemon.
 *
 * Provides timestamp formatting for consistent log output.
 * All daemon log lines use the format: [${ts()}] [Component] message
 */

/**
 * Returns the current time as an ISO 8601 string.
 * Used as a prefix for all daemon log output.
 */
export function ts(): string {
  return new Date().toISOString();
}
