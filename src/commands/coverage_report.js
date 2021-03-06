var fs = require("fs"),
  Q = require("q"),
  es = require("event-stream"),
  _ = require("lodash"),
  path = require("path"),
  rimraf = require("rimraf"),
  ncp = require("ncp").ncp,
  async = require("async"),
  ejs = require("ejs"),
  glob = require("glob");

var includesPath = path.join(__dirname, "assets/includes"),
  dirTemplatePath = path.join(__dirname, "assets/creport_dir.html"),
  scriptTemplatePath = path.join(__dirname, "assets/creport_script.html");

var templates = {
  script: ejs.compile(fs.readFileSync(scriptTemplatePath, {encoding: 'utf-8'}), {
    filename: scriptTemplatePath
  }),
  directory: ejs.compile(fs.readFileSync(dirTemplatePath, {encoding: 'utf-8'}), {
    filename: dirTemplatePath
  })
};

/**
 * Makes a coverage report.
 * @param visitFiles - Input coverage files.
 * @param options
 */
function coverageReport(visitGlobs, options) {
  Q.all(
    visitGlobs.map(function(g) {
      return Q.nfcall(glob, g);
    })
  )
    .then(function(results) {
      var visitFiles = _.flatten(results);

      // merge the visit files and load the coverage file.
      return Q.spread(
        [mergeVisits(visitFiles), loadCoverageFile(options.coverage)],
        function(visits, coverInfo) {
          // We have all our data loaded -- generate the report.
          generateReport(options.output, visits, coverInfo);
        }
      );
    })
    .catch(function(e) {
      // some error in mergeVisits or loadCoverageFile.
      console.error("Error: ", e);
    })
    .done();
}

/**
 * Copies the include files to the report.
 * @param reportDir - Destination dir.
 * @returns {!Promise}
 */
function copyReportAssets(reportDir) {
  ncp.limit = 4;


  var d = Q.defer();

  var dest = path.isAbsolute( reportDir) ? reportDir : path.resolve( ".", reportDir );

  console.log( "Trying to copy -R from: ", includesPath, " to report directory: ", dest );

  ncp( includesPath, dest, function(err) { 
    if( err ) { 
      d.reject( err );
    } else { 
      d.resolve( true );
    } 
  } );

  return d.promise;
}

/**
 * Generates a coverage report
 * @param dir - Destination directory for report.
 * @param visits
 * @param coverInfo
 */
function generateReport(dir, visits, coverInfo) {
  createReportDir(dir)
    .then(function(reportDir) {
      var reportData = collectScriptData(visits, coverInfo);
      var scriptPaths = _.map(reportData, "path");
      var shellInfo = getTreeFromPaths(scriptPaths);
      var dirStats = buildDirStats(reportData, shellInfo);

      return buildReportShell(reportDir, shellInfo).then(function() {
        return writeReports(
          reportDir,
          shellInfo,
          reportData,
          dirStats,
          coverInfo
        );
      });
    })
    .done();
}

function writeReports(reportDir, shellInfo, reportData, dirStats, coverInfo) {
  // output reports for all the scripts -- 10 at a time..

  return Q.nfcall(async.mapLimit, reportData, 10, function(sData, cb) {
    var sourceCode = coverInfo.source[sData.originalPath];
    writeScriptHTML(reportDir, sData, sourceCode, dirStats, reportData).then(
      function() {
        cb();
      },
      function(err) {
        cb(err);
      }
    );
  }).then(function() {
      var dirNames = _.keys(dirStats);

      return Q.nfcall(async.mapLimit, dirNames, 10, function(dirName, cb) {
        var dirData = dirStats[dirName];
        writeDirHTML(reportDir, dirName, dirData, dirStats, reportData).then(
          function() {
            cb();
          },
          function(err) {
            cb(err);
          }
        );
      });
    })
    .then(function() {
      console.log( "Copying assets ...");
      return copyReportAssets(reportDir);
    }).then( function() { 
      console.log( "Done" );
    }).done();
}

function setOnAllLines(linesArray, format) {
  var lines = {};
  linesArray.forEach(function(lineIndex) {
    lines[lineIndex - 1] = format;
  });
  return lines;
}

