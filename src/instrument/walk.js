var _ = require("lodash");

var ASTParts = {
    FunctionDeclaration: ["params", "body"],
    VariableDeclaration: ["declarations"],
    VariableDeclarator: ["init"],
    UnaryExpression: ["argument"],
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
    GotoStatement: [],
    ExpressionStatement: ["expression"]
};

var SYNTAX = {};

_.forOwn(ASTParts, function(v, k) {
    SYNTAX[k] = { children: v, name: k };
});

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
function Walk(visitorFn, node, label) {
    var nodes = nodeToList(node);

    // block may contain one or more nodes...
    _.forEach(nodes, function(n) {
        if (_.isNil(n)) {
            // skip empty.
            return;
        }

        // visit; allow visitor function to return a new visitorFn.
        var v = visitorFn(n, label);
        if (!_.isFunction(v)) {
            // skip
            return;
        }

        var syntax = SYNTAX[n.type];
        if (syntax) {
            // walk all child nodes.
            _.forEach(syntax.children, function(prop) {
                var childNode = n[prop];

                if (!_.isNil(childNode)) {
                    Walk(v, childNode, prop);
                }
            });
        }

        // call with null to signal end of node's children.
        v(null, label);
    });
}

module.exports = Walk;
