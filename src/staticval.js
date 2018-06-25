const _ = require("lodash"),
    cmp = require("./compare");

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

const staticPlus = (left, right) => {
    return {
        type: "+",
        left,
        right,
        value: left.value + right.value
    };
};

const getStaticStr = function(node, vars) {
    if (_.isArray(node) && node.length === 1) {
        return getStaticStr(node[0], vars);
    }

    // If literal string, just return value.
    if (node.arity === "literal" && typeof node.value === "string") {
        return { type: "literal", value: node.value, pos: node.range };
    }

    if (node.arity === "name") {
        let varName =
            typeof node.value === "string" ? node.value.toLowerCase() : "";
        if (typeof vars[varName] === "string") {
            return vars[varName];
        }
    }

    // if $DT_TABLE, return [DTree];
    if (cmp(node, dtTable)) {
        // We don't use this format, but it's valid SQL to parse, so this
        // will be our hint that we need to replace it with $DT_TABLE
        return { type: "special", value: "[DTree]", pos: node.range };
    }

    // If static_str + static_str then return result of concatenation.
    if (node.type === "BinaryExpression" && node.operator === "+") {
        var left = getStaticStr(node.left, vars);
        var right = getStaticStr(node.right, vars);

        if (left === null || right === null) {
            return null;
        }

        return staticPlus(left, right);
    }

    return null;
};

module.exports = getStaticStr;