function calcLineFormatting(blocks) {
  var lines = {};

  _.each(blocks, function(block) {
    if (block.hits === 0) {
      _.assign(
        lines,
        setOnAllLines(block.lines, {
          lineClass: "line-not-hit",
          gutterClass: "line-not-hit"
        })
      );
    } else if (block.hits > 0) {
      _.assign(
        lines,
        setOnAllLines(block.lines, {
          gutterClass: "line-hit",
          lineClass: "line-hit",
          gutterContent: "" + block.hits
        })
      );

      if (block.hasOwnProperty("avgTime") && block.lines.length) {
        var firstLine = block.lines[0] - 1;
        lines[firstLine] = _.extend(
          { avgTime: block.avgTime, totalTime: block.totalTime },
          lines[firstLine]
        );
      }
    }
  });

  return lines;
}

function percentToRating(percent) {
  if (percent < 50) return "bad";
  if (percent < 75) return "fair";
  return "good";
}

function getObjectScripts(obj, scriptStats) {
  var p = obj,
    path = "";

  var allIndexes = [];
  while (p) {
    if (p.scriptsRefs && p.scriptsRefs.length) {
      [].push.apply(
        allIndexes,
        p.scriptsRefs.map(function(i) {
          var s = scriptStats[i];
          return {
            name: s.scriptDisplayName,
            path: path + s.scriptDisplayName
          };
        })
      );
    }
    p = p.parent;
    if (p) {
      path += "../";
    }
  }

  return allIndexes;
}

/**
 *
 * @param reportDir
 * @param scriptData
 * @returns {!Promise}
 */
function writeScriptHTML(
  reportDir,
  scriptData,
  sourceCode,
  dirStats,
  scriptStats
) {
  var reportRoot = _.times(scriptData.parentPath.split("/").length, function() {
    return "..";
  }).join("/");
  var scriptDisplayName = scriptData.scriptDisplayName;
  var pathElems = scriptData.parentPath.split("/"),
    crumbtrail = makeCrumbtrail(pathElems, scriptDisplayName, "index.html");

  var objectScripts = getObjectScripts(scriptData.parent, scriptStats);

  // gather header stats.
  var stats = scriptData.stats;

  addSummaryStats(stats, ["lines", "blocks", "functions"]);

  var headerClass = percentToRating(stats.linesPercent);
  var lineFormatting = calcLineFormatting(scriptData.blockCodes);

  var content = templates.script({
    reportRoot: reportRoot,
    objName: pathElems[pathElems.length - 1],
    scriptName: scriptDisplayName,
    pageTitle: "Coverage Report for " + scriptDisplayName,
    code: sourceCode,
    stats: stats,
    lineFormatting: JSON.stringify(lineFormatting),
    headerClass: headerClass,
    crumbtrail: crumbtrail,
    scriptLinks: JSON.stringify(objectScripts)
  });

  var fpath = path.join(reportDir, scriptData.path);

  console.log( "Writing file: ", fpath );

  return Q.nfcall(
    fs.writeFile,
    fpath + ".html",
    content,
    "utf8"
  );
}

function makeCrumbtrail(pathElems, curElem, relURL) {
  var crumbtrail = [];
  pathElems = [].concat(pathElems);
  while (pathElems.length) {
    var name = pathElems.pop();
    crumbtrail.push({ name: name, url: relURL });
    relURL = "../" + relURL;
  }
  crumbtrail.reverse();

  crumbtrail.push({ name: curElem });

  return crumbtrail;
}

function addSummaryStats(stats, baseNames) {
  // add percentages.
  baseNames.forEach(function(n) {
    var r = stats[n] ? stats[n + "Hit"] / stats[n] : 0;
    var p = 100.0 * r;
    stats[n + "Percent"] = p;
    stats[n + "PercentStr"] = p.toFixed(2) + "%";
    stats[n + "Color"] = p < 50 ? "#EA806F" : p < 80 ? "#E6CC17" : "#B7D371"; // tinycolor( { h: ( r * 90 ), s: 90, v: 90 }).toHexString();
  });

  stats.hitsPerLine = (stats.lines > 0
    ? stats.totalHits / stats.lines
    : 0).toFixed(2);
}

