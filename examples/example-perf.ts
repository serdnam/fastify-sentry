import Fastify from 'fastify';
import { FastifySentry } from '../lib/plugin.js';

const server = Fastify({ logger: true });

server.register(FastifySentry, {
    sentryOptions: {
        dsn: "https://public@sentry.example.com/1",
        tracesSampleRate: 0.1,
        debug: false
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

server.register(async function route(fastify, options) {
    fastify.get('/', async function (req, reply) {
        return { status: `OK` };
    });
}, { prefix: 'test' });


(async () => {
try {
    await server.ready();
    await server.listen({ host: '0.0.0.0', port: 4000 })
} catch (err) {
    server.log.error(err)
    process.exit(1)
}
})();