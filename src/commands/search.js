var Module = require("../module"),
    Q = require("q"),
    fs = require("fs"),
    async = require("async"),
    _ = require("lodash"),
    cfg = require("../instrument/cfg"),
    walk = require("../instrument/walk"),
    parseUtils = require("../parseutils"),
    Bannockburn = require("bannockburn"),
    path = require("path"),
    cmp = require("../compare"),
    EditList = require("../edits");

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
        .then(function(results) {
            /*
            var output = genCoverageData( results.blocks, results.functions, gen.getIDs(), params.sourceStore );
            fs.writeFileSync( options.output, JSON.stringify( output ), 'utf8' );

            // add headers
            modObjs.forEach( function( m ) {
                addHeader( m.getStartupScripts() );
            } );
            */
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

var globalVar = {
    value: "$",
    arity: "unary",
    argument: {
        arity: "literal",
        decl: false
    },
    type: "UnaryExpression",
    operator: "$",
    prefix: true
};

var singleVar = {
    arity: "name",
    decl: true
};

var anyPrgCtx = {
    value: ".",
    arity: "binary",
    object: {
        value: ".",
        arity: "binary",
        object: {},
        property: {
            value: "fDBConnect",
            arity: "literal"
        },
        type: "MemberExpression"
    },
    property: {
        value: "fConnection",
        arity: "literal"
    },
    type: "MemberExpression"
};

var anyDbConnect = {
    object: {
        arity: "name"
    },
    property: {
        value: "fConnection",
        arity: "literal"
    },
    type: "MemberExpression"
};

var dtTable = {
    value: "$",
    arity: "unary",
    argument: {
        value: "DT_TABLE",
        arity: "literal"
    },
    type: "UnaryExpression",
    operator: "$",
    prefix: true
};

function getStaticStr(node) {
    if (node.arity === "literal" && typeof node.value === "string") {
        return node.value;
    }

    if (cmp(node, dtTable)) {
        // We don't use this format, but it's valid SQL to parse, so this
        // will be our hint that we need to replace it with $DT_TABLE
        return "[DTree]";
    }

    if (node.type === "BinaryExpression" && node.operator === "+") {
        var left = getStaticStr(node.left);
        var right = getStaticStr(node.right);

        if (left === null || right === null) {
            return null;
        }

        return left + right;
    }

    return null;
}

var execSQL = {
    callee: [
        {
            type: "MemberExpression",
            property: {
                value: "ExecSQL"
            }
        }
    ]
};

var varInit = {
    type: "VariableDeclarator",
    init: {
        value: "select * from dtree",
        arity: "literal"
    },
    dataType: {
        value: "String",
        arity: "name"
    }
};

var assignment = {
    arity: "binary",
    left: {
        arity: "name"
    },
    right: {
        arity: "literal"
    },
    type: "AssignmentExpression",
    operator: "="
};

var countNotStatic = 0,
    countStatic = 0;

var commonStatements = {};

function processEach(params, file, done) {
    // console.log( "Reading file: ", file );

    parseUtils
        .parseFile(file)
        .then(function(parseResult) {
            // save the original source code.
            var src = parseResult.src;

            src = `
function x()
    Boolean isSQL = true
    String s = "select * from "

    if isSQL 
        s =  "select * from dtreecore"
    else 
        s += "dtree"
    end

    Echo( s )
End`


            var parser = Bannockburn.Parser(),
                ast = parser.parse(src),
                astNode = parseUtils.getASTNode;

            var origAST = _.cloneDeep(ast);

            // console.log(stringifyJSON(ast));

            /*
            var w = new Bannockburn.Walker();

            var curScript = path.basename(file).replace(/\.Script$/, "");
            var curFunction = "";

            var editList = new EditList(src);

            var emitDecl = false;

            w.on("VariableDeclarator", function(node) {
                console.log("Declaration: ", stringifyJSON(node));
            });

            w.on("AssignmentExpression", function(node) {
                console.log("Assignment: ", stringifyJSON(node));
            });

            w.on("FunctionDeclaration", function(node) {
                curFunction = node.name;
                emitDecl = false;
            });

            w.on("CallExpression", function(node) {
                var nodeCode = src.substring(node.range[0], node.range[1] + 1);

                if (cmp(node, execSQL)) {
                    var arg = node.arguments[1];
                    var argCode = src.substring(arg.range[0], arg.range[1] + 1);
                    var staticVal = getStaticStr(arg);

                    if (staticVal !== null) {
                        countStatic++;
                        console.log("Static: ", staticVal);

                        var stmt = staticVal.toLowerCase();

                        if (!commonStatements[stmt]) {
                            commonStatements[stmt] = 1;
                        } else {
                            commonStatements[stmt]++;
                        }
                    } else {
                        if (!emitDecl) {
                            console.log(
                                "__________________________________________________________"
                            );
                            console.log(file, " : ", curFunction);
                            console.log("==>");
                            emitDecl = true;
                        }

                        countNotStatic++;
                        console.log(" => Statement: ", nodeCode);
                        console.log(" => Fix: ", argCode);
                        console.log(stringifyJSON(arg));

                        // Try to find possible static values of the sql statement variable.

                        console.log(
                            "--------------------------------------------------------"
                        );
                        console.log(src);
                        console.log(
                            "--------------------------------------------------------"
                        );

                        console.log(stringifyJSON(staticTrace(ast, arg, {})));
                        process.exit(0);
                    }
                }
            });

            w.start(ast);
            */

            walk(function(node) {
                if (node) {
                    if (node.type === "FunctionDeclaration") {
                        var c = new cfg();

                        var result = c.build(node);

                        console.log(stringifyJSON(result));

                        c.printPaths( src );

                        process.exit(0);
                    }
                }
            }, ast);

            // console.log(stringifyJSON(staticTrace(ast, null, {})));
            process.exit(0);

            // instrument the code.
            // var result = instrument( parseResult.src, parseResult.ast, blockIDGen, params );

            // write the modified code back to the original file.
            // fs.writeFileSync( file, result.result, 'utf8' );

            // just return the block & function data.
            done(null, { result: [] });
        })
        .catch(function(e) {
            // don't kill the whole process.
            console.error(
                "Problem instrumenting file. ",
                e,
                " in file: ",
                file
            );
            done(null, { results: [] });
        })
        .done();
}

var x = 0;

function combine(results) {
    console.log("Non-Static SQL statements: ", countNotStatic);
    console.log("Static SQL statements: ", countStatic);

    var commonList = [];

    _.forEach(commonStatements, function(v, k) {
        if (v > 1) {
            commonList.push({ stmt: k, val: v });
        }
    });

    console.log(
        "============================================================="
    );
    console.log("Common Statements: ");
    console.log(
        "============================================================="
    );

    commonList
        .sort((a, b) => {
            return a.val - b.val;
        })
        .forEach(v => {
            console.log("Statement [" + v.val + "]: " + v.stmt);
        });

    return results.reduce(
        function(last, cur) {
            return {
                results: last.results.concat(cur.results)
            };
        },
        {
            results: []
        }
    );
}

module.exports = search;
