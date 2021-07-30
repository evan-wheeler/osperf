const _ = require("lodash"),
    cmp = require("./compare");

const {
    StaticEmptyStr,
    StaticConcat,
    StaticDTreeTbl,
    StaticLiteral,
    StaticSubstr
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

var strFormat = {
    arity: "binary",
    callee: {
        arity: "binary",
        object: {
            id: "str"
        },
        property: {
            value: "Format",
            arity: "literal"
        },
        type: "MemberExpression"
    },
    type: "CallExpression"
};

var strFormatSubquery = {
    arity: "binary",
    callee: {
        arity: "binary",
        property: {
            value: "_Subquery",
            arity: "literal"
        },
        type: "MemberExpression"
    },
    type: "CallExpression"
};

const getStrFormat = (node, vars) => {
    let staticArgs = [];

    // if it's Str.Format...
    for (let a of node.arguments) {
        const argVal = getStaticStr(a, vars);
        if (argVal !== null) {
            staticArgs.push(argVal);
        } else {
            // try one more strategy -- if the query is something like:
            // where dataID in (%1)
            // or
            // where integerVal = %2 and otherVal=%3
            // Then we might be able to replace the value with dummy value and
            // still correctly parse and replace the rest of the query... try it.

            const argIndex = staticArgs.length;

            if (argIndex >= 1) {
                const re = new RegExp(
                    "(?:(in|abs)\\s*\\(\\s*%" +
                        argIndex +
                        "\\s*\\))" +
                        "|" +
                        "(?:(?:=|<>|!=|>|<|>=|<=|like)\\s*%" +
                        argIndex +
                        ")",
                    "i"
                );
                const fmtStr = staticArgs[0].value;

                if (fmtStr.search(re) >= 0) {
                    staticArgs.push(new StaticEmptyStr("null"));
                    // console.log("  Trying null in %" + argIndex);
                    continue;
                }
            }
            return null;
        }
    }

    if (staticArgs.length === 1) {
        // when no arguments, str.format format string is treated literally.
        return staticArgs[0];
    }

    if (staticArgs.length === 0) {
        return null;
    }

    // compose the str.format as if it's a series of concatenations...
    // "asdf %1 fdsa %2" => "asdf " + arg[1] + " fdsa " + arg[0]

    let staticFmtStr = staticArgs[0];
    let formatStr = staticFmtStr.value;
    let nextStart = 0,
        pos,
        gPos = node.arguments[0].range[0] + 1;
    let parts = [];

    const staticSpans = staticFmtStr.asSpans();

    while ((pos = formatStr.indexOf("%", nextStart)) >= 0) {
        const nextCh = formatStr.charAt(pos + 1);
        const vIdx = "%123456789".indexOf(nextCh);

        if (vIdx === -1) {
            parts.push(new StaticSubstr(staticSpans, nextStart, pos + 1));
            nextStart = pos + 1;
        } else if (vIdx === 0) {
            // %%... -- converted to a single %.
            parts.push(new StaticSubstr(staticSpans, nextStart, pos + 1));
            nextStart = pos + 2;
        } else {
            parts.push(new StaticSubstr(staticSpans, nextStart, pos));

            if (vIdx >= staticArgs.length) {
                throw error(
                    "Str.Format out of range on indexed replacement: " + vIdx
                );
            }

            parts.push(staticArgs[vIdx]);
            nextStart = pos + 2;
        }
    }

    if (nextStart < formatStr.length) {
        parts.push(new StaticSubstr(staticSpans, nextStart, formatStr.length));
    }

    if (parts.length === 1) {
        return parts[0];
    }

    const [first, ...rest] = parts;

    return rest.reduce((last, cur) => {
        return new StaticConcat(last, cur);
    }, first);
};

const isStatic = n => n && n.asSpans && n.replace && n.plus;

const getStaticStr = function(node, vars) {
    if (isStatic(node)) {
        return node;
    }

    if (node === "") {
        return new StaticEmptyStr();
    }

    if (_.isArray(node) && node.length === 1) {
        return getStaticStr(node[0], vars);
    }

    // If literal, just return value.
    if (node.arity === "literal") {
        if (typeof node.value === "string") {
            return new StaticLiteral(node);
        }
    }

    if (node.arity === "name") {
        let varName =
            typeof node.value === "string" ? node.value.toLowerCase() : "";

        const variable = vars[varName];
        if (variable) {
            if (typeof variable.value === "string") {
                return variable;
            }
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

        if (_.isString(left.value) && _.isString(right.value)) {
            return new StaticConcat(left, right);
        }
    }

    if (cmp(node, strFormat) || cmp(node, strFormatSubquery)) {
        return getStrFormat(node, vars);
    }
    return null;
};

function getStaticList(node, vars) {
    if (_.isArray(node) && node.length === 1) {
        return getStaticList(node[0], vars);
    }

    if (node.type === "ListExpression" && node.elements) {
        let elems = [];
        for (let e of node.elements) {
            let staticVal = getStaticStr(e, vars);

            if (staticVal === null) {
                // not all static...
                return null;
            }

            elems.push(staticVal);
        }
        return elems;
    }

    return null;
}

module.exports = { getStaticStr, getStaticList };
