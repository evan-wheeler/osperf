var Module = require("../module"),
  IDGenerator = require("../idgen"),
  Q = require("q"),
  fs = require("fs"),
  async = require("async"),
  instrument = require("../instrument/coverage"),
  _ = require("lodash"),
  parseUtils = require("../parseutils");

/**
 * Adds coverage instrumentation to modules.
 * @param modules - Names of the modules to add coverage.
 * @param options - requires base and optional output.
 */
function cover(modules, options) {
  "use strict";

  if (!_.isArray(modules)) {
    modules = [modules];
  }

  var gen = new IDGenerator({
      chars: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ;:=?@!~#$%&-_"
    }),
    modObjs = modules.map(function(modName) {
      return new Module(modName, options.base);
    });

  var params = {
    idGenerator: gen,
    sourceStore: {},
    timings: options.timings
  };

  return parseUtils
    .listScriptsInModules(modObjs, false)
    .then(function(allFiles) {
      return processFiles(allFiles, params);
    })
    .then(function(results) {
      var output = genCoverageData(
        results.blocks,
        results.functions,
        gen.getIDs(),
        params.sourceStore
      );
      fs.writeFileSync(options.output, JSON.stringify(output), "utf8");

      // add headers
      modObjs.forEach(function(m) {
        addHeader(m.getStartupScripts());
      });
    })
    .catch(function(e) {
      console.error("There was a problem: ", e);
    });
}

function addHeader(startupFiles) {
  var code =
    "/* Begin coverage setup */\r\n" +
    "if IsUndefined( $_C )\r\n" +
    "   Script __v = Compiler.Compile( 'Function V(Assoc visited,Integer adj=undefined);if isDefined(adj);.depth+=adj;end;String k;for k in Assoc.keys(visited);.fBlocks.(k)+=visited.(k);end;if .depth<=0||Length(.fBlocks)>500;File.Write(.fOutput,\"v=\"+Str.ValueToString(.fBlocks));.fBlocks=Assoc.CreateAssoc(0);if .depth<0;depth=0;end;end;End')\r\n" +
    "   Script __t = Compiler.Compile( 'Function V(String blockID,Integer start,Integer stop);Real diff=(start<=stop?stop-start:2147483647-start+stop)*.001;.fTimings.(blockID)+=diff;if .depth<=2||Length(.fTimings)>50;File.Write(.fOutput,\"t=\"+Str.ValueToString(.fTimings));.fTimings=Assoc.CreateAssoc(0);end;End')\r\n" +
    "   String __lp = $Kernel.SystemPreferences.GetPrefGeneral( 'Logpath' )\r\n" +
    "   String __logf=Str.Format( '%1coverage_%2.out',( __lp[1] == '.' && __lp[2] in {'/', '\\'}?$Kernel.ModuleUtils._OTHome()+__lp[3:]:__lp),System.ThreadIndex())\r\n" +
    "   File __tf = File.Open( __logf, File.WriteMode )\r\n" +
    "   if IsError( __tf )\r\n" +
    "       Echo( 'Coverage could not open ', __logf, ' for writing: ', __tf )\r\n" +
    "   end\r\n" +
    "   Assoc blocks = Assoc.CreateAssoc(0), timings = Assoc.CreateAssoc()\r\n" +
    "   $_C = Frame.New( {}, { { 'depth', 0 }, { 'fOutput', __tf }, { 'V', __v }, { 'T', __t }, { 'fBlocks', blocks }, { 'fTimings', timings } } )\r\n" +
    "end\r\n " +
    "/* End coverage setup */\r\n";

  startupFiles.forEach(function(f) {
    var content = fs.readFileSync(f, "utf8"),
      startStr = "/* Begin coverage setup */";

    if (content.indexOf(startStr) === -1) {
      fs.writeFileSync(f, code + content, "utf8");
    }
  });
}

function genCoverageData(
  blocks,
  function_blocks,
  id_locations,
  originalSource
) {
  "use strict";

  /**
     * Lots of redundant data -- combine into a better format.
     *  blocks an array of objects
     *      Each object has string id, and ranges
     *          Ranges is an array of arrays, where each sub-array is of length 2, start and end.
     *  function_blocks are an array of ids
     *  id_locations is a map of id to { script: "", func: "" } objects.
    */

  var locGen = new IDGenerator(),
    uniqueLocs = {},
    blockMap = {},
    byLocID = {};

  blocks.forEach(function(b) {
    var blockLoc = id_locations[b.id],
      locKey = blockLoc.script + ":" + blockLoc.func,
      uLoc = uniqueLocs[locKey];

    if (!uLoc) {
      uLoc = locGen.newID();
      uniqueLocs[locKey] = uLoc;
      byLocID[uLoc] = [blockLoc.script, blockLoc.func, []];
    }

    blockMap[b.id] = { lines: b.lines, loc: uLoc };
    byLocID[uLoc][2].push(b.id);
  });

  function_blocks.forEach(function(bID) {
    blockMap[bID].f = true;
  });

  return {
    blocks: blockMap,
    locations: byLocID,
    source: originalSource
  };
}

/**
 * Process all the source files.
 * @param srcFiles
 * @param idGenerator
 * @returns {!Promise.<RESULT>|*}
 */
function processFiles(srcFiles, params) {
  "use strict";
  return Q.nfcall(
    async.mapLimit,
    srcFiles,
    4,
    processEach.bind(null, params)
  ).then(combine);
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
      // save the original source code.
      params.sourceStore[file] = parseResult.src;

      // adapt our block ID generator for this file.
      var blockIDGen = function(blockInfo) {
        return params.idGenerator.newID({
          script: file,
          func: blockInfo.func
        });
      };

      // instrument the code.
      var result = instrument(
        parseResult.src,
        parseResult.ast,
        blockIDGen,
        params
      );

      // write the modified code back to the original file.
      fs.writeFileSync(file, result.result, "utf8");

      // just return the block & function data.
      done(null, {
        blocks: result.blocks,
        functions: result.functions
      });
    })
    .catch(function(e) {
      // don't kill the whole process.
      console.error("Problem instrumenting file. ", e, " in file: ", file);
      done(null, { blocks: [], functions: [] });
    })
    .done();
}

/**
 * Combines the results of all the instrumenting
 * @param results
 * @returns {Object|*|Mixed}
 */
function combine(results) {
  // merge the block and function data to return.
  return results.reduce(
    function(last, cur) {
      return {
        blocks: last.blocks.concat(cur.blocks),
        functions: last.functions.concat(cur.functions)
      };
    },
    {
      blocks: [],
      functions: []
    }
  );
}

module.exports = cover;