function writeDirHTML(reportDir, dirName, dirData, dirStats, scriptsData) {
  var pathElems = dirName.split("/");
  var reportRoot = _.times(pathElems.length, function() {
    return "..";
  }).join("/");

  var ownName = pathElems.pop();
  var crumbtrail = makeCrumbtrail(pathElems, ownName, "../index.html");

  // gather header stats.
  var stats = dirData.stats;
  addSummaryStats(stats, ["lines", "blocks", "functions", "scripts"]);

  var headerClass = percentToRating(stats.linesPercent);

  // gather child-object data.

  var objects = dirData.dirs.map(function(child) {
    var childData = dirStats[child.path];
    var childStats = childData.stats;
    addSummaryStats(childStats, ["lines", "blocks", "functions", "scripts"]);

    return _.extend(
      {
        type: child.type,
        name: child.name,
        url: child.name + "/index.html"
      },
      childStats
    );
  });

  var scripts = dirData.scriptsRefs.map(function(childIndex) {
    var childData = scriptsData[childIndex];
    var childStats = childData.stats;
    addSummaryStats(childStats, ["lines", "blocks", "functions"]);
    childStats.scriptTimeStr = childStats.scriptTime.toFixed(3);

    return _.extend(
      {
        type: "script",
        name: childData.scriptName.replace(/\.Script$/, ""),
        url: childData.scriptName + ".html",
        rating: percentToRating(childStats.linesPercent),
        scripts: 1,
        scriptsHit: childStats.functionsHit > 0 ? 1 : 0,
        scriptsPercent: childStats.functionsHit > 0 ? 100 : 0,
        scriptsPercentStr: childStats.functionsHit > 0 ? "100%" : "0%"
      },
      childStats
    );
  });

  var content = templates.directory({
    reportRoot: reportRoot,
    dirName: dirName,
    pageTitle: ownName,
    stats: stats,
    headerClass: headerClass,
    subObjects: objects,
    scripts: scripts,
    crumbtrail: crumbtrail
  });

  return Q.nfcall(
    fs.writeFile,
    path.join(reportDir, dirName) + "/index.html",
    content,
    "utf8"
  );
}

/**
 * Stream processing step which reads in lines of
 * block/count pairs and outputs combined counts
 * for each block.
 * @returns {*}
 */
function mergeBlocks() {
  var uniqueCombined = {
    visits: {},
    timings: {}
  };

  var matchInt = /'([-_;:=?@!~#$%&a-zA-Z0-9]+)'=([0-9]+)/g,
    matchReal = /'([-_;:=?@!~#$%&a-zA-Z0-9]+)'=G?([-e.0-9]+)/g,
    val;

  return es.through(
    function write(input) {
      var pair, match;
      if (input) {
        var dest = uniqueCombined.visits;

        if (input.substr(0, 2) === "t=") {
          dest = uniqueCombined.timings;

          while ((match = matchReal.exec(input))) {
            val = parseFloat(match[2]);
            if (dest.hasOwnProperty(match[1])) {
              dest[match[1]] += val;
            } else {
              dest[match[1]] = val;
            }
          }
        } else {
          while ((match = matchInt.exec(input))) {
            val = parseInt(match[2], 10);
            if (dest.hasOwnProperty(match[1])) {
              dest[match[1]] += val;
            } else {
              dest[match[1]] = val;
            }
          }
        }
      }
    },
    function end(data) {
      this.emit("data", uniqueCombined);
      this.emit("end");
    }
  );
}

/**
 * Merges a group of coverage files into one object containing the
 * hit counts for each block.
 * @param {Array} files - List of file names.
 * @returns {promise|*} Returns a promise for the result.
 */
function mergeVisits(files) {
  var d = Q.defer();

  var streams = files.map(function(f) {
    return fs.createReadStream(f, { encoding: "utf-8" }).pipe(es.split());
  });

  es.merge
    .apply(es, streams)
    .pipe(mergeBlocks())
    .on("data", function(data) {
      d.fulfill(data);
    })
    .on("error", function(err) {
      d.reject(err);
    });

  return d.promise;
}

/**
 * Loads a coverage file and parses it into a javascript object.
 * @param filename
 * @returns {!Promise.<RESULT>|*} Returns a promise for the result
 */
