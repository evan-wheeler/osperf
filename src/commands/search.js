var Module = require("../module"),
  Q = require("q"),
  fs = require("fs"),
  async = require("async"),
  _ = require("lodash"),
  walk = require("../walk"),
  parseUtils = require("../parseutils");

function search(modules, options) {
  "use strict";

  if (!_.isArray(modules)) {
    modules = [modules];
  }

  var modObjs = modules.map(function (modName) {
    return new Module(modName, options.base);
  });

  var params = {};

  return parseUtils
    .listScriptsInModules(modObjs)
    .then(function (allFiles) {
      return processFiles(allFiles, params);
    })
    .catch(function (e) {
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

const queryRe = /(IsOracle|IsMSSQL)\(/gi;

function searchFn(n) {}

function processEach(params, file, done) {
  // console.log( "Reading file: ", file );

  parseUtils
    .parseFile(file)
    .then(function (parseResult) {
      // save the original source code.
      var src = parseResult.src;
      var ast = parseResult.ast;

      parseUtils.addSource(ast, src);

      walk(searchFn, ast);

      if (src.search(queryRe) < 0) {
        done(null, { result: [] });
        return;
      } else {
        console.log("Found a result: ", file);
        console.log("    ");

        // just return the block & function data.
        done(null, { result: [] });
        return;
      }
    })
    .catch(function (e) {
      // don't kill the whole process.
      console.error("Problem instrumenting file. ", e, " in file: ", file);
      done(null, {});
    })
    .done();
}

const addStats = (stats, cur) => {
  for (let name of Object.keys(cur)) {
    if (!stats[name]) {
      stats[name] = cur[name];
    } else {
      stats[name] += cur[name];
    }
  }
};

function combine(results) {
  let stats = {};

  for (let r of results) {
    if (r && r.stats) {
      addStats(stats, r.stats);
    }
  }

  Object.keys(stats).forEach((s) =>
    console.log(`${_.padEnd(s, 20, " ")} = ${stats[s]}`)
  );

  return [];
}

module.exports = search;
