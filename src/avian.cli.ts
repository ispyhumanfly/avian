#!/usr/bin/env node
import "./functions/sentryInstrument"
import cluster from "cluster"
import history from "connect-history-api-fallback"
import * as cookie from "cookie"
import * as signature from "cookie-signature"
import * as crypto from "crypto"
import * as events from "events"
import { RequestHandler } from "express"
import express from "express"
import { json } from "express"
import session from "express-session"
import * as fs from "graceful-fs"
import * as glob from "fast-glob"
import * as https from "https"
import * as Sentry from "@sentry/node";
import { mkdirp } from "mkdirp"
import * as path from "path"
import * as ts from "typescript"
import * as redis from "redis"
import * as rimraf from "rimraf"
import { argv, utils } from "./avian.lib"
import {Chunk, Compiler, MultiCompiler, Stats } from "webpack"

import injectArgv from "./middlewares/injectArgv"
import {loadAppRoutesIntoAvian, loadAppServerFilesIntoAvian }from "./functions/loadAppServersIntoAvian"
import capitalizeFirstLetter from "./functions/capitalizeFirstLetter"
import expressStaticGzip from "express-static-gzip"

declare interface CallbackFunction<T> {
    (err?: null | Error, result?: T): any;
}

// TODO this should be undefined, but perhaps not empty for this evaluation...
if (argv.webpackHome === "") argv.webpackHome = argv.home

// TODO consider moving to avian.lib.ts as this is a constant that is used in multiple files.
const sessionSecret = process.env.AVIAN_APP_SESSION_SECRET || crypto.createHash("sha512").digest("hex")

const avianEmitter = new events.EventEmitter()
const runningBuilds = {
    serverFiles: false,
    components: false,
}

avianEmitter.on("buildStarted", (name: string) => {
    console.log(`Avian - Started Bundling ${capitalizeFirstLetter(name)}`)
    if (name === "serverFiles") {
        runningBuilds.serverFiles = true
    } else if (name === "components") {
        runningBuilds.components = true
    }
})

let needsServerRestart = false
avianEmitter.on("buildCompleted", (name: string, changedChunks: string[]) => {
    // there is a possibility that a compilation got kicked off and nothing was done
    if (changedChunks.length !== 0 && name === "serverFiles") {
        needsServerRestart = true
    }

    console.log(`Avian - Finished Bundling ${capitalizeFirstLetter(name)}`)
    if (name === "serverFiles") {
        runningBuilds.serverFiles = false
    } else if (name === "components") {
        runningBuilds.components = false
    }
    if (runningBuilds.components === false && runningBuilds.serverFiles === false) {
        if (argv.bundleOnly) {
            console.log("Avian - Bundle Only Enabled Shutting Down")
            process.exit()
            return
        }

        if (!utils.isAvianRunning()) {
            console.log("Avian - Starting Server")
            utils.startAllWorkers()
            loadAppServerFilesIntoAvian()
        } else if (needsServerRestart) {
            console.log("Avian - Restarting Server")
            utils.killAllWorkers()
            utils.startAllWorkers()
            loadAppServerFilesIntoAvian()
            needsServerRestart = false
        }
    }
})

function startDevWebpackWatcher(webpackDev: any) {
    const webpack = require("webpack")
    let componentsCompiler: Compiler
    componentsCompiler = webpack(
        webpackDev.ComponentsConfig,
    )
    componentsCompiler.hooks.watchRun.tap("Starting", () => {
        avianEmitter.emit("buildStarted", "components")
    })

    let serverFilesCompiler: Compiler
    serverFilesCompiler = webpack(
        webpackDev.ServerConfig,
    )
    serverFilesCompiler.hooks.watchRun.tap("Starting", () => {
        avianEmitter.emit("buildStarted", "serverFiles")
    })

    console.log("Avian - Watching For Changes")
    const watching = componentsCompiler.watch({
        aggregateTimeout: 300,
        poll: 1000,
        ignored: ["components/**/*.server.*", "node_modules", "serverless"],
    }, watcherCallback("components"))

    serverFilesCompiler.watch({
        aggregateTimeout: 300,
        poll: 1000,
        ignored: ["components/**/*.client.*", "node_modules", "serverless"],
    }, watcherCallback("serverFiles"))
}

