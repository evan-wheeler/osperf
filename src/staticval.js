const _ = require("lodash"),
    cmp = require("./compare");

const {
    StaticEmptyStr,
    StaticConcat,
    StaticDTreeTbl,
    StaticLiteral
} = require("./statics");

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

const getStaticStr = function(node, vars) {
    if (node === "") {
        return new StaticEmptyStr();
    }

    if (_.isArray(node) && node.length === 1) {
        return getStaticStr(node[0], vars);
    }

    // If literal string, just return value.
    if (node.arity === "literal" && typeof node.value === "string") {
        return new StaticLiteral(node);
    }

    if (node.arity === "name") {
        let varName =
            typeof node.value === "string" ? node.value.toLowerCase() : "";

        const variable = vars[varName];
        if (variable && typeof variable.value === "string") {
            return variable;
        }
        return null;
    }

    // if $DT_TABLE, return [DTree];
    if (cmp(node, dtTable)) {
        // We don't use this format, but it's valid SQL to parse, so this
        // will be our hint that we need to replace it with $DT_TABLE
        return new StaticDTreeTbl();
    }

    // If static_str + static_str then return result of concatenation.
    if (node.type === "BinaryExpression" && node.operator === "+") {
        var left = getStaticStr(node.left, vars);
        var right = getStaticStr(node.right, vars);

        if (left === null || right === null) {
            return null;
        }

        return new StaticConcat(left, right);
    }

    return null;
};

module.exports = getStaticStr;
