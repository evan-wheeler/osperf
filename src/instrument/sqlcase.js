const cmp = require("../compare"),
    cfg = require("../instrument/cfg"),
    fixQuery = require("../query"),
    getStaticStr = require("../staticval"),
    Bannockburn = require("bannockburn"),
    _ = require("lodash"),
    path = require("path"),
    StaticEmptyStr = require("../statics").StaticEmptyStr;

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
    countStatic = 0,
    countFixed = 0,
    countGood = 0;

var unsolvable = {};

const overlaps = (r1, r2) => {
    return !(r1.start >= r2.end || r1.end <= r2.start);
};

const mergeReplacements = (existing, cur) => {
    const additions = [];
    cur.forEach(r => {
        // check if any replacements overlap with existing replacements.
        const matches = existing.filter(e => overlaps(e, r));
        let dup = false;

        if (matches.length > 0) {
            // ensure same match/same replacement --
            const badmatch = matches.find(
                e =>
                    e.start !== r.start ||
                    e.end !== r.end ||
                    e.value !== r.value
            );

            if (badmatch) {
                throw new error({
                    message: "Bad replacement",
                    existing: r,
                    bad: badmatch
                });
            }
            dup = true;
        }

        if (!dup) {
            additions.push(r);
        }
    });

    return [...existing, ...additions];
};

const checkSingleAssignment = (varName, callGraph) => {
    let val = null;

    for (let b of callGraph.blocks) {
        let vars = {};
        vars = b.traceVars(vars);

        if (vars && vars[varName]) {
            let variable = vars[varName];
            let v = variable.value;

            if (v === "" && variable instanceof StaticEmptyStr) {
                // this is just a variable declaration without an initializer.
                // don't count this...
                continue;
            }

            if (v === null || val !== null) {
                return null;
            }

            // assigment in block ...
            val = variable;
        }
    }
    return val;
};

const checkBlockAssign = (varName, arg, callGraph) => {
    for (let b of callGraph.blocks) {
        if (b.containsNode(arg)) {
            let varsIn = {};
            let vars = b.traceVars(varsIn, arg, true);

            if (vars) {
                const variable = vars[varName];

                if (variable) {
                    const val = variable.value;

                    if (typeof val === "string" && val !== "") {
                        return variable;
                    }
                }
            }

            break;
        }
    }
    return null;
};

const asURL = f => {
    return `${f}`;
};

module.exports = function fixSQLCase(src, ast, file) {
    console.log(asURL(file));

    const stats = {
        statements: 0, // number of statements
        attempts: 0, // number of attempts to fix statements
        good: 0, // number of statements already fixed.
        fixed: 0, // number of fixed statements
        errors: 0, // number of statements with parse errors
        unsolved: 0, // number of statements completely unsolved.
        partial: 0, // number of statements partially or possibly solved
        static: 0, // number of statements statically determined.
        singleAssign: 0, // number of statements static by single assignment
        blockAssign: 0 // number of statements static by block assignment
    };

    let replacements = [];

    // console.log(stringifyJSON(ast));

    let w = new Bannockburn.Walker();

    let curScript = path.basename(file).replace(/\.Script$/i, ""),
        curFunction = "",
        emitDecl = false,
        lastFn = null,
        curCFG = null,
        codePaths = null;

    const fixit = (staticVal, type) => {
        if (typeof staticVal !== "object") {
            throw new error({ message: "wrong type", value: staticVal });
        }

        stats.attempts++;

        let q = staticVal.value;

        const fixed = fixQuery(q);

        if (fixed === null) {
            console.log(`   Error parsing ${type}:`, q);
            stats.errors++;
            return null;
        } else if (fixed !== q) {
            console.log(`   Fixed ${type}:`, fixed);
            stats.fixed++;
        } else {
            // console.log(`   Good ${type}:`, q);
            stats.good++;
            return false;
        }

        // merge in replacements...
        replacements = mergeReplacements(
            replacements,
            staticVal.replace(fixed)
        );

        // fixed
        return true;
    };

    w.on("FunctionDeclaration", function(node) {
        curFunction = node.name;
        emitDecl = false;
        lastFn = node;
    });

    w.on("after:FunctionDeclaration.body", function(node) {
        lastFn = null;
        curCFG = null;
        codePaths = null;
    });

    w.on("CallExpression", function(node) {
        var nodeCode = src.substring(node.range[0], node.range[1] + 1);

        if (cmp(node, execSQL)) {
            stats.statements++;

            var arg = node.arguments[1];
            var staticVal = getStaticStr(arg, {});

            if (staticVal !== null) {
                stats.static++;
                fixit(staticVal, "(static)");
                return;
            }

            if (lastFn && arg.arity === "name") {
                // in a function and the statement argument is a variable.
                let varName = arg.value.toLowerCase();

                if (!curCFG) {
                    curCFG = new cfg();
                    curCFG.build(lastFn);
                }

                // First check simple cases: Single assignment / same block assignments

                let variable = checkSingleAssignment(varName, curCFG);

                if (variable !== null && variable.value !== "") {
                    stats.static++;
                    stats.singleAssign++;
                    fixit(variable, "(single assign)");
                    return;
                }

                variable = checkBlockAssign(varName, arg, curCFG);

                if (variable !== null) {
                    stats.static++;
                    stats.blockAssign++;
                    fixit(variable, "(same block)");
                    return;
                }

                // perform harder checks...
                if (!codePaths) {
                    codePaths = curCFG.findPaths();
                }

                let possibleVars = [],
                    keys = {},
                    badPaths = false;

                codePaths.forEach(p => {
                    const curVars = curCFG.traceVarsTo(p, arg);
                    const result = curVars[varName];
                    if (result) {
                        const v = result.value;
                        if (v !== "" && !keys.hasOwnProperty(v)) {
                            possibleVars.push(result);
                            keys[v] = true;
                        }
                    } else {
                        badPaths = true;
                    }
                });

                // Try to find possible static values of the sql statement variable.

                if (possibleVars.length > 0) {
                    // eliminate duplicates...
                    possibleVars.forEach(e => {
                        fixit(e, "(possible value)");
                    });

                    if (badPaths) {
                        console.log("   * Some paths were not computed");
                        stats.partial++;
                    }

                    return;
                }
            }

            stats.unsolved++;
            console.log("   #### UNSOLVED: ", nodeCode);
            console.log(`       Link: "${asURL(file)}:${node.loc.start.line}"`);
        }
    });

    w.start(ast);

    let rtn = {
        stats: stats
    };

    // instrument the code.
    // var result = instrument( parseResult.src, parseResult.ast, blockIDGen, params );

    // write the modified code back to the original file.
    if (replacements.length > 0) {
        let newSrc = src;

        replacements.forEach(r => {
            const before = newSrc.substring(0, r.start);
            const after = newSrc.substring(r.end);
            const existing = src.substring(r.start, r.end);

            newSrc = before + r.value + after;
        });

        rtn.newSource = newSrc;
    }

    return rtn;
};