function loadCoverageFile(filename) {
  return Q.nfcall(fs.readFile, filename, {encoding: 'utf-8'}).then(function(data) {
    return JSON.parse(data);
  });
}

/**
 * Creates the top level coverage report directory and
 * creates or replaces a 'report' subdirectory.
 * @param dir
 * @returns {!Promise.<RESULT>|*}
 */
function createReportDir(dir) {

  var reportDir = path.join(dir, "report");

  return Q.allSettled([Q.nfcall(fs.mkdir, dir)])
    .then(function() {

      // either way, try to create the report directory.
      return Q.nfcall(fs.mkdir, reportDir).fail(function() {
        
        // try removing the report directory.
        return Q.nfcall(rimraf, reportDir).then(function() {
          // then create it.
          return Q.nfcall(fs.mkdir, reportDir);
        });
      
      });
    })
    .then(function() {
      return reportDir;
    });
}

/**
 * Recursively generates a tree of empty directories
 * @param baseDir - The source directory.
 * @param children - An object where each item is a subdirectory.
 * @returns {*|!Promise.<!Array>} A promise
 */
function buildReportShell(baseDir, children) {
  return Q.all(
    _.keys(children).map(function(dirName) {
      var joinedPath = path.join(baseDir, dirName);
      console.log( "Trying to create directory: ", joinedPath );
      
      return Q.nfcall(fs.mkdir, joinedPath).then(function() {
        return buildReportShell(joinedPath, children[dirName]);
      }).fail( function( err ) { 
        console.log( "Problem: ", err );
        // return buildReportShell(joinedPath, children[dirName]);
      });
    })
  );
}

/**
 * Converts a list of paths into a tree structure
 * object where each key represents a directory name
 * and each value contains another object which contains
 * the directory contents.
 * @param allPaths - Array of paths
 * @returns {{}} Returns the tree.
 */
function getTreeFromPaths(allPaths) {
  var dirTree = {},
    cur = dirTree;

  allPaths.forEach(function(scriptPath) {
    var parts = scriptPath.split("/");

    cur = dirTree;

    // remove script name.
    parts.pop();

    parts.forEach(function(elem) {
      var next;
      if (!(next = cur[elem])) {
        next = cur[elem] = {};
      }
      cur = next;
    });
  });

  return dirTree;
}

/**
 * Merges a source object into a destination
 * object by adding values if both objects contain the same key,
 * or by setting the destination value if it does not exist.
 * @param dest - The destination object
 * @param source - The source object.
 */
function mergeAdd(dest, source) {
  _.each(source, function(v, k) {
    if (dest.hasOwnProperty(k)) {
      dest[k] += v;
    } else {
      dest[k] = v;
    }
  });
}

/**
 *
 * @param scriptData
 * @param tree
 * @returns {{}}
 */
function buildDirStats(scriptData, tree) {
  var dirStats = {};

  // seed the first level of directory stats with the script data.
  scriptData.forEach(function(scriptInfo, i) {
    var pathElems = scriptInfo.pathParts.slice(0, -1);
    var curPath = "",
      parent = null;

    // distribute the script stats across all parent directories...
    pathElems.forEach(function(elem) {
      curPath += elem.label;

      var entry = dirStats[curPath];

      if (!entry) {
        // directory has not be seen yet -- make a spot for it.
        entry = dirStats[curPath] = {
          type: elem.type,
          stats: {},
          scriptsRefs: [],
          dirs: [],
          parent: parent
        };

        if (parent) {
          var childType = elem.type;
          if (parent.type === "ospace") {
            // differentiate types 'object' and 'orphan';
            if (!/[ a-zA-Z0-9_]+[ ]?Root/.test(elem.label)) {
              childType = "orphan";
            }
          }

          parent.dirs.push({
            name: elem.label,
            path: curPath,
            type: childType
          });
        }
      }

      mergeAdd(entry.stats, scriptInfo.stats);

      parent = entry;
      curPath += "/";
    });

    scriptInfo.parent = parent;

    // add this script's index to its object (directory) -- we want this later.
    dirStats[scriptInfo.parentPath].scriptsRefs.push(i);
  });

  return dirStats;
}

