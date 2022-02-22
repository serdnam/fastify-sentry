import tap from "tap";
import * as td from 'testdouble';
import { FastifySentryOptions } from '../index.js'

import fastify, { RouteHandlerMethod, FastifyReply, FastifyRequest } from "fastify";

const DSN = 'https://public@sentry.example.com/1';

async function build(fastifySentry: any ,options: FastifySentryOptions, dummyHandler?: RouteHandlerMethod) {
    const server = fastify({});

    server.register(fastifySentry, options);

    server.get('/error', async function(req, rep) {
        throw new Error('Error!');
    });

    if(dummyHandler) {
        server.get('/dummy', dummyHandler);
    }

    await server.ready();

    return server;
}

const NOOP = () => {};
const fakeSetHttpStatus = td.func('fake setHttpStatus');

let Sentry: any;
let Tracing: any;
let fastifySentry: any;

tap.test('behavior', async (t) => {
    t.beforeEach(async () =>{
        Sentry = await td.replaceEsm('@sentry/node')
        Tracing = await td.replaceEsm('@sentry/tracing')
        td.when(Sentry.startTransaction(td.matchers.anything())).thenReturn({ startChild: () => ({ finish: NOOP }), setHttpStatus: fakeSetHttpStatus, finish: NOOP })
        td.when(Sentry.configureScope(td.callback)).thenCallback({ setSpan: () => {}}, {});
        td.when(Sentry.captureException(td.matchers.anything)).thenReturn(undefined);
        fastifySentry = await import('../index.js')
    });

    t.afterEach(() => {
        td.reset();
    })

    t.test('Properly sets the HTTP status code on a successfuly response', async (t) => {

        const server = await build(fastifySentry, {
            sentryOptions: {
                dsn: DSN,
            },
            performance: {
                hooks: [
                    'onRequest',
                    'preParsing',
                    'preValidation',
                    'preHandler',
                    'preSerialization',
                    'onSend'
                ]
            },
            errorHandlerFactory: () => async function (err, req, rep) {
                t.equal(this, server);
                return {};
            }
        });

        const res = await server.inject({
            method: 'GET',
            url: '/dummy'
        });

        td.verify(fakeSetHttpStatus(res.raw.res.statusCode));

    })

    t.test('Properly calls captureException and sets the status code when there is an error', async (t) => {

        const server = await build(fastifySentry, {
            sentryOptions: {
                dsn: DSN,
            },
            performance: {
                hooks: [
                    'onRequest',
                    'preParsing',
                    'preValidation',
                    'preHandler',
                    'preSerialization',
                    'onSend'
                ]
            },
            errorHandlerFactory: () => async function (err: Error, req: FastifyRequest, rep: FastifyReply) {
                return {};
            }
        });

        const res = await server.inject({
            method: 'GET',
            url: '/error'
        });

        td.verify(Sentry.captureException(td.matchers.isA(Error))); 
        td.verify(fakeSetHttpStatus(res.raw.res.statusCode));
    });

    t.test('Properly calls Sentry.close with the default timeout upon server closing', async (t) => {

        const server = await build(fastifySentry, {
            sentryOptions: {
                dsn: DSN,
            },
            performance: {
                hooks: [
                    'onRequest',
                    'preParsing',
                    'preValidation',
                    'preHandler',
                    'preSerialization',
                    'onSend'
                ]
            },
            errorHandlerFactory: () => async function (err: Error, req: FastifyRequest, rep: FastifyReply) {
                return {};
            }
        });

        await server.close();

        td.verify(Sentry.close(1000))

    });

    t.test('Properly calls Sentry.close with a passed-in timeout parameter upon server closing', async (t) => {

        const TIMEOUT = 50_000;

        const server = await build(fastifySentry, {
            sentryOptions: {
                dsn: DSN,
            },
            performance: {
                hooks: [
                    'onRequest',
                    'preParsing',
                    'preValidation',
                    'preHandler',
                    'preSerialization',
                    'onSend'
                ]
            },
            closeTimeout: TIMEOUT,
            errorHandlerFactory: () => async function (err: Error, req: FastifyRequest, rep: FastifyReply) {
                return {};
            }
        });

        await server.close();

        td.verify(Sentry.close(TIMEOUT))

    });
})