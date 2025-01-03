import jsonfile = require("jsonfile")
import { RedisClientType } from "redis"
import { DateTime } from "luxon"
import { Request, Router } from "express"
import fg from "fast-glob"
import cluster from "cluster"
import os from "os"
import fs from "graceful-fs"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

/** 
 * Avian Namespace & Interfaces
 * @description To be exported at build time to avian.lib.d.ts
 * @interface
 */
declare global {

    /**  
     * Express 
     * @namespace 
     */
    namespace Express {
        
        /** 
         * Request 
         */
        interface Request {
            argv: typeof argv
            cache: RedisClientType<any, any, any>
            doNotCompress: boolean | undefined
            epilogues: any
            logger: any
            sessionSecret: string,
        }
    }

    /**  
     * CronJob
     * @namespace 
     */ 
    namespace CronJob {

        /** 
         * Params 
         */
         interface Params {
            args: string[],
            command: string,
            description: string
            enabled: boolean,
            expression: string,
            name: string
        }

        /** 
         * Results 
         */
        interface Results extends Params {
            success: boolean
        }
    }
}

/**
 * Avian Argv Processing
 * @description All command line arguments and options, as well as environment variables honored by then, are available to Avian here.
 * @class
 * @global
 */

export const argv = yargs(hideBin(process.argv))
        .env("AVIAN_APP") 
        .option("name", {
            alias: "n",
            default: process.env.HOSTNAME || "localhost",
            describe: "The name of your application"
        })
        .option("home", {
            alias: "h",
            default: process.cwd(),
            defaultDescription: "Current working directory",
            describe: "The directory of your application."
        })
        .option("mode", {
            alias: "m",
            default: process.env.NODE_ENV || "development",
            describe: "Deployment mode to run Avian in.",
            choices: ["development", "production"]
        })
        .option("port", {
            alias: "p",
            default: 8080,
            describe: "Which port to serve your application on."
        })
         .option("staticDir", {
            alias: "sd",
            default: "static",
            describe: "Which directory you would like to serve static files from. Will be accessible at the root of your application (e.g. /)."
        })
        .option("entrypoint", {
            alias: "ep",
            default: "index",
            describe: "The point of entry to your application."
        })
        .option("spa", {
            default: false,
            describe: "Start Avian in a single-page-application (SPA) configuration.",
            type: "boolean"
        })
        .option("bundleSkip", {
            default: false,
            type: "boolean"
        })
        .option("bundleOnly", {
            default: false,
            type: "boolean"
        })
        .option("keepAliveTimeout", {
            default: 65,
            describe: "Sets the keep alive timeout in seconds. Defaults to 65 to be greater than the default ELB idleTimeout of 60 seconds.",
            type: "number"
        })
        .option("redisHost", {
            default: "127.0.0.1"
        })
        .option("redisPort", {
            default: 6379
        })
        .option("redisPass", {
            default: undefined
        })
        .option("redisConnectionTimeout", {
            type: "number",
            describe: "The connection timeout to use for redis clients",
            default: 5000
        })
        .option("redisSessionDb", {
            default: 1
        })
        .option("redisCacheDb", {
            default: 2
        })
        .option("redisCronSchedulerDb", {
            default: 3
        })
        .option("webpackHome", {
            default: ""
        })
        .option("logger", {
            alias: "l",
            describe: "Which logging framework to use.",
            choices: ["pino", "bunyan", "fluent"]
        })
        .option("loggerFluentLabel", {
            alias: "lfl",
            default: "debug"
        })
        .option("loggerFluentTag", {
            alias: "lft",
            default: "debug"
        })
        .option("loggerFluentHost", {
            alias: "lfh",
            default: "127.0.0.1"
        })
        .option("loggerFluentPort", {
            alias: "lfp",
            default: 24224
        })
        .option("sslCert", {
            type: "string"
        })
        .option("sslKey", {
            type: "string"
        })
        .option("compression", {
            type: "boolean",
            default: false
        })
        .option("sessionTTL", {
            type: "number",
            describe: "The time you want the session store to keep the session alive for in milliseconds [7 days]",
            default: 60 * 60 * 24 * 7 * 1000
        })
        .option("sessionCookieMaxAge", {
            type: "number",
            describe: "The max age of the session cookie in milliseconds [30 days]",
            default: 60 * 60 * 24 * 30 * 1000
        })
        .option("sessionCookieRolling", {
            type: "boolean",
            describe: "Should express session update the client cookie max age upon every api call",
            default: false
        })
        .option("sessionSaveUninitialized", {
            type: "boolean",
            describe: "Should express session save uninitialized session",
            default: false
        })
        .option("sessionResave", {
            type: "boolean",
            describe: "Should express session resave",
            default: false
        })
        .option("cronJobScheduler", {
            alias: "cjs",
            default: false,
            describe:
            "Avian components are capable of scheduling cron-like jobs that are executed on the server.",
            type: "boolean"
        })
        .option("sentryDSN",{
            type:"string",
            describe: "If a Sentry DSN is provided Avian will instrument Sentry correctly for the express app."
        })
        .option("sentryEnvironment",{
            type:"string",
            describe: "The environment tag for Sentry"
        })
        .option("sentryRelease",{
            type:"string",
            describe: "The release version for Sentry"
        }).parseSync()


