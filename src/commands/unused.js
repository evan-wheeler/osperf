var Module = require("../module"),
    Q = require("q"),
    fs = require("fs"),
    async = require("async"),
    _ = require("lodash"),
    parseUtils = require("../parseutils"),
    Bannockburn = require("bannockburn"),
    path = require("path");

function unused(modules, options) {
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

var calls = {
    setprototype: [],
    __init: [],
    documentation: [],
    dofileinstall: [],
    dodbinstall: [],
    docustomstep: [],
    execute: [],
    dodbscripts: [],
    "action-browse": [],
    "action-targetbrowse": [],
    executerequest: [],
    tables: [],
    getlogininfo: [],
    generateoutput: []
};

let scripts = {};
let hasExecSQL = {};

function addScript(script, file) {
    script = script.toLowerCase();

    if (scripts.hasOwnProperty(script)) {
        scripts[script].push(file);
    } else {
        scripts[script] = [file];
    }
}

function addCall(prop, func, file) {
    let label = "";

    label = prop.value;
    label = label.toLowerCase();

    if (calls.hasOwnProperty(label)) {
        if (!calls[label].find(v => v.func === func && v.file === file)) {
            calls[label].push({ func, file });
        }
    } else {
        calls[label] = [{ func, file }];
    }
}

function findUnrefedScripts() {
    let unrefed = _.clone(scripts);
    let withSQL = {};

    for (let s of Object.keys(calls)) {
        delete unrefed[s];
    }

    for (let s of Object.keys(unrefed)) {
        let files = unrefed[s];

        if (files.find(f => hasExecSQL.hasOwnProperty(f))) {
            withSQL[s] = files;
        }
    }

    return { unrefed, withSQL };
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

            var w = new Bannockburn.Walker();

            var curScript = path.basename(file).replace(/\.Script$/, "");
            var curFunction = "";

            if (src.toLowerCase().indexOf(".execsql(") >= 0) {
                hasExecSQL[file] = true;
            }

            // console.log("Current script: ", curScript);

            if (
                file.indexOf("/DBScripts/") === -1 &&
                file.indexOf("/Startup.Script") === -1 &&
                !/\.html$/i.test(file)
            ) {
                // skip certain scripts and directories...

                addScript(curScript, file);
            }

            w.on("FunctionDeclaration", function(node) {
                curFunction = node.name;
                emitDecl = false;
            });

            w.on("CallExpression", function(node) {
                if (node.callee) {
                    let callee = _.isArray(node.callee)
                        ? node.callee[0]
                        : node.callee;

                    if (callee.type === "MemberExpression") {
                        let prop = _.isArray(callee.property)
                            ? callee.property[0]
                            : callee.property;

                        if (_.isNil(prop)) {
                            console.log(
                                "Found nil prop: ",
                                stringifyJSON(node)
                            );
                        } else if (prop.arity !== "literal") {
                            console.log("*** Other usage: ", node.code);
                        } else {
                            addCall(prop, curFunction, file);
                        }
                    }
                }
            });

            w.start(ast);

            done(null, { result: [] });
        })
        .catch(function(e) {
            // don't kill the whole process.
            console.error("Problem processing file. ", e, " in file: ", file);
            done(null, { results: [] });
        })
        .done();
}

var x = 0;

function combine(results) {
    let unrefed = findUnrefedScripts();

    console.log("---------------------------------------------------------");
    console.log(" Unreferenced Scripts");
    console.log("---------------------------------------------------------");
    console.log(JSON.stringify(unrefed, null, 2));

    console.log("---------------------------------------------------------");
    console.log(" Scripts:");
    console.log("---------------------------------------------------------");
    console.log(JSON.stringify(scripts, null, 2));

    console.log("---------------------------------------------------------");
    console.log(" Calls: ", calls.length);
    console.log("---------------------------------------------------------");
    console.log(JSON.stringify(calls, null, 2));

    return [];
}

module.exports = unused;
