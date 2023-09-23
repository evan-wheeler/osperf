const { flatMap } = require("lodash");

var EditList = require("./../edits"),
  _ = require("lodash"),
  cmp = require("../compare"),
  Walker = require("bannockburn").Walker;

function stringifyJSON(node) {
  var seen = [];

  return JSON.stringify(
    node,
    function (key, val) {
      if (["loc", "range", "std", "lbp", "scope", "led"].indexOf(key) >= 0) {
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
    decl: false,
  },
  type: "UnaryExpression",
  operator: "$",
  prefix: true,
};

var singleVar = {
  arity: "name",
  decl: true,
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
      arity: "literal",
    },
    type: "MemberExpression",
  },
  property: {
    value: "fConnection",
    arity: "literal",
  },
  type: "MemberExpression",
};

var anyDbConnect = {
  object: {
    arity: "name",
  },
  property: {
    value: "fConnection",
    arity: "literal",
  },
  type: "MemberExpression",
};

var capiExec = {
  callee: [
    {
      object: {
        value: "CAPI",
        arity: "name",
      },
      type: "MemberExpression",
      property: {
        value: "Exec",
        arity: "literal",
      },
    },
  ],
};

var capiWrapper = {
  arity: "binary",
  callee: [
    {
      object: {},
      property: {
        value: "CAPIWrapper",
        arity: "literal",
      },
      type: "MemberExpression",
    },
  ],
  type: "CallExpression",
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
        arity: "literal",
      },
      type: "MemberExpression",
    },
  ],
  type: "CallExpression",
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
      arg.property &&
      (arg.property.id === "(name)" ||
        arg.property.id === "(literal)" ||
        arg.property.arity === "literal")
    );
  }
  return false;
}

const asURL = (f) => {
  return `${f}`;
};

// return true if any of the annotations in the list are set
const hasAnnotationsAny = (node, tagList) => {
  if (node && node.annotation) {
    // accomodate the annotation's weird initial design (tag+value).
    const fullTag = node.annotation.tag + node.annotation.value;
    const tags = fullTag.replace(/ /g, "").split(",");
    return tags.findIndex((t) => tagList.findIndex((v) => v === t) >= 0) >= 0;
  }
};

const NoCheck = (node) => {
  return hasAnnotationsAny(node, ["dbnocheck", "nodbcheck"]);
};

module.exports = function instrument(code, parseTree, file) {
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

  let dbRegex = /\b(IsOracle|IsMSSQL)\b/;

  // walk the parse tree and add code at the beginning of each function definition, before
  // each return function, and at the end of each function body.

  if (dbRegex.exec(code) === null) {
    return null;
  }

  // walk the top level looking for functions...
  var editList = new EditList(code);

  var w = new Walker();
  var curFunction, lastFn;

  w.on("FunctionDeclaration", function (node) {
    if (NoCheck(node)) {
      // statusMsg("  Skipping function due to NoDBCheck");
      return false;
    }

    curFunction = node.name;
    lastFn = node;
  });

  let nodeCode = (node) => code.substring(node.range[0], node.range[1] + 1);

  let conditionDepth = 0;
  let pushConditionDepth = () => conditionDepth++;
  let popConditionDepth = () => conditionDepth++;

  w.on("before:IfStatement.test", pushConditionDepth);
  w.on("before:ConditionalExpression.test", pushConditionDepth);
  w.on("before:ElseifStatement.test", pushConditionDepth);
  w.on("after:IfStatement.test", popConditionDepth);
  w.on("after:ElseifStatement.test", popConditionDepth);
  w.on("after:ConditionalExpression.test", popConditionDepth);

  // statusMsg("Checking for db expressions");

  w.on("CallExpression", function (node) {
    let ncode = nodeCode(node);

    if (dbRegex.test(ncode)) {
      // check if calling IsOracle, IsMSSQL, etc.
      if (conditionDepth > 0) {
        // console.log(`Call expression: ${ncode}`);
      } else {
        statusMsg(`Not in conditional: ${ncode}`);
      }
    }
  });

  w.on("IfStatement.test", function (node) {
    if (NoCheck(node)) {
      // statusMsg("  Skipping function due to NoDBCheck");
      return false;
    }

    let testCode = nodeCode(node.test[0]);

    if (dbRegex.test(testCode)) {
      let ncode = nodeCode(node);
      statusMsg(`We found it! ${ncode}`);
      return false;
    }
  });

  w.on("ConditionalExpression.test", function (node) {
    if (NoCheck(node)) {
      // statusMsg("  Skipping function due to NoDBCheck");
      return false;
    }

    let testCode = nodeCode(node.test[0]);

    if (dbRegex.test(testCode)) {
      let ncode = nodeCode(node);
      statusMsg(`We found it! ${ncode}`);
      return false;
    }
  });

  w.on("RelationalExpression", (node) => {
    const code = nodeCode(node);
    if (/ORACLE/.test(code)) {
      statusMsg(`ORACONST: ${code}`);
      return false;
    }
  });

  /*w.on("MemberExpression", function (node) {
    // check if calling IsOracle, IsMSSQL, etc.
    // console.log(`Member expression: ${nodeCode(node)}`);
  });*/

  w.start(parseTree);

  var rtn = null;

  /*  if (editList.edits.length > 0) {
    rtn = editList.apply();
  }
*/
  // return the instrumented code.
  return rtn;
};
