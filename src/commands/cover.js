var Bannockburn = require( '../../../bannockburn' ),
    Module = require( '../module'),
    IDGenerator = require( '../idgen'),
    Q = require( 'q' ),
    fs = require( 'fs'),
    async = require( 'async'),
    instrument = require( "../instrument/coverage"),
    _ = require( 'lodash' );



/**
 * Adds coverage instrumentation to modules.
 * @param modules - Names of the modules to add coverage.
 * @param options
 */
function cover( modules, options ) {
    'use strict';

    if( !_.isArray( modules ) ) {
        modules = [ modules ];
    }

    var gen = new IDGenerator();

    return listScriptsInModules( modules, options.sourceDir)
        .then( function( allFiles ) {
            return processFiles( allFiles, gen );
        })
        .then( function( results ) {

            fs.writeFileSync( "coverage.json", JSON.stringify( {
                blocks: results.blocks,
                function_blocks: results.functions,
                id_locactions: gen.getIDs()
            } ), 'utf-8' );

            return true;
        });
}

function listScriptsInModules( modules, srcDir ) {

    return Q.nfcall( async.map, modules, function( modName, cb ) {
            cb( null, ( new Module( srcDir, modName ) ).getScripts() );
        }).then( function( results ) {
            var cat = function( a, i ) { return a.concat( i ); };
            return results.reduce( cat, [] );
        } );
}

function parseFile( filename ) {
    return Q.nfcall( fs.readFile, filename, 'utf-8' ).then( function( content ) {
        return {
            src: content,
            ast: Bannockburn.Parser().parse( content )
        };
    } );
}

function processFiles( srcFiles, idGenerator ) {

    return Q.nfcall( async.mapLimit, srcFiles, 1, function( file, done ) {
        console.log( "Parsing file: ", file );
        parseFile(file).then( function( parseResult ) {

            // adapt our block ID generator for this file.
            var blockIDGen = function ( blockInfo ) {
                return idGenerator.newID( {
                    script: file,
                    func: blockInfo.func,
                    block: blockInfo.block
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

    }).then( function( results ) {
        // merge the block and function data to return.
        return results.reduce( function( last, cur ) {
            return {
                blocks: last.blocks.concat(cur.blocks),
                functions: last.functions.concat(cur.functions)
            };
        }, { blocks: [], functions: [] } );
    } );
}

module.exports = cover;