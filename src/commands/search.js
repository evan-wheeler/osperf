var Module = require( '../module'),
    Q = require( 'q' ),
    fs = require( 'fs'),
    async = require( 'async'),
    _ = require( 'lodash'),
    parseUtils = require( '../parseutils'),
    Bannockburn = require( 'bannockburn'),
    path = require( 'path'),
    cmp = require( '../compare'),
    EditList = require( '../edits' );

function search( modules, options ) {
    'use strict';

    if( !_.isArray( modules ) ) {
        modules = [ modules ];
    }

    var modObjs = modules.map( function(modName) { return new Module( modName, options.base ); } )

    var params = {};

    return parseUtils.listScriptsInModules( modObjs )
        .then( function( allFiles ) {
            return processFiles( allFiles, params );
        })
        .then( function( results ) {
            /*
            var output = genCoverageData( results.blocks, results.functions, gen.getIDs(), params.sourceStore );
            fs.writeFileSync( options.output, JSON.stringify( output ), 'utf8' );

            // add headers
            modObjs.forEach( function( m ) {
                addHeader( m.getStartupScripts() );
            } );
            */

        })
        .catch( function( e ) {
            console.error( "There was a problem: ", e );
        } );
}

function processFiles( srcFiles, params ) {
    'use strict';
    return Q.nfcall( async.mapLimit, srcFiles, 4, processEach.bind( null, params ) ).then( combine );
}

function processEach( params, file, done ) {

    // console.log( "Reading file: ", file );

    parseUtils.parseFile(file).then( function( parseResult ) {

        // save the original source code.
        var src = parseResult.src;

        var parser = Bannockburn.Parser(),
            ast = parser.parse( src ),
            astNode = parseUtils.getASTNode;



        var w = new Bannockburn.Walker();

        var curScript = path.basename(file).replace( /\.Script$/, "" );
        var curFunction = "";

        var editList = new EditList( src );

        w.on( "FunctionDeclaration", function( node ) {
            curFunction = node.name;
        } );

        w.on( 'VariableDeclaration', function( node ) {
            if( cmp( node, { "type": "VariableDeclaration",
                "declarations": [ {
                "type": "VariableDeclarator",
                "name": { "id": "(name)" },
                "init": {
                    "type": "CallExpression",
                    "callee": {
                        "type": "MemberExpression",
                        "property": {
                            "id": "(name)",
                            "value": "InitErrObj"
                        }
                    }
                },
                "dataType": { "id": "assoc" }
            } ] } ) ) {


                console.log( curScript + "." + curFunction, ":", src.substring( node.range[0], node.range[1]+1 ) );
            }

            return false;
        } );

        w.start( ast );

        // instrument the code.
        // var result = instrument( parseResult.src, parseResult.ast, blockIDGen, params );

        // write the modified code back to the original file.
        // fs.writeFileSync( file, result.result, 'utf8' );

        // just return the block & function data.
        done( null, { result: [] } );
    } )
    .catch( function(e) {
        // don't kill the whole process.
        console.error( "Problem instrumenting file. ", e, " in file: ", file );
        done( null, {results:[]} );
    })
    .done();
}

function combine( results ) {
    return results.reduce( function( last, cur ) {
        return {
            results: last.results.concat(cur.results)
        };
    }, {
        results: []
    } );
}

module.exports = search;