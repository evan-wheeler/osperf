var Module = require("../module"),
  Q = require("q"),
  fs = require("fs"),
  async = require("async"),
  _ = require("lodash"),
  parseUtils = require("../parseutils"),
  Bannockburn = require("bannockburn"),
  path = require("path"),
  cmp = require("../compare"),
  EditList = require("../edits");

var nameToTbl = _.keyBy(tableNames, function(v) {
  return v.toLowerCase();
});

var tblMap = _.keyBy(tableNames, function(v) {
  return v;
});

function vet(modules, options) {
  "use strict";

  if (!_.isArray(modules)) {
    modules = [modules];
  }

  var modObjs = modules.map(function(modName) {
    return new Module(modName, options.base);
  });

  var params = {};

  return parseUtils
    .listScriptsInModules(modObjs)
    .then(function(allFiles) {
      return processFiles(allFiles, params);
    })
    .then(function(results) {
      /*
            var output = genCoverageData( results.blocks, results.functions, gen.getIDs(), params.sourceStore );
            fs.writeFileSync( options.output, JSON.stringify( output ), 'utf8' );

            // add headers
            modObjs.forEach( function( m ) {
                addHeader( m.getStartupScripts() );
            } );
            */
    })
    .catch(function(e) {
      console.error("There was a problem: ", e);
    });
}

function processFiles(srcFiles, params) {
  "use strict";
  return Q.nfcall(
    async.mapLimit,
    srcFiles,
    4,
    processEach.bind(null, params)
  ).then(combine);
}

function processEach(params, file, done) {
  // console.log( "Reading file: ", file );

  parseUtils
    .parseFile(file)
    .then(function(parseResult) {
      // save the original source code.
      var src = parseResult.src;

      var parser = Bannockburn.Parser(),
        ast = parser.parse(src),
        astNode = parseUtils.getASTNode;

      var w = new Bannockburn.Walker();

      var curScript = path.basename(file).replace(/\.Script$/, "");
      var curFunction = "";

      var editList = new EditList(src);

      w.on("FunctionDeclaration", function(node) {
        curFunction = node.name;
      });

      w.on("VariableDeclaration", function(node) {
        if (
          cmp(node, {
            type: "VariableDeclaration",
            declarations: [
              {
                type: "VariableDeclarator",
                name: { id: "(name)" },
                init: {
                  type: "CallExpression",
                  callee: {
                    type: "MemberExpression",
                    property: {
                      id: "(name)",
                      value: "InitErrObj"
                    }
                  }
                },
                dataType: { id: "assoc" }
              }
            ]
          })
        ) {
          // console.log( curScript + "." + curFunction, ":", src.substring( node.range[0], node.range[1]+1 ) );
        }
      });

      w.on("after:VariableDeclarator.init", function(node) {
        var init = _.first(node.init);
        // console.log("Init: ", init);

        if (init && init.constVal) {
          console.log("Found variable set to ", init.constVal);
        }
      });

      w.on("before:BinaryExpression.right", function(node) {
        if (node.operator === "+") {
          var left = _.first(node.left),
            right = _.first(node.right);
          var leftConst = null,
            rightConst = null;

          if (left.arity === "literal" && _.isString(left.value)) {
            leftConst = left.value;
          } else if (left.constVal) {
            leftConst = left.constVal;
          }

          if (leftConst !== null) {
            if (right.arity === "literal" && _.isString(right.value)) {
              node.constVal = leftConst + right.value;
            } else if (right.constVal) {
              node.constVal = leftConst + right.constVal;
            }
          }

          if (node.constVal) {
            console.log("Found constant value: ", node.constVal);
          }
        }
      });

      /* w.on("*", function(node) {
        if (node.arity === "literal" && _.isString(node.value)) {
          var result = /((?:^insert\s+into)|(?:^update)|(?:^delete(?:\s+from)?))\s+(\w+)/i.exec(
            node.value
          );

          if (result) {
            var lowerTbl = result[2].toLowerCase();
            if (nameToTbl.hasOwnProperty(lowerTbl)) {
              if (!tblMap.hasOwnProperty(result[2])) {
                console.log(
                  result[2],
                  " is the wrong case. It should be ",
                  nameToTbl[lowerTbl],
                  " " + file + ":" + curScript + "." + curFunction
                );
              } else {
                //console.log(
                //  "We saw ",
                //  result[2],
                //  " and it looks good!",
                //  " " + file + ":" + curScript + "." + curFunction
                // );
              }
            } else {
              console.log(
                "We saw ",
                result[0],
                " " + file + ":" + curScript + "." + curFunction
              );
            }
          }
        }
      });
      */

      /*w.on("CallExpression", function(node) {
        if (
          cmp(node, {
            callee: [
              {
                type: "MemberExpression",
                property: {}
              }
            ]
          })
        ) {
          if (
            _.indexOf(
              ["execsql", "_execsql", "capiexec", "exec"],
              node.callee[0].property.value.toLowerCase()
            ) >= 0
          ) {
            console.log(
              file + ":" + curScript + "." + curFunction,
              ":",
              src.substring(node.range[0], node.range[1] + 1)
            );
          }
        }

        // if( node.callee )
        //     console.log( node.)
      });*/

      w.start(ast);

      // instrument the code.
      // var result = instrument( parseResult.src, parseResult.ast, blockIDGen, params );

      // write the modified code back to the original file.
      // fs.writeFileSync( file, result.result, 'utf8' );

      // just return the block & function data.
      done(null, { result: [] });
    })
    .catch(function(e) {
      // don't kill the whole process.
      console.error("Problem instrumenting file. ", e, " in file: ", file);
      done(null, { results: [] });
    })
    .done();
}

function combine(results) {
  return results.reduce(
    function(last, cur) {
      return {
        results: last.results.concat(cur.results)
      };
    },
    {
      results: []
    }
  );
}

module.exports = search;
