var Bannockburn = require("bannockburn"),
  _ = require("lodash");

var Pretty = (window.Pretty = function(codeEl) {
  this.codeEl = $(codeEl);
  this.code = this.codeEl.text();
  this.parser = Bannockburn.Parser();

  try {
    this.ast = this.parser.parse(this.code);
    this.format();
  } catch (e) {
    console.log(e.message);
    this.ast = [];
  }
});

Pretty.prototype.getAllTokens = function() {
  var tokens = this.parser.getTokens(),
    ws = this.parser.getWhitespace();

  var allTokens = tokens.concat(ws);

  allTokens.sort(function(a, b) {
    return a.range[0] - b.range[0];
  });

  return allTokens;
};

function makeLine(content) {
  return (
    '<div class="ace_line"><span class="ace_gutter ace_gutter-cell" unselectable="on"></span>' +
    content +
    "</div>"
  );
}

function getASTNode(v) {
  if (v) {
    if (_.isArray(v)) {
      return v[0];
    } else {
      return v;
    }
  }
  return null;
}

function LineFormatter() {
  this.raw = "";
  this.formatted = "";
}

LineFormatter.prototype.expandTabs = function(val, offset) {
  offset = offset || 0;
  return val
    .split("\t")
    .map(function(v, i, a) {
      var t =
        v +
        (i + 1 >= a.length
          ? ""
          : ["    ", "   ", "  ", " "][(offset + v.length) % 4]);
      offset = 0;
      return t;
    })
    .join("");
};

LineFormatter.prototype.add = function(val, elType, classNames, attrs) {
  var expanded = this.expandTabs(val, this.raw.length),
    replaced = expanded.replace(/ /g, "&nbsp;");

  this.raw += expanded;

  if (arguments.length > 1) {
    this.formatted += [
      "<",
      elType,
      " class='",
      classNames || "",
      "' ",
      attrs || "",
      ">",
      replaced,
      "</",
      elType,
      ">"
    ].join("");
  } else {
    this.formatted += replaced;
  }
};

LineFormatter.prototype.getFormatted = function() {
  return this.formatted;
};

LineFormatter.prototype.reset = function() {
  this.raw = "";
  this.formatted = "";
};

LineFormatter.prototype.empty = function() {
  return this.raw === "";
};

