var Module = require("../module"),
    Q = require("q"),
    fs = require("fs"),
    async = require("async"),
    _ = require("lodash"),
    parseUtils = require("../parseutils"),
    fixSQLCase = require("../instrument/sqlcase");

function test(file, options) {
    "use strict";

    console.log(file);

    return parseUtils
        .parseFile(file)
        .then(function(parseResult) {
            // save the original source code.
            var src = parseResult.src;
            var ast = parseResult.ast;

            parseUtils.addSource(ast, src);

            const result = fixSQLCase(src, ast, file);

            if (result) {
                if (result.stats) {
                    Object.keys(result.stats).forEach(s =>
                        console.log(
                            `${_.padEnd(s, 20, " ")} = ${result.stats[s]}`
                        )
                    );
                }

                console.log("new source: ");
                console.log("----------------------------------------------");
                console.log(result.newSource);
            }

            return result;
        })
        .catch(function(e) {
            // don't kill the whole process.
            console.error(
                "Problem instrumenting file. ",
                e,
                " in file: ",
                file
            );
        })
        .done();
}

module.exports = test;
