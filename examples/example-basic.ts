import Fastify from 'fastify';
import Sentry, { FastifySentry, getTx } from '../index.js';

const server = Fastify({ logger: true });

server.register(FastifySentry, {
        sentryOptions: {
            dsn: "https://public@sentry.example.com/1",
            tracesSampleRate: 0.1,
            debug: false
        },
    }
);

server.register(async function route(fastify, options) {
    fastify.get('/', async function(req, reply) {
        if (Math.random() < 0.5) {
            throw new Error('Error')
        }
        return { status: `OK` };
    });
}, { prefix: 'test' });

server.setErrorHandler((error, req, rep)  => {
    Sentry.captureException(error)
    rep.status(500).send({ message: 'Server error' })
});


(async () => {
    try {
        await server.ready();
        await server.listen({ port: 4000, host: '0.0.0.0' })
    } catch (err) {
        server.log.error(err)
        process.exit(1)
    }
})();