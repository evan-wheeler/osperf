var util = require( './util' ),
    partialCompare = require( './compare' ),
    EditList = require( './edits' );

module.exports = function coverage( path, src, parseTree ) {
    
    // walk the top level looking for functions...
    var editsList = new EditList( code );
    var statements = [];
    
    util.isArray( parseTree ) ? parseTree : [ parseTree ];
    
    var alreadyInstrumented = false;
    
    statements.every( function( node ) { 
        if( node && node.id === "function" ) { 
            var funcID = manglerFn( scriptRefStr, node.name );

            var funcBody = util.isArray( node.body ) ? ( node.body || [] ) : [ node.body ];

            if( isInstrumented( funcBody ) ) { 
                alreadyInstrumented = true;
                return false;
            }
            
            // instrument the start and end of the function
            enterFn( editsList, funcID, node.start );

            // instrument any returns in the body of the function.
            instrumentReturns( editsList, code, funcBody );
            
            var lastStatement = null;
            
            if( funcBody.length ) {
                lastStatement = ( funcBody[funcBody.length - 1] || {} ).id;
            }
            
            if( lastStatement !== "return" ) { 
                // instrument the exit of the function
                exitFn( editsList, code, node.end );
            }
        }
        return true;
    } );
    
    // return the instrumented code.
    return alreadyInstrumented ? code : editsList.apply();
};