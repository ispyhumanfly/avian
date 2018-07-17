"use strict"

import * as events from "events"
import * as crypto from "crypto"
import * as cluster from "cluster"
import * as express from "express"
import * as session from "express-session"
import * as glob from "glob"
import * as parser from "body-parser"
import * as os from "os"
import * as fs from "fs"
import * as path from "path"
import * as webpack from "webpack"
import { RedisClient } from "redis"
import * as rimraf from "rimraf"


const mkdirp = require("mkdirp")
const WebpackWatchedGlobEntries = require("webpack-watched-glob-entries-plugin")
const jsonfile = require("jsonfile")
const compression = require("compression")

const nodeExternals = require("webpack-node-externals")

const argv = require("yargs").argv
argv.name = argv.name || process.env.AVIAN_APP_NAME || process.env.HOSTNAME || "localhost"
argv.home = argv.home || process.env.AVIAN_APP_HOME || process.cwd()
argv.port = argv.port || process.env.AVIAN_APP_PORT || process.env.PORT || 8080
argv.mode = argv.mode || process.env.AVIAN_APP_MODE || process.env.NODE_MODE || "development"

const logWebpackErrors = (stats) => {
    if (stats && stats.hasErrors()) {
        stats.toJson().errors.forEach((err) => {
            console.error(err)
        })
    }
}

const compiler = webpack([{
    entry: WebpackWatchedGlobEntries.getEntries(
        `${argv.home}/components/**/*.component.*`
    ),
    output: {
        path: `${argv.home}/public`,
        filename: "[name].bundle.js",
    },
    devtool: "cheap-eval-source-map",
    resolve: {
        extensions: [".ts", ".js", ".vue", ".json"],
        alias: {
            vue$: "vue/dist/vue.js"
        }
    },
    plugins: [
        new WebpackWatchedGlobEntries()
    ],
    externals: {
        vue: "Vue",
        vuetify: "Vuetify"
    },
    module : {
        rules: [
            {
                test: /\.jsx$/,
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: ["@babel/preset-react"]
                    }
                }
            },
            {
                test: /\.vue$/,
                use: {
                    loader: "vue-loader"
                }
            },
            {
                test: /\.js$/,
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: ["@babel/preset-env"]
                    }
                }
            },
            {
                test: /\.ts$/,
                // TODO switch to ts-loader and babel when ts v3.0 comes out end of july 2018
                loader: "awesome-typescript-loader"
            }
        ]
    }
},
{
    target: "node",
    entry: WebpackWatchedGlobEntries.getEntries(
        `${argv.home}/components/**/*.service.*`
    ),
    output: {
        path: `${argv.home}/private`,
        filename: "[name].js",
        libraryTarget: "commonjs2"
    },
    resolve: {
        extensions: [".ts", ".js", ".json"],
    },
    plugins: [
        new WebpackWatchedGlobEntries()
    ],
    // externals: [nodeExternals(), /\.pug$/, /\.less$/, /\.css$/],
    externals: [nodeExternals()],
    module : {
        rules: [
            {
                test: /\.js$/,
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: ["@babel/preset-env"]
                    }
                }
            },
            {
                test: /\.ts$/,
                // TODO switch to ts-loader and babel when ts v3.0 comes out end of july 2018
                loader: "awesome-typescript-loader"
            }
        ]
    }
}])

class AvianUtils {
    getComponentRoot(component: string): string {
        if (fs.existsSync(`${argv.home}/components/${component}`))
            return `${argv.home}/components/${component}`
        else
            return `${argv.home}/components`
    }

    setConfigObjectCache(component: string, reqWithCache: RequestWithCache) {
        let component_root = this.getComponentRoot(component)
        let configStringJSON: string
        try {
            configStringJSON = JSON.stringify(jsonfile.readFileSync(`${component_root}/${component}.config.json`))
        } catch (err) {
            configStringJSON = JSON.stringify({})
        }

        let event = new events.EventEmitter()
        event.emit("synch",
            reqWithCache.cache.set(component, configStringJSON))
    }

    killAllWorkers(): boolean {
        let existingWorkers = false
        for (const id in cluster.workers) {
            existingWorkers = true
            let worker = cluster.workers[id]
            worker.kill()
        }

        return existingWorkers
    }

    setWorkersToAutoRestart() {
        cluster.on("exit", worker => {
            cluster.fork()
        })
    }
}


const avianUtils = new AvianUtils()

interface RequestWithCache extends express.Request {
    cache: RedisClient
}

