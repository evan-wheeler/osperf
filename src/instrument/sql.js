var compare = require("./../compare"),
    EditList = require("./../edits"),
    _ = require("lodash"),
    cmp = require("../compare"),
    Walker = require("bannockburn").Walker;

function stringifyJSON(node) {
    var seen = [];

    return JSON.stringify(
        node,
        function(key, val) {
            if (
                ["loc", "range", "std", "lbp", "scope", "led"].indexOf(key) >= 0
            ) {
                return;
            }

            if (val != null && typeof val == "object") {
                if (seen.indexOf(val) >= 0) {
                    return;
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

var capiExec = {
    callee: [
        {
            object: {
                value: "CAPI",
                arity: "name"
            },
            type: "MemberExpression",
            property: {
                value: "Exec",
                arity: "literal"
            }
        }
    ]
};

var capiWrapper = {
    arity: "binary",
    callee: [
        {
            object: {},
            property: {
                value: "CAPIWrapper",
                arity: "literal"
            },
            type: "MemberExpression"
        }
    ],
    type: "CallExpression"
};

var _capiWrapper = {
    arity: "binary",
    callee: [
        {
            value: ".",
            arity: "binary",
            object: null,
            property: {
                value: "_CAPIWrapper",
                arity: "literal"
            },
            type: "MemberExpression"
        }
    ],
    type: "CallExpression"
};

function isSimpleOp(node) {
    if (!node) {
        return true;
    }
    var arg = node[0];

    if (
        arg.id === "(name)" ||
        arg.id === "(literal)" ||
        arg.arity === "literal"
    ) {
        return true;
    } else if (arg.type === "MemberExpression") {
        return (
            (!arg.object ||
                arg.object.id === "(name)" ||
                arg.object.id === "(literal)" ||
                arg.object.arity === "literal") &&
            (arg.property &&
                (arg.property.id === "(name)" ||
                    arg.property.id === "(literal)" ||
                    arg.property.arity === "literal"))
        );
    }
    return false;
}

function instrument(code, parseTree, filename) {
    // walk the parse tree and add code at the beginning of each function definition, before
    // each return function, and at the end of each function body.

    // walk the top level looking for functions...
    var editList = new EditList(code);

    var w = new Walker();

    var altExec = /ospace_src.(?:Replicator Root)/i.test(filename)
        ? ".ExecSQL"
        : "$Replicator.Q.ExecSQL";

    // console.log(stringifyJSON(node));

    /*
      console.log(
        // file + ":" + curScript + "." + curFunction,
        // ":",
        src.substring(node.range[0], node.range[1] + 1)
      );
      */

    w.on("CallExpression", function(node) {
        if (cmp(node, capiExec) || cmp(node, capiWrapper)) {
            // first replace CAPI.Exec with $Replicator.Q.ExecSQL(
            var startCapiExec = this.getStartPos(node);
            var endCapiExec = this.getEndPos(node.callee[0].property);

            editList.replace(startCapiExec, endCapiExec + 1, altExec);

            if (node.arguments.length >= 2) {
                var arg = node.arguments[0];
                var argCode = code.substring(arg.range[0], arg.range[1] + 1);
                var newArg;

                if (cmp(arg, anyPrgCtx)) {
                    var innerObj = arg.object.object;
                    newArg = code.substring(
                        innerObj.range[0],
                        innerObj.range[1] + 1
                    );
                } else if (cmp(arg, anyDbConnect)) {
                    newArg = arg.object.value;
                } else if (/^\.fprgctx\s*[,.]/i.test(argCode)) {
                    newArg = ".fPrgCtx";
                }

                // console.log(" Arg 0 can stay: ", argCode);

                if (newArg) {
                    editList.replace(
                        this.getStartPos(arg),
                        this.getEndPos(arg) + 1,
                        newArg
                    );
                }

                if (node.arguments.length === 2) {
                    // add an empty list as third arg...
                    editList.insert({
                        str: ", {}",
                        pos: this.getEndPos(node.arguments[1]) + 1
                    });
                } else {
                    editList.insert({
                        str: "{",
                        pos: this.getStartPos(node.arguments[2])
                    });
                    editList.insert({
                        str: "}",
                        pos:
                            this.getEndPos(
                                node.arguments[node.arguments.length - 1]
                            ) + 1
                    });
                }
            }
        }
    });

    w.start(parseTree);

    var rtn = null;

    if (editList.edits.length > 0) {
        rtn = editList.apply();
    }

    // return the instrumented code.
    return rtn;
}
