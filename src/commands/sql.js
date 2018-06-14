var Module = require("../module"),
  Q = require("q"),
  fs = require("fs"),
  async = require("async"),
  instrument = require("../instrument/sql"),
  _ = require("lodash"),
  parseUtils = require("../parseutils");

/**
 * Finds capi.Exec and replaces with .ExecSQL.
 * @param modules - Names of the modules to add coverage.
 * @param options - requires base and optional output.
 */
function replace(modules, options) {
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
    .catch(function(e) {
      console.error("There was a problem: ", e);
    });
}

/**
 * Process all the source files.
 * @param srcFiles
 * @param idGenerator
 * @returns {!Promise.<RESULT>|*}
 */
function processFiles(srcFiles, params) {
  "use strict";
  return Q.nfcall(async.mapLimit, srcFiles, 4, processEach.bind(null, params));
}

/**
 * Process parse/instrument each file
 * @param file
 * @param done
 */
function processEach(params, file, done) {
  console.log("Parsing file: ", file);
  parseUtils
    .parseFile(file)
    .then(function(parseResult) {
      // instrument the code.
      var result = instrument(parseResult.src, parseResult.ast, file);

      // write the modified code back to the original file.
      if (result != null) {
        fs.writeFileSync(file, result, "utf8");
      }

      // just return the block & function data.
      done(null);
    })
    .catch(function(e) {
      // don't kill the whole process.
      console.error("Problem instrumenting file. ", e, " in file: ", file);
      done(null);
    })
    .done();
}

module.exports = replace;