/**  
 * Avian Server Namespace
 * @namespace
 */
export namespace Server {

    /** 
     * Server Constructor Interface 
     * @interface
     */
    // tslint:disable-next-line: interface-name
    export interface IServerConstructorParams {
        argv: typeof argv
    }
    /**
     * Start Method Params Interface
     */
    // tslint:disable-next-line: interface-name
    export interface IStartMethodParams {
            argv: typeof argv,
            timeout: DateTime
        }
    }
/**
 * Avian Server
 * @description
 * @class
 * @global
 * @
 */

export class Server implements Server {

    public avian: any
    
    constructor(argv?: Server.IServerConstructorParams) {
        this.avian = { ...argv }
    }

    /**
     * Starts server
     * @param [params] 
     */
    public start(params?: any) {

        if (this.avian.mode === "development") {
            // do something...
        }
    }
}

export const server = new Server()

/**
 * Avian Utilities
 * @description A class filled with useful utilities that are very specific to Avian core development.
 */
export class Utils {

    /**
     * Gets component config object
     * @param component 
     * @param req 
     * @param subcomponent 
     * @param callback 
     * @returns  
     */
    public async getComponentConfigObject(component: string, req: Request, subcomponent: string | undefined, callback: Function) {
        try {
            const cacheKey = (subcomponent) ? `${component}/${subcomponent}` : component
            const config = await req.cache.get(cacheKey)
            if (config) {
                callback(JSON.parse(config))
                return
            }
            else {
                const configString = this.setComponentConfigObjectCache(component, req, subcomponent)
                callback(JSON.parse(configString))
            }
        } catch (error) {
            console.error(error)
            callback({})
        }
    }
    /**
     * Gets component root
     * @param component 
     * @returns component root 
     */
    public getComponentRoot(component: string): string {
        if (fs.existsSync(`${argv.home}/components/${component}`))
            return `${argv.home}/components/${component}`
        else
            return `${argv.home}/components`
    }
    /**
     * Gets component view path
     * @param pathToViewFileWithoutExtension 
     * @returns component view path 
     */
    public getComponentViewPath(pathToViewFileWithoutExtension: string): string {
        try {
            const matches = fg.sync(`${pathToViewFileWithoutExtension}.*`)
            return matches.length === 0 ? "" : matches[0]
        } catch (err) {
            return ""
        }
    }
    /**
     * Determines whether avian is running
     * @returns true if avian running 
     */
    public isAvianRunning(): boolean {
        if (!cluster.workers) return false
        return Object.keys(cluster.workers).length > 0
    }
    /**
     * Kills all workers
     * @returns true if all workers 
     */
    public killAllWorkers(): boolean {
        let existingWorkers = false
        for (const id in cluster.workers) {
            existingWorkers = true
            const worker = cluster.workers[id]
            if (worker)
                worker.kill()
        }

        return existingWorkers
    }

    /**
     * Sets component config object cache
     * @param component 
     * @param req 
     * @param [subcomponent] 
     * @returns component config object cache 
     */
    public setComponentConfigObjectCache(component: string, req: Request, subcomponent?: string): string {
        const parentComponentRoot = this.getComponentRoot(component)
        const componentPath = (subcomponent) ? `${parentComponentRoot}/${subcomponent}` : `${parentComponentRoot}`
        const configFilePath = (subcomponent) ? `${componentPath}/${subcomponent}.config.json` : `${componentPath}/${component}.config.json`
        const fallbackFilePath = (subcomponent) ? `${componentPath}/${component}.${subcomponent}.config.json` : undefined
        let configStringJSON: string
        try {
            configStringJSON = JSON.stringify(jsonfile.readFileSync(configFilePath))
        } catch (err) {
            if (!fallbackFilePath) {
                configStringJSON = JSON.stringify({})
            } else {
                try {
                    configStringJSON = JSON.stringify(jsonfile.readFileSync(fallbackFilePath))
                } catch {
                    configStringJSON = JSON.stringify({})
                }
            }
        }

        req.cache.set(component, configStringJSON)
        return configStringJSON
    }

    /**
     * Sets workers to auto restart
     */
    public setWorkersToAutoRestart() {
        cluster.on("exit", (worker) => {
            cluster.fork()
        })
    }

    /**
     * Starts all workers
     */
    public startAllWorkers() {
        const cores = os.cpus()
        for (let i = 0 ; i < cores.length ; i++) {
            cluster.fork()
        }
    }
}

export const utils = new Utils()