function scriptPathToObjInfo(p) {
  var parts,
    modParts,
    fileParts,
    objInfo = {},
    multiOSpace = p.indexOf("/ospaces_src/") !== -1,
    splitStr = multiOSpace ? "/ospaces_src/" : "/ospace_src/";

  objInfo.originalPath = p;

  parts = p.split(splitStr);
  modParts = parts[0].split("/");
  fileParts = parts[1].split("/");

  objInfo.pathParts = [{ type: "summary", label: "All Files" }];

  if (multiOSpace) {
    objInfo.module = modParts[modParts.length - 1];
    objInfo.ospace = fileParts[0];
    fileParts = fileParts.slice(1);
    objInfo.pathParts.push({ type: "module", label: objInfo.module });
  } else {
    objInfo.ospace = modParts[modParts.length - 1];
  }

  objInfo.pathParts.push({ type: "ospace", label: objInfo.ospace });
  objInfo.scriptName = fileParts[fileParts.length - 1];
  objInfo.scriptDisplayName = objInfo.scriptName.replace(/\.Script$/, "");

  var objects = fileParts.slice(0, -1);

  [].push.apply(
    objInfo.pathParts,
    objects.map(function(f) {
      return { type: "object", label: f };
    })
  );

  objInfo.pathParts.push({ type: "script", label: objInfo.scriptName });

  var labels = _.map(objInfo.pathParts, "label");

  objInfo.parentPath = labels.slice(0, -1).join("/");
  objInfo.path = labels.join("/");

  return objInfo;
}

function collectScriptData(runtimeData, coverInfo) {
  var visits = runtimeData.visits,
    timings = runtimeData.timings;

  // first process all the scripts -- these are the end points.

  var uniqueLocs = coverInfo.locations;

  var scripts = [],
    scriptHash = {};

  _.each(uniqueLocs, function(v, k) {
    var origScriptPath = v[0],
      functionName = v[1],
      blockIDs = v[2],
      fileInfo = scriptPathToObjInfo(origScriptPath),
      index = scriptHash[fileInfo.path];

    if (typeof index === "undefined") {
      scriptHash[fileInfo.path] = index = scripts.length;

      _.extend(fileInfo, {
        functions: {},
        location_codes: [],
        blockCodes: {},
        stats: {
          // timing stats
          scriptTime: 0,

          // visit stats
          functions: 0,
          functionsHit: 0,
          blocks: 0,
          blocksHit: 0,
          lines: 0,
          linesHit: 0,
          scripts: 1,
          scriptsHit: 0,
          totalHits: 0
        }
      });

      scripts.push(fileInfo);
    }

    var entry = scripts[index];
    entry.functions[functionName] = blockIDs;
    entry.location_codes.push(k);
    entry.stats.functions++;
    entry.stats.blocks += blockIDs.length;

    // merge in visit data.
    blockIDs.forEach(function(bID) {
      var blockInfo = coverInfo.blocks[bID];

      if (!blockInfo) {
        throw "Missing block. The coverage file may be out of date.";
      }

      var blockVisits = visits[bID],
        blockLines = coverInfo.blocks[bID].lines,
        lineCount = blockLines.length;

      entry.stats.lines += lineCount;

      // update block/line summary stats for the script
      entry.stats.blocksHit += blockVisits > 0 ? 1 : 0;
      entry.stats.linesHit += blockVisits > 0 ? lineCount : 0;

      // update the instance hits by block,
      // also keep lines for each block here.
      entry.blockCodes[bID] = {
        hits: blockVisits || 0,
        lines: blockLines
      };

      if (blockInfo.f) {
        entry.blockCodes[bID].totalTime = timings[bID] || 0;

        if (blockVisits) {
          // stats.functionsHit is number of functions
          // hit in the script, not invocations.
          entry.stats.functionsHit++;

          // for function blocks, add the average execute time to the block entry.
          entry.blockCodes[bID].avgTime =
            entry.blockCodes[bID].totalTime / blockVisits;
        } else {
          entry.blockCodes[bID].avgTime = 0;
        }
      }

      entry.stats.totalHits += blockVisits || 0;
    });

    entry.stats.scriptsHit =
      entry.stats.scriptsHit || entry.stats.functionsHit > 0 ? 1 : 0;
  });

  // console.log( JSON.stringify( scripts, null, 4 ) );

  return scripts;
}

module.exports = coverageReport;