function watcherCallback(name: string): CallbackFunction<Stats> {
    const chunkVersions = {} as any
    const watcherCallback: CallbackFunction<Stats> = (err, stats) => {
        if (err || stats?.hasErrors()) {
            if (err) {
                console.error(err)
            } else if (stats) {
                stats.toJson().errors?.forEach((err: any) => {
                    console.error(err)
                })
            }

            if (argv.bundleOnly) {
                console.error("Avian - Bundling Failed Due To Compilation Errors")
                console.log("Avian - Shutting Down")
                process.exit(1)
                return
            }

            console.error("Avian - Encountered compile errors, stopping server")
            utils.killAllWorkers()
            console.error("Avian - Waiting for you to fix compile errors")
            return
        }

        if (stats?.hasWarnings()) {
            stats?.toJson().warnings?.forEach((warning: any) => {
                console.log(warning)
            })
        }
        const changedChunks: Chunk[] = []

        stats?.compilation.chunks.forEach((chunk) => {
            if (!chunk.name) return
            const oldVersion = chunkVersions[chunk.name]
            chunkVersions[chunk.name] = chunk.hash
            if (chunk.hash !== oldVersion && chunk.name)
                changedChunks.push(chunk)
        })

        avianEmitter.emit("buildCompleted", name, changedChunks.map((chunk) => chunk.name))
        return
    }

    return watcherCallback
}

function startProdWebpackCompiler(webpackProd: any) {
    const webpack = require("webpack")
    let webpackCompiler: MultiCompiler
    webpackCompiler = webpack([
        webpackProd.ComponentsConfig,
        webpackProd.ServerConfig,
    ])

    console.log("Avian - Started Bundling")
    webpackCompiler.run((err, stats) => {
        if (err || stats?.hasErrors()) {
            if (err) {
                console.error(err)
            } else if (stats) {
                stats.toJson().errors?.forEach((err: any) => {
                    console.error(err)
                })
            }

            console.error("Avian - Bundling Failed Due To Compilation Errors")
            console.log("Avian - Shutting Down")
            utils.killAllWorkers()
            process.exit(1)
            return
        }

        if (argv.bundleOnly) {
            console.log("Avian - Bundle Only Enabled Shutting Down")
            process.exit()
            return
        } else {
            console.log("Avian - Starting Server")
            utils.startAllWorkers()
        }
    })

}
/**
 * Server Events
 */
class ServerEvent {
    private data: string = ""
    constructor() {
    }

    public addData(data: string) {
        const lines = data.split(/\n/)

        for (let i = 0 ; i < lines.length ; i++) {
            const element = lines[i]
            this.data += "data:" + element + "\n"
        }
    }
    public payload() {
        return this.data + "\n"
    }
}

/**
 * Subscribe to Server Events
 * @description More info to follow.
 */
async function subscribe(callback: any) {

    const subscriber = redis.createClient({database: argv.redisCacheDb,  password: argv.redisPass, socket:{host: argv.redisHost, port: argv.redisPort, connectTimeout: argv.redisConnectionTimeout}})
    await subscriber.connect()

    subscriber.subscribe("sse", callback)
    subscriber.on("error", (error) => {
        console.log("Redis error: " + error)
    })
}


if (argv.sslCert && argv.sslKey) {
    if (!path.isAbsolute(argv.sslCert)) {
        argv.sslCert = path.join(argv.home, argv.sslCert)
    }

    if (!path.isAbsolute(argv.sslKey)) {
        argv.sslKey = path.join(argv.home, argv.sslKey)
    }
}

