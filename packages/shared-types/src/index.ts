/**
 * Shared TypeScript types for Regalica IDC.
 *
 * Consumed by:
 *   - @regalica/api (Express backend)
 *   - @regalica/chatbot-node (gateway)
 *   - @regalica/frontend (Angular)
 *
 * Keep wire-level DTOs here. Domain logic belongs in the services that own it.
 */

export * from './health';
export * from './verdict';
export * from './tenant';
