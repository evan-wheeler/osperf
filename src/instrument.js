// instrument.js

function compact(array) {
    var index = -1,
        length = array ? array.length : 0,
        result = [];

    while (++index < length) {
        var value = array[index];
        if (value) result.push(value);
    }
    return result;
}

var isArray = Array.isArray || function(arg) {
    return Object.prototype.toString.call(arg) === '[object Array]';
};
  
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
    return { insert_pos: node.to + 1, content: "\t$Pflr.I('" + funcID + "')\n" }; 
}

function exitFn( funcID, node ) {
    return { insert_pos: node.from, content: "\t$Pflr.O('" + funcID + "')\n" }; 
}

function returnFn( funcID, node ) {
    return { insert_pos: node.from, content: "$Pflr.O('" + funcID + "');" }; 
}

function instrument( scriptPath, code, parseTree ) { 
    
    // walk the parse tree and add code at the beginning of each function definition, before 
    // each return function, and at the end of each function body.
    
    // walk the top level looking for functions...
    var edits = [],
        functions = isArray( parseTree ) ? parseTree : [ parseTree ];
        
    functions.forEach( function( node ) { 
        if( node.id === "function" ) { 
            var funcID = scriptPath + node.name;
            
            // instrument the start and end of the function
            edits.push( enterFn( funcID, node.start ) );
            
            var funcBody = isArray( node.second ) ? ( node.second || [] ) : [ node.second ];
            
            // instrument any returns in the body of the function.
            edits = edits.concat( instrumentReturns( funcID, funcBody ) );
            
            if( funcBody.length === 0 || ( funcBody[ funcBody.length - 1 ].id !== 'return' ) ) { 
                // instrument the exit of the function
                edits.push( exitFn( funcID, node.end ) );
            }
        }
    } );

    return applyEdits( code, edits );
}

function instrumentReturns( funcID, node ) {
    var edits = [], children = [];
    
    if( node.id === "return" ) { 
        return returnFn( funcID, node );
    }
    
    children = isArray( node ) ? node : compact( [ node.first, node.second, node.third, node.fourth ] );
    
    children.forEach( function( n ) { 
        edits = edits.concat( instrumentReturns( funcID, n ) );
    } );
    
    return edits;
} 

module.exports = instrument;