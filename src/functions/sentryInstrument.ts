import { argv, utils } from "../avian.lib"
import * as Sentry from "@sentry/node"
import { nodeProfilingIntegration } from "@sentry/profiling-node"

if (argv.sentryDSN) {
    Sentry.init({
        dsn: argv.sentryDSN,
        environment: argv.sentryEnvironment,
        release: argv.sentryRelease,
        integrations: [nodeProfilingIntegration()],
        tracesSampleRate: argv.mode === "production" ? 0.1 : 1.0
    })
}
