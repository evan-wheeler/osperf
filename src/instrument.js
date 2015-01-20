// instrument.js

var util = require( './util' );
  
function applyEdits( code, edits ) { 

    edits.sort( function( a, b ) { 
        return a.insert_pos - b.insert_pos;
    } );
    
    var buffers = [], i = -1, len = edits.length, lastPos = 0;
    
    while( ++i < len ) {
        var edit = edits[i];
        buffers.push( code.substring( lastPos, edit.insert_pos ) );
        buffers.push( edit.content );
        lastPos = edit.insert_pos;
    }
    
    if( lastPos < code.length ) {
        buffers.push( code.substring( lastPos, code.length ) );
    }   

    return buffers.join( "" );
}

function add( funcID, pos, profileFunc ) {
}

function enterFn( funcID, node ) { 
    return { insert_pos: node.to + 1, content: "\tString __fid='" + funcID + "'; Dynamic __prf=$Pflr;__prf.I(__fid)\n" }; 
}

function exitFn( code, node ) {
    var indent = findIndent( code, node.from );
    return { insert_pos: node.from, content: "\t__prf.O(__fid)\n" }; 
} 

function returnFn( code, node ) {
    var indentStr = findIndent( code, node.from );
    
    // if the return value is not a simple value, first store it in a temporary variable before returning...

    if( isSimpleOp( node.first ) ) {
        return { insert_pos: node.from, content: "__prf.O(__fid)\n" + indentStr };
    }
    
    //                                     ++++++++++      +++++++++++              ++++++++++++++++++++++++++++++++++++++++++        
    // convert: "return ( x() * y() )" to "Dynamic __return123131232 = ( x() * y() ); __prf.O(__fid); return __return123131232"
    
    var returnExprEnd = node.eos.from, 
        returnBegin = node.from,
        returnEnd = node.to,
        rTmpID = "" + returnBegin,
        tmpVar = "__return" + rTmpID;
    
    return [
        { insert_pos: returnEnd+1, content: rTmpID + "=" },
        { insert_pos: returnBegin, content: "Dynamic __" },
        { insert_pos: returnExprEnd, content: [ "; __prf.O(__fid); return ", tmpVar, "\n", indentStr ].join( '' ) }
    ];
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

function instrument( scriptPath, code, parseTree ) { 
    
    // walk the parse tree and add code at the beginning of each function definition, before 
    // each return function, and at the end of each function body.
    
    // walk the top level looking for functions...
    var edits = [],
        functions = util.isArray( parseTree ) ? parseTree : [ parseTree ];
        
    functions.forEach( function( node ) { 
        if( node.id === "function" ) { 
            var funcID = scriptPath + node.name;
            
            // instrument the start and end of the function
            edits.push( enterFn( funcID, node.start ) );
            
            var funcBody = util.isArray( node.second ) ? ( node.second || [] ) : [ node.second ];
            
            // instrument any returns in the body of the function.
            edits = edits.concat( instrumentReturns( code, funcBody ) );
            
            if( funcBody.length === 0 || ( funcBody[ funcBody.length - 1 ].id !== 'return' ) ) { 
                // instrument the exit of the function
                edits.push( exitFn( code, node.end ) );
            }
        }
    } );

    return applyEdits( code, edits );
}

function instrumentReturns( code, node ) {
    var edits = [], children = [];
    
    if( node.id === "return" ) {                
        return returnFn( code, node );
    }
    
    children = util.isArray( node ) ? node : util.compact( [ node.first, node.second, node.third, node.fourth ] );
    
    children.forEach( function( n ) { 
        edits = edits.concat( instrumentReturns( code, n ) );
    } );
    
    return edits;
} 

module.exports = instrument;