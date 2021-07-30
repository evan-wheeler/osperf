const cmp = require("../compare"),
    cfg = require("../instrument/cfg"),
    fixQuery = require("../query"),
    getStaticStr = require("../staticval").getStaticStr,
    Bannockburn = require("bannockburn"),
    FileReport = require("../report").FileReport,
    StaticEmptyStr = require("../statics").StaticEmptyStr;

const { getNode, getNodeProp } = require("../nodeutil");

const getQueryStmt = node => {
    const n = getNode(node);

    if (!n || !n.callee) {
        return null;
    }

    const callee = getNodeProp(n, "callee");

    if (!callee || callee.type !== "MemberExpression") {
        return null;
    }

    const propertyVal = (
        getNodeProp(callee, "property", "value") || ""
    ).toLowerCase();
    const objVal = (getNodeProp(callee, "object", "value") || "").toLowerCase();

    if (objVal === "capi" && n.arguments && n.arguments.length > 1) {
        if (propertyVal === "exec") {
            return { type: "CAPI.Exec", statement: n.arguments[1] };
        } else if (propertyVal === "execn") {
            return { type: "CAPI.ExecN", statement: n.arguments[1] };
        }
        return null;
    }

    if (
        (propertyVal === "execsql" ||
            propertyVal === "query" ||
            propertyVal === "_findmissingids" ||
            propertyVal === "exportquery") &&
        n.arguments &&
        n.arguments.length > 1
    ) {
        // same semantics -- just use execsql
        return { type: "ExecSQL", statement: n.arguments[1] };
    } else if (
        propertyVal === "exec" &&
        objVal &&
        n.arguments &&
        n.arguments.length > 0
    ) {
        // prgCtx and dbConnect both have an exec function...
        return { type: "Exec", statement: n.arguments[0] };
    }

    return null;
};

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
            let badmatch = false;

            matches.find(e => {
                if (
                    e.start === r.start &&
                    e.end === r.end &&
                    e.value === r.value
                ) {
                    dup = true;
                    return true;
                }

                // find the overlapping portions...
                const eStart = e.start < r.start ? r.start : e.start,
                    eEnd = e.end > r.end ? r.end : e.end,
                    rStart = r.start < e.start ? e.start : r.start,
                    rEnd = r.end > e.end ? e.end : r.end;

                if (
                    e.value.substring(eStart, eEnd) !==
                    r.value.substring(rStart, rEnd)
                ) {
                    badMatch = true;
                    return true;
                }
            });

            if (badmatch) {
                throw new Error(
                    `Bad replacement - Existing = ${JSON.stringify(
                        r
                    )}, Bad: ${JSON.stringify(badmatch)}`
                );
            }
        }

        if (!dup) {
            // This algorithm doesn't remove all overlap between replacements.
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

const NoCheckDirective = node => {
    return (
        node.annotation &&
        (node.annotation.tag === "sqlnocheck" ||
            node.annotation.tag === "nosqlcheck")
    );
};

module.exports = function fixSQLCase(src, ast, file) {
    var __CUR_OSCRIPT__ = asURL(file),
        __CUR_QUERY__ = "";

    function statusMsg() {
        if (__CUR_OSCRIPT__) {
            console.log(__CUR_OSCRIPT__);
            __CUR_OSCRIPT__ = "";
        }

        if (__CUR_QUERY__) {
            console.log("    > ", __CUR_QUERY__);
            __CUR_QUERY__ = "";
        }

        // log all args.
        console.log.apply(console, [...arguments]);
    }

    const report = new FileReport(file);

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

    let lastFn = null,
        curCFG = null,
        codePaths = null,
        stmtHistory = {};

    const fixit = (staticVal, type) => {
        if (typeof staticVal !== "object") {
            throw new Error(`wrong type ${staticVal}`);
        }

        let q = "" + staticVal.value;

        let qKey = q;

        if (stmtHistory.hasOwnProperty(qKey)) {
            // console.log("Duplicate");
            return stmtHistory[qKey];
        }

        stats.attempts++;

        try {
            const { result, warnings } = fixQuery(q);

            if (result !== q) {
                if (warnings.length) {
                    statusMsg(`   Warnings and corrections ${type}:`, result);
                    statusMsg("          Warnings: ", warnings);
                    report.curExec().addWarning(staticVal, warnings);
                } else {
                    statusMsg(`   Fixed ${type}:`, result);
                    report.curExec().addGood(staticVal);
                }

                stats.fixed++;
                replacements = mergeReplacements(
                    replacements,
                    staticVal.replace(result)
                );
                stmtHistory[qKey] = true;

                return true;
            }

            if (warnings.length) {
                statusMsg(`      ---> Warnings only ${type}:`, q);
                statusMsg("          Warnings: ", warnings);
            } else {
                // statusMsg(`      ---> Good ${type}:`, q);
                report.curExec().addGood(staticVal);
            }

            stats.good++;
        } catch (e) {
            // parse error ...
            statusMsg("      # Could not parse: ", q);
            stmtHistory[qKey] = null;
            report.curExec().addError(staticVal, e.message);
            return null;
        }

        // fine, but not corrected
        stmtHistory[qKey] = false;
        return false;
    };

    w.on("FunctionDeclaration", function(node) {
        if (NoCheckDirective(node)) {
            statusMsg("  Skipping function due to NoSQLCheck");
            return false;
        }

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
        if (NoCheckDirective(node)) {
            return false;
        }

        const qInfo = getQueryStmt(node);

        if (qInfo !== null) {
            var nodeCode = src.substring(node.range[0], node.range[1] + 1);

            __CUR_QUERY__ = nodeCode;

            report.newExec(node);

            stats.statements++;

            // arg is the sql statement argument.
            var arg = qInfo.statement;

            if (qInfo.type === "ExecSQL") {
                if (node.arguments.length === 3) {
                    const bindVals = getNode(node.arguments[2]);

                    if (bindVals.type !== "ListExpression") {
                        const varName =
                            bindVals.arity === "name" ? bindVals.value : "";

                        if (
                            [
                                "bindvars",
                                "noderecs",
                                "vals",
                                "params",
                                "recs",
                                "insertrecs",
                                "args",
                                "bindvals"
                            ].indexOf(varName.toLowerCase()) === -1
                        ) {
                            console.warn(
                                ">>>>>> Might be a problem: ",
                                nodeCode
                            );
                        }
                    }
                }
            }

            // try to compute the argument statically without knowing
            // possible values of variables.

            let staticVal = getStaticStr(arg, {});

            if (staticVal !== null) {
                stats.static++;
                const f = fixit(staticVal, "(static)");
                return;
            }

            if (lastFn) {
                if (!curCFG) {
                    curCFG = new cfg();
                    curCFG.build(lastFn);
                }

                if (arg.arity === "name") {
                    // in a function and the statement argument is a variable.
                    let varName = arg.value.toLowerCase();

                    // First check simple cases: Single assignment / same block assignments
                    let variable = checkSingleAssignment(varName, curCFG);

                    if (variable !== null && variable.value !== "") {
                        stats.static++;
                        stats.singleAssign++;
                        const f = fixit(variable, "(single assign)");

                        if (f === true || f === false) {
                            return;
                        }
                    }

                    variable = checkBlockAssign(varName, arg, curCFG);

                    if (variable !== null) {
                        stats.static++;
                        stats.blockAssign++;
                        const f = fixit(variable, "(same block)");
                        if (f === true || f === false) {
                            return;
                        }
                    }
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

                    // try to compute the expression statically, with variables.
                    staticVal = getStaticStr(arg, curVars);

                    if (staticVal) {
                        const v = staticVal.value;
                        if (v !== "" && !keys.hasOwnProperty(v)) {
                            possibleVars.push(staticVal);
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
                        statusMsg("   * Some paths were not computed");
                        stats.partial++;
                    }

                    return;
                }
            }

            stats.unsolved++;
            statusMsg(
                `           #### NO SOLUTIONS ####: "${asURL(file)}:${
                    node.loc.start.line
                }"`
            );
        }
    });

    w.start(ast);

    let rtn = {
        stats,
        report
    };

    // instrument the code.
    // var result = instrument( parseResult.src, parseResult.ast, blockIDGen, params );

    // write the modified code back to the original file.
    if (replacements.length > 0) {
        let newSrc = src;

        replacements.forEach(r => {
            const before = newSrc.substring(0, r.start);
            const after = newSrc.substring(r.end);

            newSrc = before + r.value + after;
        });

        rtn.newSource = newSrc;
    }

    return rtn;
};
