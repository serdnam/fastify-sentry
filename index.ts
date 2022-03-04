/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import * as Sentry from "@sentry/node"
// Sentry requires this to be imported
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as Tracing from "@sentry/tracing"
import { Scope, Span, Transaction } from "@sentry/types"

import type {
    DoneFuncWithErrOrRes,
    FastifyInstance, 
    FastifyPluginAsync, 
    FastifyReply, 
    FastifyRequest, 
    HookHandlerDoneFunction, 
    onRequestAsyncHookHandler, 
    onRequestHookHandler, 
    preParsingAsyncHookHandler, 
    preParsingHookHandler, 
    RequestPayload
} from "fastify"
import fastifyPlugin from 'fastify-plugin'

export const SentrySymbol = Symbol.for('Sentry')
const sentryTx = Symbol.for('sentryTx')
export const getTx = Symbol('getTx')
const setTx = Symbol('setTx')
const onRequestHookSymbol = Symbol('onRequest')
const parsingHookSymbol = Symbol('preParsing-parsing')
const validationHookSymbol = Symbol('preValidation-validation')
const handlerHookSymbol = Symbol('preHandler-handler')
const preSerializationHookSymbol = Symbol('preSerialization')
const onSendHook = Symbol('onSend')
const onResponseHook = Symbol('onResponse')

declare module 'fastify' {

    interface FastifyInstance {
        [SentrySymbol]: typeof Sentry,
    }

    interface FastifyRequest {
        
        [sentryTx]: Transaction
        [getTx]: () => Transaction
        [setTx]: (tx: Transaction) => void
        [onRequestHookSymbol]: Span
        [parsingHookSymbol]: Span
        [validationHookSymbol]: Span
        [handlerHookSymbol]: Span
        [preSerializationHookSymbol]: Span
        [onSendHook]: Span
        [onResponseHook]: Span
    }
}


type FastifyHook = 'onRequest' |
    'preParsing' |
    'preValidation' |
    'preHandler' |
    'preSerialization' |
    'onSend' |
    'onResponse';

const FASTIFY_HOOK_NAMES = [
    'onRequest',
    'preParsing',
    'preValidation',
    'preHandler',
    'preSerialization',
    'onSend',
    'onResponse'
]

const FASTIFY_HOOKS = [{
        name: 'onRequest', 
        symbol: onRequestHookSymbol,
        op: 'fastify-onRequest-hook',
        description: 'Fastify onRequest hook'
    }, { 
        name: 'preParsing',
        symbol: parsingHookSymbol,
        op: 'fastify-preParsing-parsing-hook',
        description: 'Fastify preParsing hook and parsing'
    }, {
        name: 'preValidation',
        symbol: validationHookSymbol,
        op: 'fastify-preValidation-validation-hook',
        description: 'Fastify preValidation hook and validation'
    }, {
        name: 'preHandler',
        symbol: handlerHookSymbol,
        op: 'fastify-preHandler-handler-hook',
        description: 'Fastify preHandler hook and handler'
    }, {
        name: 'preSerialization',
        symbol: preSerializationHookSymbol,
        op: 'fastify-preSerialization-serialization-hook',
        description: 'Fastify preSerialization hook and serialization'
    }, {
        name: 'onSend',
        symbol: onSendHook,
        op: 'fastify-onSend-hook',
        description: 'Fastify onSend hook'
    }, {
        name: 'onResponse',
        symbol: onResponseHook,
        op: 'fastify-onResponse-hook',
        description: 'Fastify onResponse hook'
    }] as const

export interface FastifySentryOptions {
    sentryOptions: Sentry.NodeOptions,
    performance?: {
        hooks: string[],
    }
    errorHandlerFactory?: () => Parameters<FastifyInstance['setErrorHandler']>[0]
    closeTimeout?: number
}

interface CleanOptions {
    sentryOptions: Sentry.NodeOptions,
    performance?: {
        hooks: FastifyHook[],
    }
    errorHandlerFactory: () => Parameters<FastifyInstance['setErrorHandler']>[0]
    closeTimeout: number
}

function allHooksAreValidHooks(hookNames: string[]): hookNames is FastifyHook[] {
    return hookNames.every((hookName) => {
        return FASTIFY_HOOK_NAMES.includes(hookName)
    })
}

// Type assertion function to avoid getting a warning for passing
// a function with an incorrect amount of parameters to addHook
function hookHandlesPayload(
    hookName: FastifyHook
): hookName is 'preParsing' | 'preSerialization' | 'onSend' {
    return ['preParsing', 'preSerialization', 'onSend'].includes(hookName)
}

function validateConfiguration(options: FastifySentryOptions): CleanOptions {
    const opts = Object.assign({}, options)

    opts.closeTimeout = opts.closeTimeout ?? 1000

    opts.errorHandlerFactory = opts.errorHandlerFactory ?? (
        () => (async function defaultErrorHandlerFactory(err, req, rep) {
            rep.log.error(err)
            if (rep.statusCode === 500) {
                return {
                    error: 500,
                    message: 'Internal server error'
                }
            } else {
                return err
            }
    }))

    const factoryType = typeof opts.errorHandlerFactory
    if (factoryType !== 'function') {
        throw new Error(`Invalid type received for errorHandlerFactory function, got ${factoryType}`)
    }

    if(opts.performance && opts.performance.hooks) {

        

        if(allHooksAreValidHooks(opts.performance.hooks)) {
            
            return {
                sentryOptions: opts.sentryOptions,
                performance: {
                    hooks: opts.performance.hooks || []
                },
                errorHandlerFactory: opts.errorHandlerFactory,
                closeTimeout: opts.closeTimeout
            }
        } else {
            throw new Error('Invalid hook(s) passed as parameter to performance.hooks')
        }
    }

    return {
        sentryOptions: opts.sentryOptions,
        errorHandlerFactory: opts.errorHandlerFactory,
        closeTimeout: opts.closeTimeout
    }
}

