var Edits = module.exports = function Edits(initialValue) { 
    this.origValue = initialValue;
    this.edits = [];
};

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

Edits.prototype.apply = function applyEdits() { 
    var edits = this.edits,
        code = "" + this.origValue;

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
};

Edits.prototype.insert = function( str, beforeIndex, options ) { 
    options = options || {};
    
    if( options.indent ) { 
        var indent = findIndent( this.origValue, beforeIndex );
        
        if( options.indent === "after" ) { 
            str += indent;
        }
        else { 
            str = indent + str;
        }
    }

    this.edits.push( { insert_pos: beforeIndex, content: str } );
};