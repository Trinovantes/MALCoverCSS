import { BundleRenderer } from 'vue-server-renderer'
import ConnectRedis from 'connect-redis'
import createHttpError, { HttpError } from 'http-errors'
import express, { RequestHandler, Express, ErrorRequestHandler, Router } from 'express'
import http from 'http'
import morgan from 'morgan'
import redis from 'redis'
import session from 'express-session'

import { apiRouter } from '@api/expressRouter'
import { debugInfo } from '@api/middleware/dev'
import { setUserInLocals } from '@api/middleware/user'
import { logger } from '@common/utils/logger'
import { getSecret, Secrets } from '@common/Secrets'
import Constants from '@common/Constants'
import { normalizePort } from '@common/utils'
import { sequelize } from '@common/models/db'
import { AppContext } from '@web/entryServer'

// ----------------------------------------------------------------------------
// ENV
// ----------------------------------------------------------------------------

const publicPath = DEFINE.PUBLIC_PATH
const staticDir = DEFINE.STATIC_DIR
const serverDir = DEFINE.SERVER_DIR
const clientDir = DEFINE.CLIENT_DIR

if (!publicPath || !staticDir || !serverDir || !clientDir) {
    throw new Error('Missing DEFINES')
}

// -----------------------------------------------------------------------------
// Express
// -----------------------------------------------------------------------------

const app = express()

// Handle non-GET request bodies
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// Logging
app.use(morgan(DEFINE.IS_DEV ? 'dev' : 'combined'))

// Set up sessions
if (!DEFINE.IS_DEV) {
    app.set('trust proxy', 1)
}
app.use(session({
    secret: getSecret(Secrets.ENCRYPTION_KEY),
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: Constants.COOKIE_DURATION,
        httpOnly: true, // Cookies will not be available to Document.cookie api
        secure: !DEFINE.IS_DEV, // Cookies only sent over https
    },
    store: (() => {
        const RedisStore = ConnectRedis(session)
        const redisClient = redis.createClient({ host: 'cache' })
        return new RedisStore({ client: redisClient })
    })(),
}))

// -----------------------------------------------------------------------------
// Static Handlers
// -----------------------------------------------------------------------------

// Serves unprocessed files in /static dir
app.use(express.static(staticDir))

// Serves webpack generated assets (js/css/img)
app.use(publicPath, express.static(clientDir))

// -----------------------------------------------------------------------------
// HTTP Server
// -----------------------------------------------------------------------------

async function createViewRouter(app: Express): Promise<Router> {
    let renderer: BundleRenderer | undefined
    let rendererSetup: RendererSetup

    // Need runtime require resolution because we will not be installing devDependencies in production
    if (DEFINE.IS_DEV) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { setupDevMiddleware } = require('@web/rendererDev') as { setupDevMiddleware: RendererSetup }
        rendererSetup = setupDevMiddleware
    } else {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { setupProdMiddleware } = require('@web/rendererProd') as { setupProdMiddleware: RendererSetup }
        rendererSetup = setupProdMiddleware
    }

    await rendererSetup(app, (newRenderer) => {
        renderer = newRenderer
    })

    const vueHandler: RequestHandler = (req, res, next) => {
        if (!renderer) {
            return next(new createHttpError.InternalServerError('Undefined Renderer'))
        }

        const ssrContext: AppContext = {
            url: req.originalUrl,
            title: Constants.APP_NAME,
            statusCode: 200,
            req: req,
            res: res,
        }

        renderer.renderToString(ssrContext, (error, html) => {
            if (error) {
                logger.warn('Vue SSR Error (%s:%s)', error.name, error.message)
                logger.debug(error.stack)
                return next(new createHttpError.InternalServerError(error.message))
            }

            return res.status(ssrContext.statusCode).send(html)
        })
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
        const error = err as Error | HttpError

        // Set locals, only providing error in development
        const status = DEFINE.IS_DEV && (error instanceof HttpError) ? error.status : 500
        const message = DEFINE.IS_DEV ? error.stack || 'No stacktrace available' : 'Internal Server Error'

        return res.status(status).send(`<pre>${message}</pre>`)
    }

    const router = express.Router()
    router.use(vueHandler)
    router.use(errorHandler)
    return router
}

async function runHttpServer() {
    const port = normalizePort(process.env.PORT || '8080')
    const server = http.createServer(app)

    if (DEFINE.IS_DEV) {
        require('@common/models/Item')
        require('@common/models/User')

        logger.info('Synchronizing Database')
        await sequelize.sync()
    }

    logger.info('Setting up Handlers')
    app.use('/api', setUserInLocals, debugInfo, apiRouter)
    app.use('*', debugInfo, await createViewRouter(app))

    logger.info('Starting HTTP Web Server')
    server.listen(port, () => {
        logger.info('Server Listening %d', port)
    })

    server.on('error', (error) => {
        logger.error(error)
    })
}

void runHttpServer()
