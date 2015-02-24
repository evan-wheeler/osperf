var Q = require( 'q'),
    fs = require( 'fs'),
    async = require( 'async'),
    Bannockburn = require( 'bannockburn' );

var cat = function( a, i ) {
    return a.concat( i );
};

var exports = module.exports;

/* Common functions */

exports.listScriptsInModules = function ( modules ) {
    return Q.nfcall( async.map, modules, function( mod, cb ) {
        cb( null, mod.getScripts() );
    })
    .then( function( results ) {
        return results.reduce( cat, [] );
    } );
};

exports.parseFile = function ( filename ) {
    return Q.nfcall( fs.readFile, filename, 'utf-8' ).then( function( content ) {
        return {
            src: content,
            ast: Bannockburn.Parser().parse( content )
        };
    } );
};

exports.getASTNode = function( v ) {
    if( v ) {
        if( _.isArray( v ) ) {
            return v[0];
        }
        else {
            return v;
        }
    }
    return null;
};
