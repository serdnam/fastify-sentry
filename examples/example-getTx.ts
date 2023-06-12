import Fastify from 'fastify';
import pino, { levels } from 'pino'
import Sentry, { FastifySentry, getTx } from '../index.js';
import { setTimeout } from 'timers/promises';


const server = Fastify({ logger: true })
let counter = 0;

server.register(FastifySentry, {
        sentryOptions: {
            dsn: "",
            tracesSampleRate: 1.0,
            debug: true
        },
        performance: {
            hooks: [
            'onRequest',
            'preParsing',
            'preValidation',
            'preHandler',
            'preSerialization',
            'onSend'
            ],
        },
    }
);

server.decorateRequest('counter', 0)

server.addHook('onRequest', async function (req, rep) {
    (req as any).counter = counter++
    const tx = Sentry.getCurrentHub().getScope().getTransaction()
    
    tx?.setTag('hookKey', `I am setting a tag in an onRequest Fastify hook!`);
    console.log('onRequest', (req as any).counter, tx)
    console.log((req as any).counter)
})

server.addHook('preParsing', async function (req, rep) {
    const tx = Sentry.getCurrentHub().getScope().getTransaction()
    await setTimeout(Math.floor(Math.random() * 10000))
    tx?.setTag('hookKey', `I am setting a tag in an preParsing Fastify hook!`);
    console.log('preParsing', tx)
    console.log((req as any).counter)
})

server.addHook('preValidation', async function (req, rep) {
    const tx = Sentry.getCurrentHub().getScope().getTransaction()
    await setTimeout(Math.floor(Math.random() * 10000))
    tx?.setTag('hookKey', `I am setting a tag in an preValidation Fastify hook!`);
    console.log('preValidation', tx)
    console.log((req as any).counter)
})

server.addHook('preHandler', async function (req, rep) {
    const tx = Sentry.getCurrentHub().getScope().getTransaction()
    await setTimeout(Math.floor(Math.random() * 10000))
    tx?.setTag('hookKey', `I am setting a tag in an preHandler Fastify hook!`);
    console.log('preHandler', tx)
    console.log((req as any).counter)
})


server.addHook('onSend', async function (req, rep) {
    const tx = Sentry.getCurrentHub().getScope().getTransaction()
    await setTimeout(Math.floor(Math.random() * 10000))
    tx?.setTag('hookKey', `I am setting a tag in an onSend Fastify hook!`);
    console.log('onSend', tx)
    console.log((req as any).counter)
    req.log.info('COUNTER', (req as any).counter)
})

server.register(async function route(fastify, options) {
    fastify.get('/', async function(this, req, reply) {
        
        const tx = req[getTx]();
        tx?.setTag('requestKey', 'I am setting a tag in a route handler!');
        return { status: `OK` };
    });
}, { prefix: 'test' });


(async () => {
    try {
        await server.ready();
        await server.listen({ port: 4000, host: '0.0.0.0' })
    } catch (err) {
        server.log.error(err)
        process.exit(1)
    }
})();