var Module = require("../module"),
    Q = require("q"),
    fs = require("fs"),
    async = require("async"),
    _ = require("lodash"),
    parseUtils = require("../parseutils"),
    fixSQLCase = require("../instrument/sqlcase");

const header = "// Some SQL statements automatically fixed by osperf... \r\n";

function search(modules, options) {
    "use strict";

    if (!_.isArray(modules)) {
        modules = [modules];
    }

    var modObjs = modules.map(function(modName) {
        return new Module(modName, options.base);
    });

    var params = {};

    return parseUtils
        .listScriptsInModules(modObjs)
        .then(function(allFiles) {
            return processFiles(allFiles, params);
        })
        .catch(function(e) {
            console.error("There was a problem: ", e);
        });
}

function processFiles(srcFiles, params) {
    "use strict";
    return Q.nfcall(
        async.mapLimit,
        srcFiles,
        4,
        processEach.bind(null, params)
    ).then(combine);
}

function stringifyJSON(node, noLocFilter) {
    var seen = [];
    return JSON.stringify(
        node,
        function(key, val) {
            if (!noLocFilter && ["loc", "range"].indexOf(key) >= 0) {
                return;
            } else if (["std", "lbp", "scope", "led"].indexOf(key) >= 0) {
                return;
            }

            if (val != null && typeof val == "object") {
                if (seen.indexOf(val) >= 0) {
                    return "<seen>";
                }
                seen.push(val);
            }
            return val;
        },
        4
    );
}

function processEach(params, file, done) {
    // console.log( "Reading file: ", file );

    parseUtils
        .parseFile(file)
        .then(function(parseResult) {
            // save the original source code.
            var src = parseResult.src;
            var ast = parseResult.ast;

            parseUtils.addSource(ast, src);

            if (src.toLowerCase().indexOf(".execsql(") < 0) {
                done(null, { result: [] });
                return;
            }

            const result = fixSQLCase(src, ast, file);

            if (result.newSource) {
                if (result.newSource.substring(0, header.length) !== header) {
                    result.newSource = header + result.newSource;
                }

                fs.writeFileSync(file, result.newSource, "utf8");
            }

            // just return the block & function data.
            done(null, result);
        })
        .catch(function(e) {
            // don't kill the whole process.
            console.error(
                "Problem instrumenting file. ",
                e,
                " in file: ",
                file
            );
            done(null, {});
        })
        .done();
}

const addStats = (stats, cur) => {
    for (let name of Object.keys(cur)) {
        if (!stats[name]) {
            stats[name] = cur[name];
        } else {
            stats[name] += cur[name];
        }
    }
};

function combine(results) {
    let stats = {};

    for (let r of results) {
        if (r && r.stats) {
            addStats(stats, r.stats);
        }
    }

    Object.keys(stats).forEach(s =>
        console.log(`${_.padEnd(s, 20, " ")} = ${stats[s]}`)
    );

    return [];
}

module.exports = search;
