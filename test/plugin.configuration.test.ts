import * as Sentry from "@sentry/node";
import tap from 'tap';
import { getTx, SentrySymbol } from '../index.js';

import fastify from "fastify";
import fastifySentry, { FastifySentryOptions } from "../index.js";
import { RouteHandlerMethod } from "fastify/types/route";

const DSN = 'https://public@sentry.example.com/1';

async function build(options: FastifySentryOptions, dummyHandler?: RouteHandlerMethod) {
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



tap.test('validation', async (t) => {
    t.test('Rejects non-function errorHandlerFactory', async (t) => {
        await t.rejects(async () => {
            const server = await build({ 
                sentryOptions: {
                    dsn: DSN
                },
                errorHandlerFactory: () => 1 as any
            });

        })
    });

    t.test('Rejects non-function errorHandlerFactory return value', async (t) => {
        await t.rejects(async () => {
            const server = await build({ 
                sentryOptions: {
                    dsn: DSN
                },
                errorHandlerFactory: () => 1 as any
            });

        })
    });

    t.test('Rejects an unknown hook name', async (t) => {
        await t.rejects(async () => {
            const server = await build({ 
                sentryOptions: {
                    dsn: DSN
                },
                performance: {
                    hooks: ['thisisnotarealhookname']
                }
            });
        })
    });

    t.test('Rejects the onResponse hook', async (t) => {
        await t.rejects(async () => {
            const server = await build({
                sentryOptions: {
                    dsn: DSN
                },
                performance: {
                    hooks: ['onResponse']
                }
            });

        })
    });

    t.test('Does not reject the rest of the hooks', async (t) => {
        await t.resolves(async () => {
            const server = await build({
                sentryOptions: {
                    dsn: DSN
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
        })
    });

    t.test('Properly sets the Sentry object', async (t) => {
        const server = await build({
            sentryOptions: {
                dsn: DSN
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
        });
        t.equal(server[SentrySymbol], Sentry);
    });


    t.test('Properly sets the public objects on the instance and request', async (t) => {

        t.plan(3);
        const server = await build({
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
                console.log(err)
            }
        }, async function (req, rep) {
            t.ok(this[SentrySymbol]);
            t.ok(req[getTx]);
            t.ok(req[getTx]())
            return {}
        });


        await server.inject({
            method: 'GET',
            url: '/dummy'
        })
    })
    
});

