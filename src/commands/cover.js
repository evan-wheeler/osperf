var Module = require( '../module'),
    IDGenerator = require( '../idgen'),
    Q = require( 'q' ),
    fs = require( 'fs'),
    async = require( 'async'),
    instrument = require( "../instrument/coverage"),
    _ = require( 'lodash'),
    parseUtils = require( '../parseutils' );

/**
 * Adds coverage instrumentation to modules.
 * @param modules - Names of the modules to add coverage.
 * @param options - requires base and optional output.
 */
function cover( modules, options ) {
    'use strict';

    if( !_.isArray( modules ) ) {
        modules = [ modules ];
    }

    var gen = new IDGenerator(),
        modObjs = modules.map( function(modName) { return new Module( modName, options.base ); } )

    return parseUtils.listScriptsInModules( modObjs )
        .then( function( allFiles ) {
            return processFiles( allFiles, gen );
        })
        .then( function( results ) {

            var output = genCoverageData( results.blocks, results.functions, gen.getIDs() );

            fs.writeFileSync( options.output, JSON.stringify( output ), 'utf8' );
        })
        .catch( function( e ) {
            console.error( "There was a problem: ", e );
        } );
}

function genCoverageData( blocks, function_blocks, id_locations ) {
    'use strict';

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

    blocks.forEach( function( b ) {
        var blockLoc = id_locations[b.id],
            locKey = blockLoc.script + ":" + blockLoc.func,
            uLoc = uniqueLocs[locKey];

        if( !uLoc ) {
            uLoc = locGen.newID();
            uniqueLocs[locKey] = uLoc;
            byLocID[uLoc] = [ blockLoc.script, blockLoc.func, [] ];
        }

        blockMap[b.id] = { ranges: b.ranges, loc: uLoc };
        byLocID[uLoc][2].push(b.id);
    } );

    function_blocks.forEach( function(bID) {
        blockMap[bID].f = true;
    } );

    return {
        blocks: blockMap,
        locations: byLocID
    };
}

/**
 * Process all the source files.
 * @param srcFiles
 * @param idGenerator
 * @returns {!Promise.<RESULT>|*}
 */
function processFiles( srcFiles, idGenerator ) {
    'use strict';
    return Q.nfcall( async.mapLimit, srcFiles, 4, processEach.bind( null, idGenerator ) ).then( combine );
}

/**
 * Process parse/instrument each file
 * @param file
 * @param done
 */
function processEach( idGenerator, file, done ) {

    console.log( "Parsing file: ", file );
    parseUtils.parseFile(file).then( function( parseResult ) {

        // adapt our block ID generator for this file.
        var blockIDGen = function ( blockInfo ) {
            return idGenerator.newID( {
                script: file,
                func: blockInfo.func
            } );
        };

        // instrument the code.
        var result = instrument( parseResult.src, parseResult.ast, blockIDGen );

        // write the modified code back to the original file.
        fs.writeFileSync( file, result.result, 'utf8' );

        // just return the block & function data.
        done( null, {
            blocks: result.blocks,
            functions: result.functions
        } );
    } )
    .catch( function(e) {
        // don't kill the whole process.
        console.error( "Problem instrumenting file. ", e, " in file: ", file );
        done( null, { blocks: [], functions: [] } );
    })
    .done();
}

/**
 * Combines the results of all the instrumenting
 * @param results
 * @returns {Object|*|Mixed}
 */
function combine( results ) {
    // merge the block and function data to return.
    return results.reduce( function( last, cur ) {
        return {
            blocks: last.blocks.concat(cur.blocks),
            functions: last.functions.concat(cur.functions)
        };
    }, {
        blocks: [],
        functions: []
    } );
}

module.exports = cover;