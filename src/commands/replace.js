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

function replace(token, newToken, modules, options) {
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
      return processFiles(allFiles, token, newToken, params);
    })
    .then(function(results) {
      console.log("Done");

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

function processFiles(srcFiles, token, newToken, params) {
  "use strict";
  return Q.nfcall(
    async.mapLimit,
    srcFiles,
    4,
    processEach.bind(null, token, newToken, params)
  ).then(combine);
}

const keywords = [
  "superobj",
  "super",
  "final",
  "inherits",
  "interface",
  "none",
  "object",
  "override",
  "package",
  "private",
  "public",
  "undefined",
  "using",
  "and",
  "break",
  "breakif",
  "by",
  "case",
  "continue",
  "continueif",
  "default",
  "do",
  "downto",
  "else",
  "elseif",
  "end",
  "eq",
  "for",
  "function",
  "ge",
  "goto",
  "gt",
  "if",
  "in",
  "le",
  "lt",
  "ne",
  "nodebug",
  "not",
  "or",
  "repeat",
  "return",
  "switch",
  "then",
  "to",
  "until",
  "while"
];

function processEach(token, newToken, params, file, done) {
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
        // console.log(curScript + "." + curFunction);
      });

      w.on("*", function(node) {
        if (
          node.arity === "name" &&
          typeof node.value === "string" &&
          keywords.indexOf(node.value.toLowerCase()) >= 0
        ) {
          console.log(
            curScript + "." + curFunction,
            " - Variable name is now reserved: ",
            node.value,
            " arity: ",
            node.arity
          );
        } else if (
          typeof node.name === "object" &&
          node.name.arity === "name" &&
          keywords.indexOf(node.name.value.toLowerCase()) >= 0
        ) {
          console.log(
            curScript + "." + curFunction,
            " - Parameter name is now reserved: ",
            node.name.value,
            " arity: ",
            node.name.arity
          );
        }
      });

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

module.exports = replace;