Pretty.prototype.format = function() {
  var allTokens = this.getAllTokens();
  var i = 0,
    len = allTokens.length;

  function setTokenProp(node, property, value, overwrite) {
    var found = false;
    for (var j = i; j < len; j++) {
      var tok = allTokens[j];
      if (
        tok.range[0] === node.range[0] &&
        tok.range[1] === node.range[1] &&
        node.value == tok.value
      ) {
        if (!tok[property] || overwrite) {
          tok[property] = value;
        }

        found = true;
        break;
      }
    }

    if (!found) {
      console.log("Token was not found for node: ", node);
    }
  }

  var keywords = [
    "and",
    "or",
    "not",
    "eq",
    "lt",
    "gt",
    "if",
    "elseif",
    "else",
    "for",
    "switch",
    "repeat",
    "while",
    "end",
    "function",
    "until",
    "in",
    "to",
    "downto",
    "default",
    "case",
    "return",
    "break",
    "breakif",
    "continueif",
    "continue"
  ];

  var walker = new Bannockburn.Walker();

  walker
    .on("CallExpression", function(node) {
      if (node.callee) {
        var callee = getASTNode(node.callee);

        if (callee.type === "MemberExpression") {
          var memberExpr = callee,
            obj = getASTNode(memberExpr.object),
            prop = getASTNode(memberExpr.property);

          if (!obj || obj.type === "ThisExpression") {
            if (prop.id === "(name)") {
              setTokenProp(
                prop,
                "extra",
                { type: "MemberCall", callType: "this" },
                true
              );
            }
          } else if (!memberExpr.computed) {
            setTokenProp(
              prop,
              "extra",
              { type: "MemberCall", callType: "normal" },
              true
            );
          }
        } else if (callee.id === "(name)") {
          setTokenProp(callee, "extra", { type: "FunctionCall" }, true);
        }
      }
    })
    .on("FunctionDeclaration", function(node) {
      var rtnType = getASTNode(node.dataType);
      if (rtnType) {
        setTokenProp(rtnType, "extra", { type: "VariableType" }, false);
      }
      if (node.params) {
        node.params.forEach(function(p) {
          if (p.dataType) {
            setTokenProp(
              getASTNode(p.dataType),
              "extra",
              { type: "VariableType" },
              false
            );
          }
        });
      }
      if (node.nameToken) {
        setTokenProp(
          node.nameToken,
          "extra",
          { type: "FunctionDeclaration" },
          false
        );
      }
    })
    .on("VariableDeclaration", function(node) {
      var declType = getASTNode(node.declType);
      setTokenProp(declType, "extra", { type: "VariableType" }, false);
    })
    .on("MemberExpression", function(node) {
      var obj = getASTNode(node.object),
        prop = getASTNode(node.property);

      if (!prop.computed) {
        setTokenProp(prop, "extra", { type: "PropertyName" }, false);
      }
    })
    .start(this.ast);

  var formatted = [
      "<div class='ace-chrome'><div class='ace_static_highlight' style='counter-reset:ace_line'>"
    ],
    curLine = new LineFormatter();

  var processCommentBlock = function(v, k, a) {
    if (k === 0) {
      // first line
      curLine.add(v);
      formatted.push(makeLine(curLine.getFormatted()));
      curLine.reset();
    } else if (k === a.length - 1) {
      // last line
      curLine.add(v);
    } else {
      // middle lines
      curLine.add(v);
      formatted.push(makeLine(curLine.getFormatted()));
      curLine.reset();
    }
  };

  for (i = 0; i < len; ++i) {
    var tok = allTokens[i];

    if (tok.type === "(nl)" && tok.value === "\n") {
      curLine.add(tok.value);
      formatted.push(makeLine(curLine.getFormatted()));
      curLine.reset();
    } else if (tok.type === "LineComment") {
      curLine.add(tok.value, "span", "ace_comment ace_line ace_asp");
    } else if (tok.type === "BlockComment") {
      if (tok.value.indexOf("\n") !== -1) {
        tok.value.split("\n").forEach(processCommentBlock);
      } else {
        curLine.add(tok.value, "span", "ace_comment ace_block ace_asp");
      }
    } else if (tok.type === "number") {
      curLine.add(tok.value, "span", "ace_constant ace_numeric ace_asp");
    } else if (tok.type === "string") {
      if (tok.double) {
        curLine.add(
          '"' + tok.value.replace(/"/g, '""') + '"',
          "span",
          "ace_quoted ace_string ace_double ace_asp"
        );
      } else {
        curLine.add(
          "'" + tok.value.replace(/'/g, "''") + "'",
          "span",
          "ace_quoted ace_string ace_single ace_asp"
        );
      }
    } else if (tok.type === "name") {
      if (tok.extra) {
        if (tok.extra.type === "FunctionDeclaration") {
          curLine.add(
            tok.value,
            "span",
            "ace_entity ace_name ace_function ace_asp"
          );
        } else if (tok.extra.type === "VariableType") {
          curLine.add(tok.value, "span", "ace_support ace_type");
        } else if (tok.extra.type === "MemberCall") {
          if (tok.extra.callType === "this") {
            curLine.add(
              tok.value,
              "span",
              "ace_entity ace_name ace_function ace_asp",
              "callType='this' name='" + tok.value + "'"
            );
          } else {
            curLine.add(
              tok.value,
              "span",
              "ace_entity ace_name ace_function ace_asp"
            );
          }
        } else if (tok.extra.type === "FunctionCall") {
          curLine.add(
            tok.value,
            "span",
            "ace_entity ace_name ace_function ace_asp",
            "callType='local' name='" + tok.value + "'"
          );
        } else if (tok.extra.type === "PropertyName") {
          curLine.add(
            tok.value,
            "span",
            "ace_entity ace_other ace_attribute-name"
          );
        }
      } else {
        if (_.indexOf(keywords, tok.value.toLowerCase()) !== -1) {
          curLine.add(tok.value, "span", "ace_keyword ace_control ace_asp");
        } else {
          curLine.add(tok.value, "span", "ace_entity ace_name ace_asp");
        }
      }
    } else {
      curLine.add(tok.value);
    }
  }

  if (!curLine.empty()) {
    formatted.push(makeLine(curLine.getFormatted()));
  }

  formatted.push("</div></div>");

  this.codeEl.html(formatted.join(""));
};
