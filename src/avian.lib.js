"use strict";

exports.__esModule = true;

var Avian = function() {
    function Avian(params) {
        this.arguments = params;
        var exec = require("child_process").execSync;
        var avian_cli = exec("node avian.cli.js " + this.arguments + " ");
    }
    return Avian;
}();

exports.Avian = Avian;