if (cluster.isMaster) {
    const packageJson = require("../package.json")
    console.log(`Avian - Version ${packageJson.version}`)
    if (argv.sslCert && argv.sslKey) {
        console.log("Avian - SSL Enabled")
        console.log(`Avian - Cert Path ${argv.sslCert}`)
        console.log(`Avian - Key Path ${argv.sslKey}`)
    }

    /**  
     * Cron Job Scheduler
     * @description Avian provides the ability for individual components to have an array of cron jobs to be executed by workers. 
     */
     if (argv.cronJobScheduler) {

        const cronJobQueue = redis.createClient({socket:{host: argv.redisHost, port: argv.redisPort, connectTimeout: argv.redisConnectionTimeout}, database: argv.redisCronSchedulerDb, password: argv.redisPass})
        cronJobQueue.connect().then(() => {
            setInterval(async () => {

                const schedule = require("node-schedule")

                console.log("Avian - Checking Components for Cron Jobs")

                const componentConfigFiles = glob.sync(argv.home + "/components/**/*.config.json") as string[]

                componentConfigFiles.forEach((config) => {

                    try {
                        if(require(config).cronJobs) {

                            const cronJobs = require(config).cronJobs
                            
                            cronJobs.forEach((cronJob: CronJob.Params) => {

                                if (cronJob.enabled) {
                                    const job = schedule.scheduleJob(cronJob.expression, async () => {
                                        try {
                                            const reply = await cronJobQueue.get(cronJob.name.toString())
                                            if (!reply) {
                                                cronJobQueue.set(cronJob.name.toString(), JSON.stringify(cronJob))
                                                console.log(`Avian - Cron Job "${cronJob.name}" added to the job queue.`)
                                            }
                                        }
                                        catch(error) {
                                            console.error(error)
                                        }
                                            
                                    })
                                }
                            })
                        }
                    }
                    catch(error) {
                        console.error(error)
                    }
                })

            }, 3000)

            setInterval(async () => {

                try {
                    const cronJobsInQueue = await cronJobQueue.keys("*")

                    if (cronJobsInQueue.length > 0) {
                        
                        for (const id in cluster.workers) {

                            let index: number = 0

                            if (cluster.workers[id]) {

                                const job = await cronJobQueue.get(cronJobsInQueue[index])
                                if (job) {

                                    // NOTE remove the job from the queue and send this job to a worker.
                                    try { 
                                        cronJobQueue.del(JSON.parse(job).name.toString())
                                        cluster.workers[id]!.send(JSON.parse(job))
                                        index++
                                    }
                                    catch (error) {
                                        console.error("Avian - Something went wrong placing a job on this worker.")
                                    }
                                }
                            }
                        }
                    }
                    else {
                        console.log("Avian - The component cron job queue appears to be empty. Nothing to run...")
                    }
                }
                catch(error) {
                    console.error(error)
                }
            }, 30000)

            /** Cron Job Completion Confirmation from Worker */

            cluster.on("message", async (worker, cronJobResults: CronJob.Results) => {
                if (!cronJobResults.success) {
                    console.log(`Avian - Worker ${worker.id} failed to run job: ${cronJobResults.name}`)
                    // NOTE since the job failed we should re-queue it for other nodes to consider for execution.
                    console.log(`Avian - Job ${cronJobResults.name} is set for requeue.`)
                    cronJobQueue.set(cronJobResults.name.toString(), JSON.stringify(cronJobResults))
                    return
                }

                console.log(`Avian - Worker ${worker.id} has completed the job: ${cronJobResults.name}`)
                const response = await cronJobQueue.del(cronJobResults.name.toString())
                if (response === 1)
                    console.log(`Avian - Job ${cronJobResults.name} has been removed from the job queue.`)
            })
        })
    }

    if (argv.bundleSkip) {
        console.log("Avian - Skipped Bundling")
        utils.startAllWorkers()
        utils.setWorkersToAutoRestart()
        loadAppServerFilesIntoAvian()
    } else {
        rimraf.sync(`${argv.home}/private/*`)
        rimraf.sync(`${argv.home}/public/*`)

        const webpackConfigs = glob.sync(`${argv.webpackHome}/webpack.development.*`) as string[]
        webpackConfigs.push(...glob.sync(`${argv.webpackHome}/webpack.production.*`) as string[])
        const program = ts.createProgram(webpackConfigs, {
            allowJs: true,
            noEmitOnError: true,
            esModuleInterop: true,
            noImplicityAny: true,
            target: ts.ScriptTarget.ES5,
            modules: ts.ModuleKind.CommonJS,
            outDir: `${argv.home}/private`,
            skipLibCheck: true,
            lib: [
                "lib.es2015.d.ts",
            ],
        })
        const emitResult = program.emit()

        const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics)
        allDiagnostics.forEach((diagnostic) => {
            if (diagnostic.file) {
                const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!)
                const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
                console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`)
            } else {
                console.log(`${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`)
            }
        })

        if (argv.mode === "development") {
            import(argv.home + "/private/webpack.development.js").then((webpackDev) => {
                startDevWebpackWatcher(webpackDev)
            }).catch((error) => {
                console.error(error)
                console.log("Avian - Falling back to default dev webpack config")
                import("./webpack/webpack.development.js").then((defaultWebpackDev) => {
                    startDevWebpackWatcher(defaultWebpackDev)
                }).catch((error) => {
                    console.error(error)
                    console.error("Avian - Failed to load default development webpack config")
                })
            })
        } else {
            import(argv.home + "/private/webpack.production.js").then((webpackProd) => {
                startProdWebpackCompiler(webpackProd)
            }).catch((error) => {
                console.log("Avian - Falling back to default prod webpack config")
                import("./webpack/webpack.production.js").then((defaultWebpackProd) => {
                    startProdWebpackCompiler(defaultWebpackProd)
                }).catch((error) => {
                    console.error(error)
                    console.error("Avian - Failed to load default production webpack config")
                })
            })
        }
    }
} else {

    /**  
     * Cron Job Runtime Messaging
     */
    
    if (argv.cronJobScheduler) {
        process.on('message', (job: any) => {

            if (job.name) {

                const schedule = require("node-schedule")
                
                const cronJob = new schedule.Job(job.name, () => {
                                        
                    const { spawn } = require("child_process")
                    const cronJobRuntime = spawn(job.command, job.args, { cwd: argv.home, env: process.env, detached: false })

                    cronJobRuntime.on("close", (code: number) => {
                        if (code > 0) { 
                            process.send!({job: job.name, success: false })
                            return
                        }
                        process.send!({name: job.name, success: true})
                        return
                    })
                })
                cronJob.schedule(Date.now())
            }
        })
    }

    const avian = express()

    if (argv.compression) {
        const compression = require('compression')
        avian.use(compression({
            filter: (req: express.Request, res: express.Response) => {
                if (req.doNotCompress) return false
                // fallback to standard express compression filter
                return compression.filter(req, res)
            }
        }))
    }
    /**
     * Logging Framework
     */
    switch (argv.logger) {

        case "pino":

            avian.use(require("pino-http")({
                useLevel: "info",
            }))

            break

        case "bunyan":

            avian.use(require("express-bunyan-logger-updated")({
                name: argv.name,
                level: "info"
            }))

            break

        case "fluent":

            avian.use(require("@flypapertech/fluentd-logger-middleware")({
                level: "info",
                mode: argv.mode,
                tag: argv.loggerFluentTag,
                label: argv.loggerFluentLabel,
                source: "Access",
                configure: {
                    host: argv.loggerFluentHost,
                    port: argv.loggerFluentPort,
                    timeout: 3.0,
                },
            }))
            break
    }

    avian.use((req, res, next) => {
        // @ts-ignore
        if (!req.logger) req.logger = req.log
        next()
    })

    avian.set("view engine", "ejs")
    avian.use(injectArgv)

    avian.locals.argv = argv
    const redisStore = require("connect-redis")(session)
    const enableAuthHeadersForExpressSession: RequestHandler = (req, res, next) => {
        if (req.headers.authorization) {
            const authParts = req.headers.authorization.split(" ")
            if (authParts[0].toLowerCase() === "bearer" && authParts.length > 1) {
                // TODO We need to sign this exactly like how express-session signs cookies
                const signed = "s:" + signature.sign(authParts[1], req.sessionSecret)

                if (!req.headers.cookie) {
                    req.headers.cookie = `connect.sid=${signed}`
                    next()
                    return
                }

                const cookies = cookie.parse(req.headers.cookie)
                const updatedCookies: any = {...cookies, "connect.sid": signed}

                const cookieKeys = Object.keys(updatedCookies)
                const updatedCookieArray = cookieKeys.map((key) => {
                    return `${key}=${encodeURIComponent(updatedCookies[key])}`
                })

                req.headers.cookie = updatedCookieArray.join("")
            }
        }

        next()
    }

    avian.use(enableAuthHeadersForExpressSession)

    const redisClient = redis.createClient({ legacyMode: true, database: argv.redisSessionDb, password: argv.redisPass, socket: {host: argv.redisHost, port: argv.redisPort, connectTimeout: argv.redisConnectionTimeout} })
    redisClient.connect().catch(console.error)
    avian.use(session({
        store: new redisStore({client: redisClient, ttl: argv.sessionTTL / 1000}),
        proxy: true,
        secret: sessionSecret,
        resave: argv.sessionResave,
        rolling: argv.sessionCookieRolling,
        saveUninitialized: argv.sessionSaveUninitialized,
        cookie: {
            httpOnly: true,
            sameSite: "strict",
            maxAge: argv.sessionCookieMaxAge,
        },
    }))

    const cache = redis.createClient({database: argv.redisCacheDb,  password: argv.redisPass, socket:{ host: argv.redisHost, port: argv.redisPort, connectTimeout: argv.redisConnectionTimeout }})
    cache.connect().catch(console.error)

    avian.use((req, res, next) => {
        req.cache = cache 
        if (req.cache.isReady) {
            next()
        }
        else {
            req.cache.once("ready", () => {
                next()
            })
        }
    })

    let server
    if (argv.sslCert && argv.sslKey) {
        server = https.createServer({
            cert: fs.readFileSync(argv.sslCert),
            key: fs.readFileSync(argv.sslKey),
        }, avian).listen(argv.port, () => {
            console.log("Avian - Process: %sd, Name: %s, Home: %s, Port: %d, Mode: %s",
                process.pid,
                argv.name,
                argv.home,
                argv.port,
                argv.mode,
            )
        })
    } else {
        server = avian.listen(argv.port, () => {
            console.log("Avian - Process: %sd, Name: %s, Home: %s, Port: %d, Mode: %s",
                process.pid,
                argv.name,
                argv.home,
                argv.port,
                argv.mode,
            )
        })
    }

    server.keepAliveTimeout = argv.keepAliveTimeout * 1000

    let sseClients: Array<{interval: NodeJS.Timeout, res: express.Response }> = []
    subscribe((message: string, channel: any) => {
        const messageEvent = new ServerEvent()
        messageEvent.addData(message)
        for (const client of sseClients) {
            client.res.write(messageEvent.payload())
        }
    })

    avian.get("/sse", (req, res) => {
        req.doNotCompress = true;
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        })

        res.write("retry: 10000\n\n")

        // heartbeat
        const interval = setInterval(() => {
            res.write(": \n\n")
        }, 5000)

        sseClients.push({res, interval})
        res.on("close", () => {
            sseClients = sseClients.filter(client => client.interval !== interval)
            clearInterval(interval)
        })
    })

    loadAppRoutesIntoAvian(avian).then(() => {
        avian.use("/assets", expressStaticGzip(argv.home + "/assets", {enableBrotli: true}))
        avian.use("/", expressStaticGzip(argv.home + `/${argv.staticDir}`, {enableBrotli: true, index: false, orderPreference: ["br"]}))
        avian.use("/node_modules", express.static(argv.home + "/node_modules"))
        avian.use("/bower_components", express.static(argv.home + "/bower_components"))
        avian.use("/jspm_packages", express.static(argv.home + "/jspm_packages"))
        if (argv.spa) {
            avian.use(history({
                index: `/${argv.entrypoint}`,
            }))
        }

        avian.set("views", argv.home)

        if (argv.mode === "production") {

            mkdirp.sync(argv.home + "/cache/")
            avian.use(require("express-minify")({cache: argv.home + "/cache"}))
            avian.enable("view cache")
        }

         /** Component Epilogue Hook */
        avian.use((req, res, next) => {
            req.epilogues = []
            res.on("finish", async () => {
                if (res.statusCode) {
                    if (res.statusCode >= 200 && res.statusCode < 300) 
                        for (const epilogue of req.epilogues) 
                            await epilogue(req, res, next)
                }})
            next()
        })


        avian.get("/:component/:subcomponent", express.urlencoded({ extended: true }), (req, res, next) => {
            const componentRoot = utils.getComponentRoot(req.params.component)
            const subComponentPath = `${componentRoot}/${req.params.subcomponent}`

            // if the subcomponent directory doesn't exist, move on
            if (!fs.existsSync(`${subComponentPath}`)) {
                next()
                return
                // TODO: Support non-scaffolded sub components, e.g. index.subname.view.ext
            }

            try {
                res.setHeader("X-Powered-By", "Avian")
                let viewPath = utils.getComponentViewPath(`${subComponentPath}/${req.params.subcomponent}.view`)
                if (viewPath === "") {
                    viewPath = utils.getComponentViewPath(`${subComponentPath}/${req.params.component}.${req.params.subcomponent}.view`)
                }

                if (viewPath === "") {
                    res.sendStatus(404)
                    return
                }

                utils.getComponentConfigObject(req.params.component, req, req.params.subcomponent, (config: any) => {
                    res.locals.req = req
                    res.render(viewPath, config)
                })
            } catch (err) {
                console.error(err)
                res.redirect("/errors")
            }
        })

        avian.get("/:component", express.urlencoded({ extended: true }), (req, res, next) => {
            const componentRoot = utils.getComponentRoot(req.params.component)

            try {
                res.setHeader("X-Powered-By", "Avian")

                const viewPath = utils.getComponentViewPath(`${componentRoot}/${req.params.component}.view`)
                if (viewPath === "") {
                    res.sendStatus(404)
                    return
                }

                utils.getComponentConfigObject(req.params.component, req, undefined, (config: any) => {
                    res.locals.req = req
                    res.render(viewPath, config)
                })
            } catch (err) {
                console.error(err)
                res.redirect("/errors")
            }
        })

        avian.get("/:component/config/objects.json", (req, res, next) => {
            try {
                utils.getComponentConfigObject(req.params.component, req, undefined, (config: any) => {
                    res.setHeader("X-Powered-By", "Avian")
                    res.json(config)
                })
            } catch (err) {
                res.setHeader("X-Powered-By", "Avian")
                res.sendStatus(404)
            }
        })

        avian.get("/:component/:subcomponent/config/objects.json", (req, res, next) => {
            try {
                utils.getComponentConfigObject(req.params.component, req, req.params.subcomponent, (config: any) => {
                    res.setHeader("X-Powered-By", "Avian")
                    res.json(config)
                })
            } catch (err) {
                res.setHeader("X-Powered-By", "Avian")
                res.sendStatus(404)
            }
        })

        avian.post("/logger", json(), (req, res, next) => {
            if (!req.query || !req.body) {
                res.sendStatus(400)
                return
            }

            if (!argv.logger) {
                res.sendStatus(404)
                return
            }

            switch (argv.logger) {

                case "pino":
                    if (req.query.level === "debug") {
                        req.logger.debug(req.body)
                    }
                    if (req.query.level === "info") {
                        req.logger.info(req.body)
                    }
                    if (req.query.level === "error") {
                        req.logger.error(req.body)
                    }
                    if (req.query.level === "warn") {
                        req.logger.warn(req.body)
                    }
                    if (req.query.level === "fatal") {
                        req.logger.fatal(req.body)
                    }
                    if (req.query.level === "trace") {
                        req.logger.trace(req.body)
                    }
                    break
                case "bunyan":
                    if (req.query.level === "debug") {
                        req.logger.debug(req.body)
                    }
                    if (req.query.level === "info") {
                        req.logger.info(req.body)
                    }
                    if (req.query.level === "error") {
                        req.logger.error(req.body)
                    }
                    if (req.query.level === "warn") {
                        req.logger.warn(req.body)
                    }
                    if (req.query.level === "fatal") {
                        req.logger.fatal(req.body)
                    }
                    if (req.query.level === "trace") {
                        req.logger.trace(req.body)
                    }
                    break
                case "fluent":
                    req.logger.emit(
                        req.query.label || "client", 
                        { source: req.query.source || null, level: req.query.level || "info", mode: argv.mode, record: req.body })
                    break
                }

            res.sendStatus(200)
        })

        avian.all("/", (req, res, next) => {
            res.redirect(`/${argv.entrypoint}`)
        })

        // NOTE: this must be done after all routes
        if(Sentry.isInitialized()) {
            Sentry.setupExpressErrorHandler(avian)
        }
    
    }).catch(err => console.log(err))
}
