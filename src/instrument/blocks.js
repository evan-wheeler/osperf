var EditList = require("./../edits"),
    _ = require("lodash"),
    cmp = require("../compare"),
    Walk = require("./walk");

function printOne(node) {
    var depth = 0;

    return JSON.stringify(
        node,
        function(key, val) {
            if (typeof val === "object" && depth === 0) {
                depth = 1;
                return val;
            } else if (typeof val === "string") {
                return val;
            }
        },
        4
    );
}

function print(node) {
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
                    return "<seen>";
                }
                seen.push(val);
            }
            return val;
        },
        4
    );
}

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

var varInit = {
    type: "VariableDeclarator",
    name: {
        arity: "name"
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
    right: {},
    type: "AssignmentExpression"
};

function isAssignment(node) {
    return cmp(node, assignment);
}

function isDeclr(node) {
    return cmp(node, varInit);
}

function getStaticStr(node, vars) {
    if (_.isArray(node) && node.length === 1) {
        return getStaticStr(node[0], vars);
    }

    // If literal string, just return value.
    if (node.arity === "literal" && typeof node.value === "string") {
        return node.value;
    }

    if (node.arity === "name") {
        if (typeof vars[node.value] === "string") {
            return vars[node.value];
        }
    }

    // if $DT_TABLE, return [DTree];
    if (cmp(node, dtTable)) {
        // We don't use this format, but it's valid SQL to parse, so this
        // will be our hint that we need to replace it with $DT_TABLE
        return "[DTree]";
    }

    // If static_str + static_str then return result of concatenation.
    if (node.type === "BinaryExpression" && node.operator === "+") {
        var left = getStaticStr(node.left, vars);
        var right = getStaticStr(node.right, vars);

        if (left === null || right === null) {
            return null;
        }

        return left + right;
    }

    return null;
}

function noop() {
    return true;
}
function skipTraverse() {
    return false;
}

function normal(n) {
    if (_.isArray(n)) {
        return n;
    }
    return [n];
}

function nodeDescr(node) {
    var rtn = [];
    if (node.type) {
        rtn.push("Type: " + node.type);
    }
    if (node.arity) {
        rtn.push("Arity: " + node.arity);
    }
    if (node.value) {
        rtn.push("Value: " + node.value);
    }
    if (rtn.length === 0) {
        rtn = ["Unknown"];
    }

    return "[" + rtn.join(", ") + "]";
}

function nilVisit() {}

module.exports = function() {};

/**
 * Creates a BlockTracker, which is used to keeps track of the code coverage blocks
 * @class
 */
function BlockTracker(options) {
    options = options || {};

    var blockStack = [],
        blocks = [],
        blockIndex = 0;

    this.add = function(node) {
        if (blockStack.length === 0) {
            if (rawScript) {
                throw Error("Extraneous input after last function is invalid.");
            }

            // We're outside of all functions.
            this.startBlock(Block.TYPES.FUNCTION, stmt);
            rawScript = true;
        }

        var top = blockStack[blockStack.length - 1];

        if (top.reset) {
            this.endBlock();
            this.startBlock(top.type, stmt);
        } else {
            top.add(stmt);
        }
    };

    /**
     * Starts a new block
     * @param {Integer} type - The block type.
     * @param {Integer} stmt - The stmt where the block begins.
     */
    this.startBlock = function(type, stmt) {
        var block = new Block(type, stmt);
        blockStack.push(block);
        blocks.push(block);
        return block;
    };

    /**
     * Ends a block
     */
    this.endBlock = function() {
        return blockStack.pop();
    };

    /**
     * Traverses the stack, resetting blocks until a block of type blockType is found.
     * @param {Integer} blockType - The type of block to find.
     */
    this.resetBlockType = function(blockType) {
        var i = blockStack.length;

        while (i--) {
            var p = blockStack[i];

            p.reset = true;

            if (p.type === blockType) {
                break;
            }
        }
    };

    /**
     * Returns the blocks that were defined.
     */
    this.getBlocks = function() {
        return blocks;
    };
}

function getBlocks(node) {
    var stack = [];
    var b = new BlockTracker();

    var ifNode = function(node, lbl) {
        if (node === null) {
            // closing
        }
    };

    var visitNode = function(node, lbl) {
        if (node === null) {
            stack.pop();
        } else {
            if (node.type == "IfStatement") {
                b.add(node.test);
                b.startBlock(node.consequent);

                if (node.alternate) {
                    b.startBlock(node);
                }
            }

            stack.push(node);

            console.log(
                _.repeat("  ", stack.length),
                "=> ",
                nodeDescr(node),
                "(" + lbl + ")"
            );
        }
        return visitNode;
    };

    Walk(visitNode, ast);

    return {};
}

function trace(ast, varNode, options) {
    var indent = 0;
    var stack = [];
    var vars = {};

    var visitNode = function(node, lbl) {
        if (node === null) {
            stack.pop();
        } else {
            if (isAssignment(node)) {
                var varName = node.left.value;
                var val = getStaticStr(node.right, vars);

                if (node.operator === "=") {
                    vars[varName] = val;
                } else if (node.operator === "+=") {
                    vars[varName] += val;
                } else {
                    vars[varName] = "<unsupported operator>";
                }

                console.log(
                    "assigned ",
                    varName,
                    " value = '",
                    vars[varName],
                    "'"
                );

                return nilVisit;
            } else if (isDeclr(node)) {
                var varName = node.name.value;
                var val = "";

                if (node.init) {
                    console.log("Node.init == ", print(node.init));
                    val = getStaticStr(node.init, vars);
                }
                vars[varName] = val;
                console.log("declared ", varName, " value = '", val, "'");
                return nilVisit;
            }

            stack.push(node);

            console.log(
                _.repeat("  ", stack.length),
                "=> ",
                nodeDescr(node),
                "(" + lbl + ")"
            );
        }
        return visitNode;
    };

    Walk(visitNode, ast);

    return {};
}
