var fs = require( 'fs'),
    Q = require( 'q'),
    es = require( 'event-stream'),
    _ = require( 'lodash'),
    path = require( 'path'),
    rimraf = require( 'rimraf'),
    ncp = require('ncp').ncp;

var SCRIPT_REPORT_TEMPLATE = path.join( __dirname, 'assets/creport_script.html'),
    SCRIPT_REPORT = _.template( fs.readFileSync( SCRIPT_REPORT_TEMPLATE, "utf8" )),
    REPORT_SCRIPTS_DIR = path.join( __dirname, "assets/scripts" );

function mergeBlocks() {
    var uniqueCombined = {};

    return es.through(
        function write (input) {
            if( input ) {
                var pair = /'([-_;:=?@!~#$%&a-zA-Z0-9]+)'=([0-9]+)/g,
                    match;

                while( match = pair.exec(input) ) {
                    if( uniqueCombined.hasOwnProperty( match[1] ) ) {
                        uniqueCombined[ match[1] ] += parseInt( match[2], 10 );
                    }
                    else {
                        uniqueCombined[ match[1] ] = parseInt( match[2], 10 );
                    }
                }
            }
        },
        function end( data ) {
            this.emit( 'data', uniqueCombined );
            this.emit( 'end' );
        }
    );
}

function mergeVisits( files ) {

    var d = Q.defer();

    var streams = files.map( function(f) {
        return fs.createReadStream(f, { encoding: 'utf-8' })
            .pipe( es.split() );
    } );

    es.merge.apply( es, streams )
        .pipe( mergeBlocks() )
        .on( "data", function( data ) {
            d.fulfill( data );
        })
        .on( "error", function( err ) {
            d.reject( err );
        } );

    return d.promise;
}

function loadCoverageFile( filename ) {
    return Q.nfcall( fs.readFile, filename, 'utf8').then( function( data ) {
        return JSON.parse( data );
    } );
}

function coverageReport( visitFiles, options ) {
    Q.spread([ mergeVisits(visitFiles), loadCoverageFile(options.coverage)], function( visits, coverInfo ) {

        console.log( "Back in coverage report function and we have our data: " );
        console.log( "Total blocks: ", _.size( coverInfo.blocks ) );
        console.log( "Visited blocks: ", _.size( visits ) );

        var function_blocks = [],
            visitedFuncCount = 0;

        _.each( coverInfo.blocks, function( v, k ) {
            if(v.f ) {
                function_blocks.push( k );
                visitedFuncCount += ( visits[k] ? 1 : 0 ) ;
            }
        } );

        console.log ("Total functions: ", function_blocks.length );
        console.log ("Visited functions: ", visitedFuncCount );
        generateReport( options.output, visits, coverInfo );
    } )
    .catch( function( e ) {
        console.error( "We got this error: ", e );
    } );
}

function createReportDir( dir ) {
    var reportDir = path.join( dir, "report" );

    return Q.allSettled( [ Q.nfcall( fs.mkdir, dir ) ] )
    .then( function() {
        // either way, try to create the report directory.
        return Q.nfcall( fs.mkdir, reportDir )
            .fail( function() {
                // try removing the report directory.
                return Q.nfcall( rimraf, reportDir)
                    .then( function() {
                        // then create it.
                        return Q.nfcall( fs.mkdir, reportDir );
                    } );
            } );
    })
    .then( function() {
        return reportDir
    } );
}

function getTreeFromPaths( allPaths ) {
    var dirTree = {},
        cur = dirTree;

    allPaths.forEach( function( scriptPath ) {
        var parts = scriptPath.split( '/' );

        cur = dirTree;

        // remove script name.
        parts.pop();

        parts.forEach( function( elem ) {
            var next;
            if( !( next = cur[elem] ) ) {
                next = cur[elem] = {};
            }
            cur = next;
        } );
    } );

    console.log( JSON.stringify( dirTree, null, 4 ) );


    return dirTree;
}

function genScriptReport( filename, scriptData, allData, relDir ) {

    var content = SCRIPT_REPORT( {
        relDir: relDir,
        filename: scriptData.reportFile,
        code: allData.cover.source[ scriptData.origPath ],
        pathElems: scriptData.pathElems
    } );

    return Q.nfcall( fs.writeFile, filename + ".html", content, 'utf8' );
}

function buildReportShell( baseDir, children ) {
    return Q.all( _.keys( children ).map( function( dirName ) {
        var joinedPath = path.join( baseDir, dirName );
        return Q.nfcall( fs.mkdir, joinedPath  )
            .then( function() {
                return buildReportShell( joinedPath, children[dirName].objs )
            } )
    } ));
}

