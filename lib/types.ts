import * as Sentry from "@sentry/node"

export type FastifyHook = 'onRequest' |
    'preParsing' |
    'preValidation' |
    'preHandler' |
    'preSerialization' |
    'onSend' |
    'onResponse';

export const FASTIFY_HOOK_NAMES = [
    'onRequest',
    'preParsing',
    'preValidation',
    'preHandler',
    'preSerialization',
    'onSend',
    'onResponse'
]

export interface FastifySentryOptions {
    sentryOptions: Sentry.NodeOptions,
    performance?: {
        hooks: string[],
    }
    closeTimeout?: number
}

export interface CleanOptions {
    sentryOptions: Sentry.NodeOptions,
    performance?: {
        hooks: FastifyHook[],
    }
    closeTimeout: number
}