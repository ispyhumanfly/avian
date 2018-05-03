"use strict";

var _this = this;

exports.__esModule = true;

var events = require("events");

var crypto = require("crypto");

var cluster = require("cluster");

var express = require("express");

var parser = require("body-parser");

var os = require("os");

var fs = require("fs");

var session = require("express-session");

var jsonfile = require("jsonfile");

var compression = require("compression");

var shx = require("shelljs");

var argv = require("yargs").argv;

var name = argv.name || process.env.AVIAN_APP_NAME || process.env.HOSTNAME || "localhost";

var home = argv.home || process.env.AVIAN_APP_HOME || shx.pwd();

var port = argv.port || process.env.AVIAN_APP_PORT || process.env.PORT || 8080;

var mode = argv.mode || process.env.AVIAN_APP_MODE || process.env.NODE_MODE || "development";

var temp = argv.temp || process.env.AVIAN_APP_TEMP || process.env.TMP || process.env.TEMP || shx.pwd();

if (cluster.isMaster) {
    var cores = os.cpus();
    for (var i = 0; i < cores.length; i++) {
        cluster.fork();
    }
    cluster.on("exit", function(worker) {
        cluster.fork();
    });
} else {
    var avian = express();
    var redisStore = require("connect-redis-crypto")(session);
    avian.use(session({
        store: new redisStore({
            host: "127.0.0.1"
        }),
        secret: crypto.createHash("sha512").digest("hex"),
        resave: false,
        saveUninitialized: false
    }));
    avian.use(require("express-redis")(6379, "127.0.0.1", {
        return_buffers: true
    }, "cache"));
    avian.use("/assets", express.static(home + "/assets"));
    avian.use("/static", express.static(home + "/static"));
    avian.use("/node_modules", express.static(home + "/node_modules"));
    avian.use("/bower_components", express.static(home + "/bower_components"));
    avian.use("/jspm_packages", express.static(home + "/jspm_packages"));
    avian.set("view engine", "pug");
    avian.set("views", home);
    if (mode === "production") {
        if (!fs.existsSync(home + "/cache/")) shx.mkdir(home + "/cache/");
        if (!fs.existsSync(home + "/logs/")) shx.mkdir(home + "/logs/");
        avian.use(require("express-bunyan-logger")({
            name: name,
            streams: [ {
                level: "info",
                stream: process.stdout
            }, {
                level: "info",
                stream: process.stderr
            }, {
                level: "info",
                type: "rotating-file",
                path: home + ("/logs/" + name + "." + process.pid + ".json"),
                period: "1d",
                count: 365
            } ]
        }));
        avian.use(require("express-minify")({
            cache: home + "/cache"
        }));
        avian.use(compression());
    }
    var event_1 = new events.EventEmitter();
    event_1.on("synch", function() {
        _this;
    });
    avian.get("/:component", parser.urlencoded({
        extended: true
    }), function(req, res, next) {
        try {
            event_1.emit("synch", req.cache.set(name, JSON.stringify(jsonfile.readFileSync(home + ("/components/" + req.params.component + ".storage.json")))));
        } catch (err) {
            if (err) if (home + ("/components/" + req.params.component)) res.redirect("/errors");
        }
        try {
            req.cache.get("" + req.params.component, function(err, storage) {
                res.render(home + ("/components/" + req.params.component + ".template.pug"), JSON.parse(storage));
            });
        } catch (err) {
            if (err) res.redirect("/errors");
        }
    });
    avian.get("/:component/storage/objects.json", function(req, res, next) {
        event_1.emit("synch", req.cache.set(req.params.component, JSON.stringify(jsonfile.readFileSync(home + ("/components/" + req.params.component + ".storage.json")))));
        req.cache.get(req.params.component, function(err, storage) {
            res.json(JSON.parse(storage));
        });
    });
    fs.readdir(home + "/components", function(err, items) {
        for (var i = 0; i < items.length; i++) {
            if (!items[i].search(/.*service/g)) {}
        }
    });
    avian.all("*", function(req, res, next) {
        res.redirect("/index");
    });
    var portal = avian.listen(port, function() {
        console.log("Avian - Core: %s, Process: %sd, Name: %s, Home: %s, Port: %d", cluster.worker.id, process.pid, name, home, port);
    });
}