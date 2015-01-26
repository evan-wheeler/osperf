// instrument.js

var util = require( './util' ),
    partialCompare = require( './compare' ),
    EditList = require( './edits' );

function isInstrumented( funcBody ) {

    var __fDeclr = {
        "arity": "binary",
        "value": "=",
        "first": {
            "arity": "name",
            "value": "__f",
            "id": "(name)"
        },
        "second": {
            "arity": "literal",
            /* "value": "path_to_x", */
            "id": "(literal)"
        },
        "id": "=",
        "dataType": {
            "arity": "name",
            "value": "Dynamic",
            "id": "dynamic"
        }
    };

    return funcBody && funcBody.length && partialCompare( funcBody[0], __fDeclr );
}

function enterFn( editList, funcID, node ) { 
    editList.insert( "\n\tDynamic __f='" + funcID + "'; Object __p=$Pflr;__p.I(__f,this)\n", node.to + 1 );
}

function exitFn( editList, code, node ) {
    var indent = findIndent( code, node.from );
    editList.insert( "\t__p.O(__f)\n", node.from ); 
} 

function returnFn( editList, code, node ) {
    var indentStr = findIndent( code, node.from );
    
    // if the return value is not a simple value, first store it in a temporary variable before returning...

    if( isSimpleOp( node.first ) ) {
        editList.insert( "__p.O(__f)\n" + indentStr, node.from );
        return;
    }
    
    //                                     ++++++++++      +++++++++++              ++++++++++++++++++++++++++++++++++++++++++        
    // convert: "return ( x() * y() )" to "Dynamic __return123131232 = ( x() * y() ); __prf.O(__fid); return __return123131232"
    
    var returnExprEnd = node.eos.from, 
        returnBegin = node.from,
        returnEnd = node.to,
        rTmpID = "" + returnBegin,
        tmpVar = "__return" + rTmpID;

    var full_str = code.substring( returnBegin, returnExprEnd + 1 );
    var return_str = code.substring( returnBegin, returnEnd + 1 );
    var expr_str = code.substring( returnEnd, returnExprEnd + 1 );
        
    editList.insert( rTmpID + "=", returnEnd + 1 );
    editList.insert( "Dynamic __", returnBegin );
    editList.insert(  "; __p.O(__f); return " + tmpVar + "\n" + indentStr, returnExprEnd );
}

function isSimpleOp( node ) { 
    if ( !node || node.id === "(name)" || node.id === "(literal)" || node.arity === 'literal' ) { 
        return true;
    }
    else if( node.id === "." ) { 
        return ( !node.first || node.first.id === "(name)" || node.first.id === "(literal)" || node.first.arity === "literal" ) && 
                ( node.second && ( node.second.id === "(name)" || node.second.id === "(literal)" || node.second.arity === "literal" ) );
    }
    return false;
}

function findIndent( code, pos ) { 
    var indentStr = "";
    while( --pos > 0 ) {
        var ch = code[pos];
        switch( ch ) { 
            case '\t': case ' ':
                indentStr = ch + indentStr;
                break;
            case '\n': case '\r':
                return indentStr;
            default: 
                indentStr = "";
        }
    }
    return indentStr;
}

function defaultMangler( scriptRefStr, funcName ) { 
    return scriptRefStr + funcName;
}

function instrument( scriptRefStr, code, parseTree, manglerFn ) { 
    // walk the parse tree and add code at the beginning of each function definition, before 
    // each return function, and at the end of each function body.
    
    manglerFn = manglerFn || defaultMangler;
    
    // walk the top level looking for functions...
    var editsList = new EditList( code ),
        functions = util.isArray( parseTree ) ? parseTree : [ parseTree ];
    
    var alreadyInstrumented = false;
    
    functions.every( function( node ) { 
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
}

function instrumentReturns( editList, code, node ) {
    var children = [];
    
    if( node ) {
        if( node.id === "return" ) {                
            returnFn( editList, code, node );
            return;
        }
        
        children = util.isArray( node ) ? node : util.compact( [ node.first, node.second, node.third, node.fourth, node.body, node.bodyAlt ] );
        
        children.forEach( function( n ) { 
            instrumentReturns( editList, code, n );
        } );
    }    
} 

module.exports = instrument;