if (cluster.isMaster) {
    rimraf.sync(`${argv.home}/private/*`)
    rimraf.sync(`${argv.home}/public/*`)

    if (argv.mode !== "development") {
        compiler.run((err, stats) => {
            if (err || stats.hasErrors()) {
                if (err) {
                    console.error(err)
                }
                else if (stats) {
                    stats.toJson().errors.forEach((err) => {
                        console.error(err)
                    })
                }

                console.error("Avian - Encountered compile errors, please fix and restart")
                avianUtils.killAllWorkers()
                return
            }

            let cores = os.cpus()
            for (let i = 0; i < cores.length; i++) {
                cluster.fork()
            }

            avianUtils.setWorkersToAutoRestart()
        })
    }
    else {
        compiler.watch({
            aggregateTimeout: 300,
            poll: undefined,
        }, (err, stats) => {
            if (err || stats.hasErrors()) {
                if (err) {
                    console.error(err)
                }
                else if (stats) {
                    stats.toJson().errors.forEach((err) => {
                        console.error(err)
                    })
                }

                console.error("Avian - Encountered compile errors, stopping server")
                avianUtils.killAllWorkers()
                console.error("Avian - Waiting for you to fix compile errors")
                return
            }

            console.log("Avian - Restarting server")
            avianUtils.killAllWorkers()
            let cores = os.cpus()
            for (let i = 0; i < cores.length; i++) {
                cluster.fork()
            }
        })
    }
} else {

    const avian = express()

    avian.locals.argv = argv

    let redisStore = require("connect-redis")(session)

    avian.use(session({
        store: new redisStore({host: "127.0.0.1"}),
        secret: crypto.createHash("sha512").digest("hex"),
        resave: false,
        saveUninitialized: true
    }))

    avian.use(require("express-redis")(6379, "127.0.0.1", {return_buffers: true}, "cache"))

    avian.use("/assets", express.static(argv.home + "/assets"))
    avian.use("/", express.static(argv.home + "/public"))
    avian.use("/node_modules", express.static(argv.home + "/node_modules"))
    avian.use("/bower_components", express.static(argv.home + "/bower_components"))
    avian.use("/jspm_packages", express.static(argv.home + "/jspm_packages"))

    avian.set("view engine", "pug")
    avian.set("views", argv.home)

    if (argv.mode === "production") {

        mkdirp.sync(argv.home + "/cache/")
        mkdirp.sync(argv.home + "/logs/")

        avian.use(require("express-bunyan-logger")({
            name: argv.name,
            streams: [
                {
                    level: "error",
                    stream: process.stderr
                },
                {
                    level: "info",
                    type: "rotating-file",
                    path: argv.home + `/logs/${argv.name}.${process.pid}.json`,
                    period: "1d",
                    count: 365
                }
            ],
        }))

        avian.use(require("express-minify")({cache: argv.home + "/cache"}))
        avian.use(compression())
    }

    let event = new events.EventEmitter()
    event.on("synch", () => {this})

    avian.get("/:component/:subcomponent", parser.urlencoded({ extended: true }), (req, res, next) => {
        let componentRoot = avianUtils.getComponentRoot(req.params.component)
        let subComponentPath = `${componentRoot}/${req.params.subcomponent}`
        let cacheKey = `${req.params.component}/${req.params.subcomponent}`

        // if the subcomponent directory doesn't exist, move on
        if (!fs.existsSync(`${subComponentPath}`)) {
            next()
            return
        }

        let reqWithCache = req as RequestWithCache
        try {
            avianUtils.setConfigObjectCache(cacheKey, reqWithCache)
            reqWithCache.cache.get(cacheKey, (err, config) => {
                res.locals.req = req
                res.setHeader("X-Powered-By", "Avian")
                res.render(`${subComponentPath}/${req.params.subcomponent}.view.pug`, JSON.parse(config))
            })
        }
        catch (err) {
            if (err)
                res.redirect("/error")
        }
    })

    avian.get("/:component", parser.urlencoded({ extended: true }), (req, res, next) => {
        let reqWithCache = req as RequestWithCache
        let componentRoot = avianUtils.getComponentRoot(req.params.component)
        try {
            avianUtils.setConfigObjectCache(req.params.component, reqWithCache)
            reqWithCache.cache.get(`${req.params.component}`, (err, config) => {
                res.locals.req = req
                res.setHeader("X-Powered-By", "Avian")
                res.render(`${componentRoot}/${req.params.component}.view.pug`, JSON.parse(config))
            })
        }
        catch (err) {
            if (err)
                res.redirect("/error")
        }
    })

    avian.get("/:component/config/objects.json", (req, res, next) => {
        let reqWithCache = req as RequestWithCache
        try {
            avianUtils.setConfigObjectCache(req.params.component, reqWithCache)
            reqWithCache.cache.get(req.params.component, (err, config) => {

                res.setHeader("X-Powered-By", "Avian")
                res.json(JSON.parse(config))
            })
        }
        catch (err) {

            res.setHeader("X-Powered-By", "Avian")
            res.status(404)
                .send("Not Found")
        }
    })

    avian.get("/:component/:subcomponent/config/objects.json", (req, res, next) => {
        let reqWithCache = req as RequestWithCache
        let cacheKey = `${req.params.component}/${req.params.subcomponent}`
        try {
            avianUtils.setConfigObjectCache(cacheKey, reqWithCache)
            reqWithCache.cache.get(cacheKey, (err, config) => {
                res.setHeader("X-Powered-By", "Avian")
                res.json(JSON.parse(config))
            })
        }
        catch (err) {
            res.setHeader("X-Powered-By", "Avian")
            res.status(404)
                .send("Not Found")
        }
    })


    avian.all("/", (req, res, next) => {
        res.redirect("/index")
    })


    let compiledServices = glob.sync(`${argv.home}/private/**/*service.js`)
    for (let i = 0; i < compiledServices.length; i++) {
        let dirname = path.dirname(compiledServices[i])
        let directories = dirname.split("/")
        let routeArray = []
        for (let j = directories.length - 1; j >= 0; j--) {
            if (directories[j] !== "private") {
                routeArray.unshift(directories[j])
            }
            else {
                break
            }
        }

        let routeBase = "/" + routeArray.join("/")
        let ComponentRouter: express.Router = require(`${compiledServices[i]}`)
        avian.use(`${routeBase}`, ComponentRouter)
    }

    const server = avian.listen(argv.port, () => {

        console.log("Avian - Worker Id: %s, Process: %sd, Name: %s, Home: %s, Port: %d",
            cluster.worker.id,
            process.pid,
            argv.name,
            argv.home,
            argv.port
        )
    })
}
