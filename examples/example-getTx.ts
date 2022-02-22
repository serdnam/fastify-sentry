import Fastify from 'fastify';
import FastifySentry, { getTx, SentrySymbol } from '../index.js';

const server = Fastify({ logger: true });

server.register(FastifySentry, {
        sentryOptions: {
            dsn: "https://public@sentry.example.com/1",
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

server.addHook('onRequest', async function (req, rep) {
    const tx = req[getTx]();
    tx.setTag('hookKey', 'I am setting a tag in a Fastify hook!');
})

server.register(async function route(fastify, options) {
    fastify.get('/', async function(this, req, reply) {
        const Sentry = this[SentrySymbol];
        const tx = req[getTx]();
        tx.setTag('requestKey', 'I am setting a tag in a route handler!');
        return { status: `OK` };
    });
}, { prefix: 'health' });


(async () => {
    try {
        await server.ready();
        await server.listen(4000, '0.0.0.0')
    } catch (err) {
        server.log.error(err)
        process.exit(1)
    }
})();