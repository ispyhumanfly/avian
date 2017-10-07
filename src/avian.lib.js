"use strict";

exports.__esModule = true;

var Avian = function() {
    function Avian(name, home, port, mode) {
        this.name = name || process.env.AVIAN_APP_NAME || process.env.HOSTNAME;
        this.home = home || process.env.AVIAN_APP_HOME || process.env.HOSTNAME;
        this.port = port || process.env.AVIAN_APP_PORT || process.env.HOSTNAME;
        this.mode = mode || process.env.AVIAN_APP_MODE || process.env.HOSTNAME;
    }
    Avian.prototype.start = function() {
        var exec = require("child_process").execSync;
        var avian_cli = exec("node avian.cli.js --name " + this.name + " --home " + this.home);
    };
    return Avian;
}();

exports.Avian = Avian;