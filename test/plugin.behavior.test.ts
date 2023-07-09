import tap from "tap";
import * as td from 'testdouble';
import { FastifySentryOptions } from '../lib/types.js'

import fastify, { RouteHandlerMethod, FastifyReply, FastifyRequest } from "fastify";

const DSN = 'https://public@sentry.example.com/1';

async function build(FastifySentry: any, options: FastifySentryOptions, dummyHandler?: RouteHandlerMethod) {
    const server = fastify({});

    server.register(FastifySentry, options);

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
let FastifySentry: any;

tap.test('behavior', async (t) => {
    t.beforeEach(async () =>{
        Sentry = td.replace('@sentry/node')
        td.when(Sentry.startTransaction(td.matchers.anything())).thenReturn({ startChild: () => ({ finish: NOOP }), setHttpStatus: fakeSetHttpStatus, finish: NOOP })
        FastifySentry = require('../lib/plugin.js').FastifySentry
    });

    t.afterEach(() => {
        td.reset();
    })

    t.test('Properly sets the HTTP status code on a successfuly response', async (t) => {

        const server = await build(FastifySentry, {
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
            }
        });

        const res = await server.inject({
            method: 'GET',
            url: '/dummy'
        });

        td.verify(fakeSetHttpStatus(res.raw.res.statusCode));

    })


    t.test('Properly calls Sentry.close with the default timeout upon server closing', async (t) => {

        const server = await build(FastifySentry, {
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
            }
        });

        await server.close();

        td.verify(Sentry.close(1000))

    });

    t.test('Properly calls Sentry.close with a passed-in timeout parameter upon server closing', async (t) => {

        const TIMEOUT = 50_000;

        const server = await build(FastifySentry, {
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
            closeTimeout: TIMEOUT
        });

        await server.close();

        td.verify(Sentry.close(TIMEOUT))

    });
})