import * as Sentry from "@sentry/node";
import tap from 'tap';
import { getTx } from '../lib/plugin.js';

import fastify from "fastify";
import { FastifySentry } from "../lib/plugin.js";
import { RouteHandlerMethod } from "fastify/types/route";
import { FastifySentryOptions } from "../lib/types.js";

const DSN = 'https://public@sentry.example.com/1';

async function build(options: FastifySentryOptions, dummyHandler?: RouteHandlerMethod) {
    const server = fastify({});

    console.log(typeof FastifySentry)

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



tap.test('validation', async (t) => {

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




    t.test('Properly sets the public objects on the instance and request', async (t) => {

        t.plan(2);
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
        }, async function (req, rep) {
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

