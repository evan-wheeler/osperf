// instrument.js

var util = require( './util' ),
    partialCompare = require( './compare' ),
    EditList = require( './edits' );

function isInstrumented( funcBody ) {

    var __fDeclr = {
        "type": "ExpressionStatement",
        "expression": {
            "type": "CallExpression",
            "arguments": [ { "id": "(literal)", }, { "id": "this", "value": "this" } ]
        }
    };

    return funcBody && funcBody.length && partialCompare( funcBody[0], __fDeclr );
}

function enterFn( editList, fID, code, pos ) { 
    var indentStr = findIndent( code, pos );
    editList.insert( "$_P.I('" + fID + "',this)\n" + indentStr, pos );
}

function exitFn( editList, fID, code, pos ) {
    var indentStr = findIndent( code, pos );
    editList.insert( "\n" + indentStr + "$_P.O('" + fID + "')\n", pos + 1 ); 
} 

function returnFn( editList, fID, code, node ) {
    var indentStr = findIndent( code, node.range[0] );
    
    // if the return value is not a simple value, first store it in a temporary variable before returning...

    if( isSimpleOp( node.argument ) ) {
        editList.insert( "$_P.O('" + fID + "')\n" + indentStr, node.range[0] );
        return;
    }
    
    /* 
    Move the result into a temporary before returning.  This will transform a return like this: 
        return ( x() * y() )
    into this:
        Dynamic __return512 = ( x() * y() ); __prf.O(__fid); return __return512
    */
    
    var returnExprEnd = node.range[1], 
        returnBegin = node.range[0],
        returnEnd = returnBegin + 6,
        rTmpID = "" + returnBegin,
        tmpVar = "_return" + rTmpID;

    editList.insert( rTmpID + "=", returnEnd );
    editList.insert( "Dynamic _", returnBegin );
    editList.insert(  "; $_P.O('" + fID + "'); return " + tmpVar, returnExprEnd + 1 );
}

function isSimpleOp( node ) { 
    if ( !node || node.id === "(name)" || node.id === "(literal)" || node.arity === 'literal' ) { 
        return true;
    }
    else if( node.type === "MemberExpression" ) { 
        return ( !node.object || node.object.id === "(name)" || node.object.id === "(literal)" || node.object.arity === "literal" ) && 
                ( node.property && ( node.property.id === "(name)" || node.property.id === "(literal)" || node.property.arity === "literal" ) );
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
        statements = util.isArray( parseTree ) ? parseTree : [ parseTree ];
    
    var alreadyInstrumented = false;
    
    statements.every( function( node ) { 
        if( node && node.type === "FunctionDeclaration" ) { 
            var funcID = manglerFn( scriptRefStr, node.name );

            var bodyStatements = null;

            if( node.body ) { 
                bodyStatements = node.body;
                
                if( isInstrumented( bodyStatements ) ) { 
                    alreadyInstrumented = true;
                    return false;
                }

                enterFn( editsList, funcID, code, bodyStatements[0].range[0] );
                
                // instrument any returns in the body of the function.
                instrumentReturns( editsList, funcID, code, bodyStatements );
                
                var lastStatement = null;
                
                if( bodyStatements.length ) {
                    lastStatement = ( bodyStatements[bodyStatements.length - 1] || {} ).id;
                }
                
                if( lastStatement !== "return" ) { 
                    // instrument the exit of the function
                    exitFn( editsList, funcID, code, bodyStatements[bodyStatements.length - 1].range[1] );
                }
            }
        }
        return true;
    } );
    
    // return the instrumented code.
    return alreadyInstrumented ? code : editsList.apply();
}

function instrumentReturns( editList, funcID, code, node ) {
    var children = [];
    
    if( node ) {
        if( node.id === "return" ) {                
            returnFn( editList, funcID, code, node );
            return;
        }
        
        children = util.isArray( node ) ? node : util.compact( [ node.left, node.right, node.body, node.consequent, node.alternate, node.cases ] );
        
        children.forEach( function( n ) { 
            instrumentReturns( editList, funcID, code, n );
        } );
    }    
} 

module.exports = instrument;