export default fastifyPlugin(async function FastifySentry(fastify, options) {
    
    const opts: CleanOptions = validateConfiguration(options)

    fastify.decorate(SentrySymbol, Sentry)
    fastify.decorateRequest(onRequestHookSymbol, null)
    fastify.decorateRequest(parsingHookSymbol, null)
    fastify.decorateRequest(validationHookSymbol, null)
    fastify.decorateRequest(handlerHookSymbol, null)
    fastify.decorateRequest(preSerializationHookSymbol, null)
    fastify.decorateRequest(onSendHook, null)
    fastify.decorateRequest(sentryTx, null)
    
    fastify.decorateRequest(getTx, function (this: FastifyRequest) {
        return this[sentryTx]
    })

    fastify.decorateRequest(setTx, function (this: FastifyRequest, tx: Transaction) {
        return this[sentryTx] = tx
    })

    Sentry.init(opts.sentryOptions)

    /*
        If the `performance` option was set, this plugin will start a transaction for the
        duration of the request, and it will also register spans for the Fastify hooks
        specified in the `performance.hooks` array.

        This is implemented by first starting a Sentry Transaction and attaching it to
        the request object during the onRequest hook, and then setting the status code
        and finishing it in the onResponse hook.

        If the `performance.hooks` array is not empty, the plugin will also register spans
        for the hooks defined in it. The way this is implemented is by starting a span within
        the given hook and finishing it at the beginning of the next.

        For example, if `performance.hooks` is `['onRequest']` this plugin will start a span at the 
        beginning of the onRequest hook and finish it when the preParsing hook starts.

        Some hooks don't happen right after the other, for example, between the 'preValidation'
        hook and the 'preHandler' hooks is the actual validation step, so adding 'preValidation' to
        `performance.hooks` creates a span that covers both the preValidation logic and also the
        validation process done by Fastify itself.

        Adding 'onResponse' to `performance.hooks` is not supported, since it is the last hook.
    */
    if (opts.performance) {
        fastify.addHook('onRequest', async function (req, rep) {
            const tx = Sentry.startTransaction({
                op: `${req.routerMethod ?? req.method} ${req.routerPath ?? req.url}`,
                name: `${req.routerPath ?? req.url}`,
            })


            req[setTx](tx)

    
            const scope: Scope = await new Promise((res, rej) => {
                Sentry.configureScope(scope => {
                    res(scope)
                })
            })


            scope.setSpan(tx)
        })

        for(const currentHookName of opts.performance.hooks) {
            if(currentHookName === 'onResponse') {
                throw new Error('Tracing for the onResponse hook is not supported.')
            }
            const currentHookIndex = FASTIFY_HOOKS.findIndex((hook) => hook.name === currentHookName)
            if (currentHookIndex === -1) {
                throw new Error(`Unknown hook: ${currentHookName}`)
            }
            const currentHook = FASTIFY_HOOKS[currentHookIndex]
            const nextHook = FASTIFY_HOOKS[currentHookIndex + 1]
    
            const startSpan = function (req: FastifyRequest) {
                const tx = req[getTx]()
                req[currentHook.symbol] = tx.startChild({
                    op: currentHook.op,
                    description: currentHook.description
                })
            }
    
            const finishSpan = function (req: FastifyRequest) {
                req[currentHook.symbol]?.finish()
            }
    
            
    
            const currentHookWithoutPayload = function (
                this: FastifyInstance, 
                req: FastifyRequest, 
                reply: FastifyReply,
                done: HookHandlerDoneFunction) {
                startSpan(req)
                done()
            }
            
            const currentHookWithPayload = function (
                this: FastifyInstance, 
                req: FastifyRequest, 
                reply: FastifyReply, 
                payload: RequestPayload,
                done: DoneFuncWithErrOrRes) {
                startSpan(req)
                done(null, payload)
            }

            
            /*
                TODO: Is there a way for types to work here so that the any cast is not necessary?
            */
            if(hookHandlesPayload(currentHook.name)) {
                fastify.addHook(currentHook.name as any, currentHookWithPayload)
            } else {
                fastify.addHook(currentHook.name as any, currentHookWithoutPayload)
            }
            
            const nextHookWithoutPayload: onRequestHookHandler = function (req, reply, done) {
                finishSpan(req)
                done()
            }
            
            const nextHookWithPayload: preParsingHookHandler = function (req, reply, payload, done) {
                finishSpan(req)
                done()
            }
    
            if(hookHandlesPayload(nextHook.name)) {
                fastify.addHook(nextHook.name as any, nextHookWithPayload)
            } else {
                fastify.addHook(nextHook.name as any, nextHookWithoutPayload)
            }
        }

        fastify.addHook('onResponse', function (req, rep, done) {
            const tx = req[getTx]()
            tx.setHttpStatus(rep.statusCode)
            tx.finish()
            done()
        })
    }

    const errorHandler = opts.errorHandlerFactory()
    const typeofErrorhandler = typeof errorHandler
    if (typeofErrorhandler !== 'function'){
        throw new Error(`Invalid errorHandlerFactory return value, received: ${typeofErrorhandler}`)
    }

    fastify.setErrorHandler(async function(error, req, reply) {
        Sentry.captureException(error)
        return errorHandler.call(this, error, req, reply)
    })

    fastify.addHook('onClose', async function () {
        await Sentry.close(opts.closeTimeout)
    })



}, { fastify: '>=3.0.0' }) as FastifyPluginAsync<FastifySentryOptions>