function mergeAdd( dest, source ) {

    _.each( source, function(v,k) {
        if( dest.hasOwnProperty( k ) ) {
            dest[k] += v;
        }
        else {
            dest[k] = v;
        }
    } );
}

function buildDirStats( scriptData, tree ) {
    var dirStats = {},
        nextSet = [];

    // seed the first level of directory stats with the script data.
    scriptData.forEach( function(scriptInfo, i) {

        var pathElems = scriptInfo.parentPath.split( '/' );
        var curPath = "",
            curNode = tree;

        pathElems.forEach( function( elem )  {
            curPath += elem;

            curNode = curNode[elem];

            var entry = dirStats[curPath];

            if( !entry ) {
                entry = dirStats[curPath] = {
                    stats: {},
                    scriptsRefs: [],
                    dirs: _.keys( curNode).map( function(n) {
                        return { name: n, path: curPath + '/' + n };
                    } )
                };
            }

            mergeAdd( entry.stats, scriptInfo.stats );
            curPath += "/";
        } );

        dirStats[scriptInfo.parentPath].scriptsRefs.push( i );
    } );

    return dirStats;
}

function generateReport( dir, visits, coverInfo ) {
    createReportDir( dir )
        .then( function( reportDir ) {
            var reportData = collectScriptData( visits, coverInfo );
            var scriptPaths = _.pluck( reportData, 'path' );
            var shellInfo = getTreeFromPaths( scriptPaths );

            return buildReportShell( reportDir, shellInfo )
                .then( function() {

                    reportData.forEach( function() {
                        // attach tree info to
                    } );

                    var dirStats = buildDirStats( reportData, shellInfo );

                    console.log( JSON.stringify( dirStats, null, 4 ) );
                } );
        }).done();
}

function scriptPathToObjInfo( p ) {
    var parts,
        modParts,
        objInfo = {},
        splitStr = p.indexOf( '/ospaces_src/' ) === -1 ? '/ospace_src/' : 'ospaces_src';

    objInfo.originalPath = p;

    parts = p.split( splitStr );
    modParts = parts[0].split( "/" );

    objInfo.module = modParts.pop();
    modParts = parts[1].split( "/" );

    objInfo.scriptName = modParts.pop();
    objInfo.parentPath = ( [ objInfo.module ].concat( modParts) ).join( "/" );
    objInfo.path = [ objInfo.parentPath, objInfo.scriptName ].join( "/" );

    return objInfo;
}

function collectScriptData( visits, coverInfo ) {

    // first process all the scripts -- these are the end points.

    var uniqueLocs = coverInfo.locations;

    var scripts = [],
        scriptHash = {};

    _.each( uniqueLocs, function( v, k ) {
        var origScriptPath = v[0],
            functionName = v[1],
            blockIDs = v[2],
            fileInfo = scriptPathToObjInfo(origScriptPath),
            index = scriptHash[fileInfo.path];

        if( typeof index === 'undefined' ) {
            scriptHash[fileInfo.path] = index = scripts.length;

            _.extend( fileInfo, {
                functions: {},
                location_codes: [],
                blockCodes: {},
                stats: {
                    functions: 0,
                    functionsHit: 0,
                    blocks: 0,
                    blocksHit: 0,
                    lines: 0,
                    linesHit: 0,
                    scripts: 1,
                    scriptsHit: 0
                }
            } )

            scripts.push( fileInfo );
        }

        var entry = scripts[index];
        entry.functions[functionName] = blockIDs;
        entry.location_codes.push( k );
        entry.stats.functions++;
        entry.stats.blocks += blockIDs.length;

        // merge in visit data.
        blockIDs.forEach( function( bID ) {
            var blockInfo = coverInfo.blocks[bID];

            if( !blockInfo ) {
                throw "Missing block. The coverage file may be out of date."
            }

            var blockVisits = visits[bID],
                ranges = coverInfo.blocks[bID].ranges,
                linesInRanges = ranges.map( function(v){return 1 + v[1] - v[0]; } )
                    .reduce( function( sum, n ) {return sum + n; }, 0 );

            entry.stats.lines += linesInRanges;

            // update block/line summary stats for the script
            entry.stats.blocksHit += blockVisits > 0 ? 1 : 0;
            entry.stats.linesHit += blockVisits > 0 ? linesInRanges : 0;

            if( blockInfo.f && blockVisits ) {
                // stats.functionHits is number of functions
                // hit in the script, not invocations.
                entry.stats.functionsHit++;
            }

            // update the instance hits by block,
            // also keep ranges for each block here.
            entry.blockCodes[bID] = {
                hits: blockVisits || 0,
                ranges: ranges
            };
        } );

        entry.stats.scriptsHit = entry.stats.scriptsHit || entry.stats.functionsHit > 0 ? 1 : 0;
    } );

    return scripts;
}

module.exports = coverageReport;