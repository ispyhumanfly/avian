# Avian

Create Enterprise-class component driven applications that scale.

[![CircleCI](https://img.shields.io/circleci/build/github/ispyhumanfly/avian/master)](https://circleci.com/gh/ispyhumanfly/avian/tree/master)
[![Docker Cloud Build Status](https://img.shields.io/docker/cloud/build/ispyhumanfly/avian)](https://hub.docker.com/repository/docker/ispyhumanfly/avian/builds)
[![Known Vulnerabilities](https://snyk.io/test/github/ispyhumanfly/avian/badge.svg)](https://snyk.io/test/github/ispyhumanfly/avian)
[![npm (scoped)](https://img.shields.io/npm/v/spytech/avian.svg)](https://www.npmjs.com/package/spytech/avian)
[![License](https://img.shields.io/npm/l/spytech/avian.svg)](https://github.com/ispyhumanfly/avian/blob/master/LICENSE)
[![Dependencies](https://david-dm.org/ispyhumanfly/avian/status.svg)](https://david-dm.org/ispyhumanfly/avian)
[![Docker Pulls](https://img.shields.io/docker/pulls/ispyhumanfly/avian)](https://hub.docker.com/r/ispyhumanfly/avian)

## Synopsis

Avian is a platform for running highly available, horizontally scalable, stateless, component based applications. It is optimized for public cloud, private cloud, bare metal, virtual machines, and containers. Its design is the result of years of experience in developing and maintaining applications at scale, while easing development and maintainability for large software engineering teams.

## Key Features

Avian is built on top of the popular [Express](https://expressjs.com/) web framework for [NodeJS](https://nodejs.com), uses [Redis](https://redislabs.com/) for managing application state afinity, sessions, and the caching of view templates, while [Webpack](https://webpack.js.org/) manages the transpilation and bundling of your client and server-side component files.

- Cluster mode for load balancing across available CPU cores.
- Out of the box webpacking with sane defaults. Don't worry you can override and/or add to them whenever you want :)
- Routes are generated based on how your component folders are structured.
- Supports client side scripts and server side routes (APIs) written in JavaScript and TypeScript.
- The serving of static files.
- Views can be authored in EJS, Twig, Pug, and plain HTML.
- Logging frameworks are Pino, Bunyan, and Fluentd.

## Installation

### Docker

Official Docker instructions coming soon. For now, check out the hello-world example in the examples directory. 

### NPM

The latest stable release of Avian is available on [npmjs.com](https://www.npmjs.com/package/spytech/avian).

The most common scenario is to install Avian as a dependency of your project.

    npm install spytech/avian

    or 

    yarn add spytech/avian

And can be accessed as...

    node ./node_modules/.bin/avian

Alternatively, Avian can be installed globally, making it possible to serve multiple applications with a single installation of Avian.

    npm install spytech/avian -g

    or

    yarn global add spytech/avian

And can be accessed globally, but will need to be told where your Avian application is located...

    avian --home /path/to/avian/app/home

### System Requirements

#### NodeJS

Avian requires NodeJS version 8.0 and above.

#### Redis Server

Avian uses Redis Server for storing session data, caching component config object requests and arbitrary caching requirements you may have.

Suggested Redis Installation Methods

##### macOS
`brew install redis`
##### Ubuntu Linux
`apt install redis-server`
##### Alpine Linux
`apk add redis`
##### Windows (experimental)
  - [Windows with WSL (10 and higher)](https://redislabs.com/blog/redis-on-windows-10/)
  - [Windows without WSL (8.1 and lower)](https://redislabs.com/blog/redis-on-windows-8-1-and-previous-versions/)
    - Note: It is not recommended to use Redis in production on Windows with out WSL.

## Getting Started

### CLI Arguments

    Options:
    --help                      Show help                                [boolean]
    --version                   Show version number                      [boolean]
    --name, -n                  The name of your application[default: "localhost"]
    --home, -h                  The directory of your application.
                                                [default: Current working directory]
    --mode, -m                  Deployment mode to run Avian in.
                    [choices: "development", "production"] [default: "development"]
    --port, -p                  Which port to serve your application on.
                                                                    [default: 8080]
    --staticDir, --sd           Which directory you would like to serve static
                                files from. Will be accessible at the root of your
                                application (e.g. /).          [default: "static"]
    --entrypoint, --ep          The point of entry to your application.
                                                                [default: "index"]
    --spa                       Start Avian in a single-page-application (SPA)
                                configuration.          [boolean] [default: false]
    --bundleSkip                                        [boolean] [default: false]
    --bundleOnly                                        [boolean] [default: false]
    --redisHost                                             [default: "127.0.0.1"]
    --redisPort                                                    [default: 6379]
    --redisPass
    --redisSessionDb                                                  [default: 1]
    --redisCacheDb                                                    [default: 2]
    --redisCronSchedulerDb                                            [default: 3]
    --webpackHome                                                    [default: ""]
    --logger, -l                Which logging framework to use.
                                            [choices: "pino", "bunyan", "fluent"]
    --loggerFluentLabel, --lfl                                  [default: "debug"]
    --loggerFluentTag, --lft                                    [default: "debug"]
    --loggerFluentHost, --lfh                               [default: "127.0.0.1"]
    --loggerFluentPort, --lfp                                     [default: 24224]
    --sslCert                                                             [string]
    --sslKey                                                              [string]
    --compression                                       [boolean] [default: false]
    --cronJobScheduler, --cjs   Avian components are capable of scheduling
                                cron-like jobs that are executed on the server.
                                                        [boolean] [default: false]

### Application Folder Structure

    ├── assets [optional, statically served at /assets]
    ├── static [optional, statically served at /static]
    ├── cache [auto-generated by Avian in production mode to hold cached files]
    ├── components
    │   ├── server.routes.(ts/js) [optional, used to add server routes to / path]
    │   ├── component_name.client.(ts/js) [optional, contains all JavaScript/TypeScript logic for a component. Will be bundled with Webpack]
    │   ├── component_name.view.(pug/ejs/html) [optional, renders output to a screen, e.g. a /component_name get request]
    │   ├── component_name.server.routes.*.(ts/js) [optional, used to add server routes to /component_name]
    │   ├── component_name.config.json [optional, served at /component_name/config/objects.json and passed to view files at render time]
    │   ├── component_name [components can be in a flat folder or scaffolded like this]
    │   │   ├── component_name.client.(ts/js)
    │   │   ├── component_name.view.(pug/ejs/html)
    │   │   ├── component_name.server.routes.*.(ts/js)
    │   │   ├── component_name.config.json
    ├── logs [auto-generated by Avian in production mode]
    ├── package.json
    ├── private [auto-generated by Avian to contain server side compiled files, e.g. component server files]
    ├── public [auto-generated, for compiled component bundles, statically served at /]

### Session Management

Avian uses [express-session](https://github.com/expressjs/session) to manage client sessions. All sessions are stored in a Redis store.

- Browser Based Clients
  - Avian uses secure [HttpOnly Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#Secure_and_HttpOnly_cookies) for managing browser based client sessions.

- Mobile Device and API Clients
  - Avian augments express-session to allow API and mobile device sessions management.  Since those clients may not use cookies they simply need to send their session ID in the authorization header of all requests made to Avian. See below for an example header.

```json
headers: {
    Authorization: "Bearer Session_ID"
}
```

### Global Variables Added by Avian

#### Properties Added to All Request Objects

`req.argv` contains a copy of all arguments passed to Avian at start time.

`req.cache` is a RedisClient instance hooked to Avian's config object cache. Feel free to use it for your own needs as well.

`req.params` paramaters passed to your component. Typically this is used to determine the component name being rendered, e.g. req.params.component.

`req.query` contains all query parameters passed to the componenent being requested.

#### Developing w/ TypeScript

To make TypeScript aware of the globals Avian adds to your application simply place the below import into any .d.ts file that is within your application.

```typescript
import * as Avian from "spytech/avian"
```

## Examples

Examples are located in the [examples directory](https://github.com/ispyhumanfly/avian/tree/master/examples).

## Contributors

    Dan Stephenson
    Nick Fredricks

## License

    MIT

## Copyright

    2018 - 2020 FlyPaper Technologies, LLC
    2016 - 2018 Thoughtpivot, LLC
