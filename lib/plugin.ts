/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import * as Sentry from "@sentry/node"
import { Span, Transaction } from "@sentry/types"

import {
    DoneFuncWithErrOrRes,
    FastifyInstance, 
    FastifyPluginAsync, 
    FastifyReply, 
    FastifyRequest, 
    HookHandlerDoneFunction,
    onRequestHookHandler,
    preParsingHookHandler, 
    RequestPayload
} from "fastify"
import fastifyPlugin from 'fastify-plugin'
import { CleanOptions, FASTIFY_HOOK_NAMES, FastifyHook, FastifySentryOptions } from "./types.js"
import { AsyncResource } from "async_hooks"

export const SentrySymbol = Symbol.for('Sentry')
const sentryTx = Symbol.for('sentryTx')
export const getTx = Symbol('getTx')
const setTx = Symbol('setTx')
const spansSymbol = Symbol('fastify-sentry')
const asyncResourceSymbol = Symbol('fastify-sentry-async-resource')


declare module 'fastify' {

    interface FastifyRequest {
        [asyncResourceSymbol]: AsyncResource
        [sentryTx]: Transaction | null
        [getTx]: () => Transaction | null
        [setTx]: (tx: Transaction) => void
        [spansSymbol]: Record<FastifyHook, Span | null>
    }
}



const FASTIFY_HOOKS = [{
        name: 'onRequest', 
        op: 'fastify-onRequest-hook',
        description: 'Fastify onRequest hook'
    }, { 
        name: 'preParsing',
        op: 'fastify-preParsing-parsing-hook',
        description: 'Fastify preParsing hook and parsing'
    }, {
        name: 'preValidation',
        op: 'fastify-preValidation-validation-hook',
        description: 'Fastify preValidation hook and validation'
    }, {
        name: 'preHandler',
        op: 'fastify-preHandler-handler-hook',
        description: 'Fastify preHandler hook and handler'
    }, {
        name: 'preSerialization',
        op: 'fastify-preSerialization-serialization-hook',
        description: 'Fastify preSerialization hook and serialization'
    }, {
        name: 'onSend',
        op: 'fastify-onSend-hook',
        description: 'Fastify onSend hook'
    }, {
        name: 'onResponse',
        op: 'fastify-onResponse-hook',
        description: 'Fastify onResponse hook'
}] as const

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
    opts.captureException = opts.captureException ?? true

    if(opts.performance && opts.performance.hooks) {

        if(allHooksAreValidHooks(opts.performance.hooks)) {
            
            return {
                sentryOptions: opts.sentryOptions,
                performance: {
                    hooks: opts.performance.hooks || []
                },
                closeTimeout: opts.closeTimeout,
                captureException: opts.captureException
            }
        } else {
            throw new Error('Invalid hook(s) passed as parameter to performance.hooks')
        }
    }

    return {
        sentryOptions: opts.sentryOptions,
        closeTimeout: opts.closeTimeout,
        captureException: opts.captureException
    }
}

const FastifySentry = fastifyPlugin(async function FastifySentry(fastify, options) {
    
    const opts: CleanOptions = validateConfiguration(options)

    fastify.decorateRequest(asyncResourceSymbol, null)

    fastify.decorateRequest(spansSymbol, null)
    
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

        fastify.addHook('onRequest', function (req, rep, done) {
            Sentry.runWithAsyncContext(() => {
                const asyncResource = new AsyncResource('fastify-sentry')
                req[asyncResourceSymbol] = asyncResource
                asyncResource.runInAsyncScope(done, req.raw)
            })
        })

        fastify.addHook('onRequest', function (req, rep, done) {
            const method = req.routeOptions?.method ?? req.routerMethod ?? req.method;
            const path = req.routeOptions?.url ?? req.routerPath ?? req.url;
            const tx = Sentry.startTransaction({
                op: `${method} ${path}`,
                name: path,
                
            })


            Sentry.getCurrentHub().configureScope((scope) => scope.setSpan(tx))

            req[setTx](tx)
            req[spansSymbol] = {
                'onRequest': null,
                'preParsing': null,
                'preValidation': null,
                'preHandler': null,
                'preSerialization': null,
                'onSend': null,
                'onResponse': null
            }

            done()
        })

        /*
            See: 
            https://github.com/fastify/fastify-request-context/blob/cc48c4796a6dabb45d31036c501237bcb8754b93/index.js#L32-L35
        */
        fastify.addHook('preValidation', function (req, rep, done) {
            const asyncResource = req[asyncResourceSymbol]
            asyncResource.runInAsyncScope(done, req.raw)
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
    
            const startSpan = function (currentHook: typeof FASTIFY_HOOKS[number]) {
                return function (req: FastifyRequest) {
                    const tx = req[getTx]()
                    req[spansSymbol][currentHook.name] = tx?.startChild({
                        op: currentHook.op,
                        description: currentHook.description
                    }) || null
                }
            }
            
            const finishSpan = function (currentHook: typeof FASTIFY_HOOKS[number]) {
                return function (req: FastifyRequest) {
                    req[spansSymbol][currentHook.name]?.finish()
                }
            }
            
            const currentHookWithoutPayload = function (
                this: FastifyInstance, 
                req: FastifyRequest, 
                reply: FastifyReply,
                done: HookHandlerDoneFunction) {
                startSpan(currentHook)(req)
                done()
            }
            
            const currentHookWithPayload = function (
                this: FastifyInstance, 
                req: FastifyRequest, 
                reply: FastifyReply, 
                payload: RequestPayload,
                done: DoneFuncWithErrOrRes) {
                startSpan(currentHook)(req)
                done(null, payload)
            }

            
        
            if(hookHandlesPayload(currentHook.name)) {
                fastify.addHook(currentHook.name as any, currentHookWithPayload)
            } else {
                fastify.addHook(currentHook.name as any, currentHookWithoutPayload)
            }
            
            const nextHookWithoutPayload: onRequestHookHandler = function (req, reply, done) {
                finishSpan(currentHook)(req)
                done()
            }
            
            const nextHookWithPayload: preParsingHookHandler = function (req, reply, payload, done) {
                finishSpan(currentHook)(req)
                done()
            }
    
            if(hookHandlesPayload(nextHook.name)) {
                fastify.addHook(nextHook.name as any, nextHookWithPayload)
            } else {
                fastify.addHook(nextHook.name as any, nextHookWithoutPayload)
            }
        }       
        fastify.addHook('onError', function (request, reply, error, done) {
            for (let i = FASTIFY_HOOKS.length - 1; i >= 0; i--) {
                const hookName = FASTIFY_HOOKS[i].name
                const span = request[spansSymbol][hookName]
                if (span) {
                    span.finish()
                    break
                }
            }
            if (opts.captureException) {
                Sentry.captureException(error)
            }
            done()
        })

        fastify.addHook('onResponse', function (req, rep, done) {
            const tx = req[getTx]()
            tx?.setHttpStatus(rep.statusCode)
            tx?.finish()
            done()
        })

        fastify.addHook('onTimeout', function (req, rep, done) {
            const tx = req[getTx]()
            tx?.finish()
            done()
        })

    }


    fastify.addHook('onClose', async function () {
        await Sentry.close(opts.closeTimeout)
    })



}, { fastify: '>=4.5.0' }) as FastifyPluginAsync<FastifySentryOptions>

export { FastifySentry }

export default Sentry
