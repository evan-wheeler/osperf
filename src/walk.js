let _ = require("lodash");

let oscript = {
    FunctionDeclaration: ["params", "body"],
    VariableDeclaration: ["declarations"],
    VariableDeclarator: ["init"],
    UnaryExpression: ["argument"],
    LogicalExpression: ["left", "right"],
    ThisExpression: [],
    ConditionalExpression: ["test", "consequent", "alternate"],
    MemberExpression: ["object", "property"],
    RangeExpression: ["object", "fromIndex", "toIndex"],
    IndexExpression: ["index"],
    CallExpression: ["callee", "arguments"],
    ListExpression: ["elements"],
    BinaryExpression: ["left", "right"],
    AssignmentExpression: ["left", "right"],
    IfStatement: ["test", "consequent", "alternate"],
    ElseifStatement: ["test", "consequent", "alternate"],
    ReturnStatement: ["argument"],
    BreakStatement: [],
    BreakIfStatement: ["argument"],
    ContinueStatement: [],
    ContinueIfStatement: ["argument"],
    WhileStatement: ["test", "body"],
    RepeatStatement: ["test", "body"],
    ForCStyleStatement: ["first", "second", "third", "body"],
    ForStatement: ["first", "second", "third", "body"],
    ForInStatement: ["first", "body"],
    SwitchStatement: ["discriminant", "cases"],
    SwitchCase: ["test", "consequent"],
    RelationalExpression: ["left", "right"],
    GotoStatement: [],
    ExpressionStatement: ["expression"]
};

function getNodeChildren(n) {
    return (n && n.type ? oscript[n.type] : []) || [];
}

/**
 * Normalize a node that may be an (empty?) array of statements,
 * a single item, or a null value.
 * Return a non-empty array, or null.
 * @param {Array|Object} variant
 */
function nodeToList(n) {
    if (_.isArray(n)) {
        return n;
    }
    return [n];
}

/**
 * Walks an AST.
 * @param visitorFn visitor function that receives a non-null node, followed by a null node when children have been processed.  Optionally returns a new visitor function.
 * @param node node on entry, null on exit.
 */
function Walk(visitorFn, node, label, nodeChildrenFn) {
    nodeChildrenFn = nodeChildrenFn || getNodeChildren;

    var nodes = nodeToList(node);

    // block may contain one or more nodes...
    for (let n of nodes) {
        if (!_.isNil(n)) {
            // visit; allow visitor function to return a new visitorFn.
            var v = visitorFn(n, label);

            if (v === false) {
                return false;
            }

            if (v) {
                // walk all child nodes.
                nodeChildrenFn(n).forEach(prop => {
                    let childNode = n[prop];

                    if (typeof childNode !== "undefined") {
                        Walk(v, childNode, prop, nodeChildrenFn);
                    }
                });

                // call with null to signal end of node's children.
                v(null, label);
            }
        }
    }
}

module.exports = Walk;
